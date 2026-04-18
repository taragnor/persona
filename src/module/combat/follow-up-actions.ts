import {StatusEffect} from "../../config/consequence-types.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {RollSituation} from "../../config/situation.js";
import {FollowUpPanel} from "../panels/follow-up-panel.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {SidePanelManager} from "../side-panel/side-panel-manager.js";
import {PersonaSocial} from "../social/persona-social.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {FlagChangeDiffObject} from "./openers.js";
import {CombatPanel} from "./panels/combat-panel.js";
import {PersonaCombat, PersonaCombatant, PToken} from "./persona-combat.js";
import {PersonaTargetting} from "./persona-targetting.js";

export class FollowUpManager {
  combat: PersonaCombat;
  static panel : FollowUpPanel = new FollowUpPanel();

  static FOLLOW_UP_DATA_FLAG_NAME= "followUpChoices" as const;

  constructor(combat: PersonaCombat) {
    this.combat  = combat;
  }

  get panel(): FollowUpPanel {
    return FollowUpManager.panel;
  }

  async onFollowUpAction(token: PToken, activationRoll: number) {
    console.debug('Calling On Follow Up Action');
    const combatant = token.object ? this.combat.getCombatantByToken(token): null;
    if (!combatant || !combatant.actor || !PersonaCombat.isPersonaCombatant(combatant)) {return;}
    if (combatant.actor && combatant.actor.hasStatus('down')) {return;}
    const list = this.usableFollowUpsList(combatant, activationRoll);
    // await CombatPanel.instance.setFollowUpChoices(combatant, list);
    await this.panel.setFollowUps(list);
    await CombatPanel.instance.setTarget(token);
    await SidePanelManager.push(this.panel);
    if (PersonaSettings.get("followUpToChat")) {
      await this.sendFollowUpsToChat(list);
    }
  }

  private async sendFollowUpsToChat(list: FollowUpActionData[]) {
    const templateData = {
      followUps : list
    };
    const msg = await foundry.applications.handlebars.renderTemplate("systems/persona/parts/combat-panel-follow-up-list.hbs", templateData);
    const messageData: MessageData = {
      speaker: {alias: 'Follow Up Action'},
      content: msg,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    };
    await ChatMessage.create(messageData);
  }

  private usableFollowUpsList(combatant: PersonaCombatant, activationRoll: number) : FollowUpActionData[] {
    return [
      // ...this.actAgain(),
      ...this.allOutCheck(combatant),
      ...this.personalFollowUps(combatant, activationRoll),
      ...this.teamWorkActions(combatant, activationRoll)];
  }

  actAgain() : FollowUpActionData[] {
    return [{
      type: "act-again"
    }];
  }

  teamWorkActions(combatant: PersonaCombatant, activationRoll: number) : FollowUpActionData[] {
    const allies = this.combat.getAllies(combatant as Combatant<ValidAttackers>)
      .filter (ally => ally.actor?.canTakeFollowUpAction());
    const validTeamworkMoves : FollowUpActionData[] = allies
      .flatMap( ally => {
        if (ally == combatant) {return [];}
        const actor = ally.actor;
        if (!actor || !actor.teamworkMove ) {return [];}
        if (!actor.persona().canUsePower(actor.teamworkMove, false)) {return [];}
        const situation : CombatRollSituation = {
          attacker: actor.accessor,
          naturalRoll: activationRoll,
          rollTags: ['attack', 'activation'],
          rollTotal : activationRoll,
          user: actor.accessor,
        };
        if (!actor.teamworkMove.testTeamworkPrereqs(situation, actor)) {return [];}
        const targets = PersonaTargetting.getValidTargetsFor(actor.teamworkMove, combatant, situation);
        if (targets.length == 0) {return [];}
        return [{
          combatant,
          type :"teamwork",
          teammate: ally,
          power: actor.teamworkMove,
          name: `${actor.teamworkMove.name}`,
        }] satisfies FollowUpActionData[];
      });
    return validTeamworkMoves;
  }

  personalFollowUps(combatant: PersonaCombatant, activationRoll: number): FollowUpActionData[] {
    const followUps : FollowUpActionData[] = this.getUsableFollowUps(combatant.token, activationRoll).map( pwr=> {
      const legalTargets = pwr.targeting().getValidTargetsFor(combatant);
      if (legalTargets.length == 0) { return undefined; }
      const targetNames = legalTargets
        .map (x=> x.name)
        .join (" ,");
      if (pwr.requiresTargetSelection()) {
        return {
          combatant: combatant,
          power: pwr,
          type: "power",
          targetChoices: legalTargets,
          name: `${pwr.name}`,
        } satisfies FollowUpActionData;
      }
      return {
        type : "area-power",
        power: pwr,
        combatant: combatant,
        name: `${pwr.name} (${targetNames})`,
      } satisfies FollowUpActionData;
    } )
      .filter (x=> x != undefined);
    return followUps;
  }

  allOutCheck(combatant: PersonaCombatant) : FollowUpActionData[] {
    const allout = (this.combat.getAllEnemiesOf(combatant.token)
      .every(enemy => enemy.actor.hasStatus('down'))
      && combatant.actor.canAllOutAttack());
    if (!allout) {return [];}
    const allOutAttack = PersonaDB.getBasicPower("All-out Attack");
    if (!allOutAttack) {
      PersonaError.softFail("Couldn't find All out attack");
      return [];
    }
    return [ {
      type: "area-power",
      name: allOutAttack.displayedName,
      power: allOutAttack,
      combatant: combatant,
    } ];
  }

  private	getUsableFollowUps(token: PToken, activationRoll: number) : Power []{
    const combatant = token.object ? this.combat.getCombatantByToken(token): null;
    if (!combatant || !combatant.actor) {return [];}
    const actor = combatant.actor;
    const situation : CombatRollSituation = {
      naturalRoll: activationRoll,
      rollTags: ['attack', 'activation'],
      rollTotal: activationRoll,
      user: actor.accessor,
    };
    const persona = actor.persona();
    const followUpMoves = actor.powers
      .filter(pwr => pwr.isFollowUpMove()
        && persona.canPayActivationCost(pwr)
        && pwr.testFollowUpPrereqs(situation, actor)
      );
    return followUpMoves;
  }

  static checkForFollowUpChanges(diffObject: FlagChangeDiffObject) : boolean {
    if (diffObject?.flags?.persona?.followUpChoices) {
      return true;
    }
    return false;
  }

  /** retunr true if selected else false if fails */
  async chooseFollowUp(ev: JQuery.ClickEvent) :Promise<boolean> {
    if (!PersonaCombat.combat || !PersonaCombat.combat.combatant?.isOwner) {
      ui.notifications.warn("Can't act now, its not your turn");
      return false;
    }
    const combatantId = HTMLTools.getClosestData<PersonaCombatant["id"]>(ev, "combatantId");
    const powerId = HTMLTools.getClosestData<Power["id"]>(ev, "powerId");
    const combatant = this.combat.combatants.get(combatantId);
    if (!combatant  || !PersonaCombat.isPersonaCombatant(combatant)) {
      PersonaError.softFail("combatnat isn't a real Combatant");
      return false;
    }
    if (combatant != this.combat.combatant) {
      return await this.requestOther(combatant, powerId);
    }
    return await this.execPersonalPower(combatant, powerId);
  }

  private async execPersonalPower(combatant : PersonaCombatant, powerId: Power["id"]) : Promise<boolean>{
    const usable = combatant.actor.powers.find( pwr => pwr.id == powerId) ?? combatant.actor.items.find( item => item.id == powerId);
    if (!usable || !usable.isUsableType()) {
      PersonaError.softFail(`can't find Usable ${powerId}`);
      return false;
    }
    try{
      await this.combat.combatEngine.usePower(combatant.token, usable);
      return true;
    } catch (e) {
      Debug(e);
    }
    return false;
  }

  private async requestOther(combatant: PersonaCombatant, _powerId: Power["id"]): Promise<boolean> {
    const actingCharacter= this.combat.combatant!;
    const msg = `${actingCharacter.name} hands over control to ${combatant.name} to execute their teamwork move!`;
    const messageData: MessageData = {
      speaker: {alias: 'Follow Up Action'},
      content: msg,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    };
    await ChatMessage.create(messageData, {});
    return true;
  }


  activateListeners(html: JQuery) {
    html.find(".follow-ups button.area-buton").on("click", (ev) => void this._onAreaPowerFollowUp(ev));
    html.find(".follow-ups .follow-up button.target").on("click", (ev) => void this._onSingleTargetFollowUp(ev));
    html.find(".follow-ups .teamwork-follow-up button.teamwork").on("click", (ev) => void this._onTeamworkMove(ev));
  }

  private getCombatant(ev: JQuery.Event): PersonaCombatant {
    const combatantId = HTMLTools.getClosestData(ev, "combatantId");
    const combat = this.combat;
    const comb =combat?.combatants.find(c => c.id == combatantId) as PersonaCombatant;
    if (!combat  || !comb) {throw new PersonaError(`Can't find combatnat ${combatantId}`);}
    return comb;
  }
  private getPowerAndCombatant(ev: JQuery.Event)  {
    // const combatantId = HTMLTools.getClosestData(ev, "combatantId");
    const powerId = HTMLTools.getClosestData(ev, "powerId");
    const comb = this.getCombatant(ev);
    // const comb =combat?.combatants.find(c => c.id == combatantId) as PersonaCombatant;
    // if (!combat  || !comb) {throw new PersonaError(`Can't find combatnat ${combatantId}`);}
    const power = comb.actor.persona().powers.find(x=> x.id == powerId && x.isUsableType()) ?? comb.actor.items.find(x=> x.id == powerId && x.isUsableType()) as U<Usable>;
    if (!power) {
      throw new PersonaError(`Can't find power ${powerId} on ${comb.actor.name}`);
    }
    return {power, comb};
  }

  private async _onAreaPowerFollowUp(ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    const {power, comb} = this.getPowerAndCombatant(ev);
    // await CombatPanel.instance.setMode("main");
    await this.combat.combatEngine.usePower(comb.token, power);
    await this.panel.pop();
  }

  private async _onSingleTargetFollowUp (ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    const {power, comb} = this.getPowerAndCombatant(ev);
    const target = this.getPowerTarget(ev);
    // await CombatPanel.instance.setMode("main");
    await this.combat.combatEngine.usePower(comb.token, power, [target.token]);
    await this.panel.pop();
  }

  private async _onTeamworkMove(ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    const comb = this.getCombatant(ev);
    const teammateId = HTMLTools.getClosestData(ev, "teammateId");
    const combat = this.combat;
    const teammate =combat?.combatants.find(c => c.id == teammateId) as PersonaCombatant;
    if (!combat  || !teammate) {throw new PersonaError(`Can't find combatnat target ${teammateId}`);}
    await this.callToTeammate(comb, teammate);
    if (teammate.isOwner) {
      await this.panel.pop();
      await this.prepareToActOnTeammateAction(teammate.actor, comb.actor);
      // await CombatPanel.instance.setTarget(teammate.token);
      await CombatPanel.instance.setMode("main");
      return;
    }
    if ( await this.combat?.callOnTeammateForTeamworkMove(teammate, comb.token )) {
      await this.panel.pop();
      // await CombatPanel.instance.setMode("main");
    }
  }

  async callToTeammate(initiator: PersonaCombatant, teammate: PersonaCombatant) {
    const txt = `${teammate.name}, you're up!`;
    void PersonaSocial.characterDialog(initiator.actor, txt) ;
    if (!PersonaSettings.debugMode() && initiator.actor.isPCLike() && teammate.actor.isPCLike()) {
      if (initiator.actor.isPC()) {
        await initiator.actor.addInspiration(teammate.actor, -1);
      }
    }
  }

  async prepareToActOnTeammateAction(actor: ValidAttackers, leader: U<ValidAttackers>) {
    const status : StatusEffect = {
      id: "teamwork-shift",
      duration: {
        dtype: "instant",
      }
    };
    if (!leader) {
      PersonaError.softFail("No leader specified for teamwork request");
    }
    if (!PersonaSettings.debugMode() && leader && actor.isPC() && leader.isPCLike()) {
        await actor.addInspiration(leader, -1);
    }
    await actor.addStatus( status);
    const msg = `${actor.name} seizes the opportunity for a Teamwork move!`;
    await PersonaSocial.characterDialog(actor, msg);
    await CombatPanel.instance.setMode("main");
  }


  private getPowerTarget(ev: JQuery.Event) : PersonaCombatant {
    const targetId = HTMLTools.getClosestData(ev, "targetCombatantId");
    const combat = this.combat;
    const target =combat?.combatants.find(c => c.id == targetId) as PersonaCombatant;
    if (!combat  || !target) {throw new PersonaError(`Can't find combatnat target ${targetId}`);}
    return target;
  }
}

export type FollowUpActionData = {
  type: "power",
  power: Usable,
  combatant: PersonaCombatant,
  targetChoices: PersonaCombatant[],
  name: string,
} | {
  type: "area-power",
  power:Usable,
  combatant: PersonaCombatant,
  name: string,
} | {
  type :"teamwork",
  combatant: PersonaCombatant,
  teammate: PersonaCombatant,
  power:Usable,
  name: string,
} | {
  type: "act-again";
};

type CombatRollSituation = RollSituation & Situation;


declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface CombatFlags extends Record<typeof FollowUpManager["FOLLOW_UP_DATA_FLAG_NAME"], FollowUpActionData[]> {
  }
}

