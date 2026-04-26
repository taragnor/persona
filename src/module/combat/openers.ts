import {StatusEffectId} from "../../config/status-effects.js";
import {OpenerPanel} from "../panels/openers-panel.js";
import {UsableListPanel} from "../panels/usable-list-panel.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaRoller} from "../persona-roll.js";
import {SidePanelManager} from "../side-panel/side-panel-manager.js";
import {lockObject} from "../utility/anti-loop.js";
import {randomSelect} from "../utility/array-tools.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {EngagementChecker} from "./engageChecker.js";
import {CombatPanel} from "./panels/combat-panel.js";
import {PersonaCombat, PersonaCombatant, PToken} from "./persona-combat.js";
import {PersonaTargetting} from "./persona-targetting.js";

export class OpenerManager {
  combat: PersonaCombat;
  static panel = new OpenerPanel();
  static OPENER_MSG_ID_FLAG = "openerMsgId" as const;

  static OPENING_ACTION_FLAG_NAME = "openingActionData" as const;
  static OPENING_CHAT_NAME = "openerChatMsgId" as const;
  constructor(combat: PersonaCombat) {
    this.combat = combat;
  }

  get panel() : OpenerPanel {
    return OpenerManager.panel;
  }

  private async getOpenerMsg(combatant: PersonaCombatant, data: OpenerOptionsGroups[], rollTotal: number): Promise<string> {
    try {
      const openerMsg = await foundry.applications.handlebars.renderTemplate('systems/persona/parts/openers-list.hbs', {roll: rollTotal, openers: data, combatant});
      return openerMsg;
    } catch (e) {
      PersonaError.softFail("Problem with rendering Opener", e);
      return"ERROR";
    }
  }

  async storeOpenerChatMsg(msgId: U<ChatMessage["id"]>) {
    if (!msgId) {
      await this.combat.unsetFlag("persona", OpenerManager.OPENING_CHAT_NAME);
      return;
    }
    await this.combat.setFlag("persona", OpenerManager.OPENING_CHAT_NAME, msgId);
  }

  get chatMessage() : U<ChatMessage> {
    const msgId= this.combat.getFlag<ChatMessage["id"]>("persona", OpenerManager.OPENING_CHAT_NAME);
    if (!msgId) {return undefined;}
    return game.messages.get(msgId);
  }


  async onEndCombat() {
    await PersonaError.asyncErrorWrapper(
      async () => await this.clearOpenerChoices()
    );
  }

  async onEndTurn() {
    //this may be run by PCs so can't do any GM functions
    void this.panel.pop();
    if (game.user.isGM) {
      await this.clearOpenerChoices();
    }
  }

  private async storeOpenerChoices (openingReturn: OpenerOptionsGroups[]) {
    console.log("Openers choices stored");
    Debug(openingReturn);
    await this.combat.setFlag("persona", OpenerManager.OPENING_ACTION_FLAG_NAME, openingReturn);
  }

  private async clearOpenerChoices()  {
    if (!game.user.isGM) {
      PersonaError.softFail(`${game.user.name} trying to clear Opener Choices, this requires GM permissions`);
      return;
    }
    await this.combat.unsetFlag("persona", OpenerManager.OPENING_ACTION_FLAG_NAME);
    await this.storeOpenerChatMsg(undefined);
  }

  getOpenerChoices()  : readonly OpenerOptionsGroups[] {
    const choices = (this.combat.getFlag("persona", OpenerManager.OPENING_ACTION_FLAG_NAME) as OpenerOptionsGroups[]);
    if (typeof choices != "object" || !Array.isArray(choices))  {
      Debug (choices);
      return [];
    }
    return choices;
  }

  public async makeOpeningRoll() : Promise<Roll> {
    const openingRoll = await PersonaRoller.hiddenRoll();
    return openingRoll;
  }

  public async onOpeningRoll(rollTotal: number, combatant : U<PersonaCombatant> = PersonaCombat?.combat?.combatant ) : Promise< U<string>> {
    if (!combatant) {
      PersonaError.softFail("No combatnt to make opening roll wtih");
      return "ERROR";
    }
    const openingData = await this._execOpeningRoll(combatant, rollTotal);
    if (!openingData) {return undefined;}
    await this.storeOpenerChoices(openingData);
    return await this.getOpenerMsg(combatant, openingData, rollTotal);
  }

  private async _execOpeningRoll( combatant: PersonaCombatant, rollValue: number) : Promise<OpenerOptionsGroups[] | null> {
    const returns :OpenerOptionsGroups[]= [];
    if (this.combat.isSocial) {return null;}
    const actor = combatant.actor;
    if (!actor) {return null;}
    const situation = {
      rollType: "opener",
      user: actor.accessor,
      naturalRoll: rollValue,
      rollTags: ['opening'],
      rollTotal: rollValue,
      addedTags: [],
      DC: undefined,
      result: rollValue >= 11 ? "hit" : "miss",
    } satisfies SituationComponent.Roll;

    returns.push(
      await this.fadingRoll(combatant, situation),
      this.mandatoryOtherOpeners(combatant, situation),
      this.saveVsSleep(combatant),
      this.saveVsDizzy(combatant, situation),
      this.saveVsFear(combatant, situation),
      // this.saveVsDespair(combatant, situation),
      this.saveVsConfusion(combatant, situation),
      this.saveVsCharm(combatant, situation),
      this.rageOpener(combatant, situation),
      this.disengageOpener(combatant, situation),
      this.otherOpeners(combatant, situation),
    );
    const mandatory = returns.find(r => r.options.some( o=> o.mandatory));
    if (mandatory) {
      return  [{
          msg: mandatory.msg,
          options: [mandatory.options.find(x=> x.mandatory)!],
        }];
    };
    const data = returns.filter(x=> x.msg.length > 0);
    return data;
  }

  private async fadingRoll( combatant: Combatant<ValidAttackers> , situation: SituationTypes.Roll) : Promise<OpenerOptionsGroups> {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    if (!situation.rollTags?.includes('opening')) {return {msg, options};}
    const actor = combatant.actor;
    if (
      !actor
      || actor.hp > 0
      || actor.isShadow()
    ) {return  {msg, options}; }
    if (!actor.isUsingMetaPod()) {
      msg.push(`${combatant.name} is currently downed (no safety systems)`);
      options.push({
        combatant: combatant.id,
        optionName: 'Lie there helplessly (fight in spirit only)',
        mandatory: true,
        optionEffects: ['fightInSpirit'],
      });
      return { msg, options};
    }
    if (actor.hasStatus('full-fade')) {
      msg.push(`${combatant.name} is completely faded...`);
      options.push({
        combatant: combatant.id,
        optionName: 'Completely Faded (Help in Spirit only)',
        mandatory: true,
        optionEffects: ['fightInSpirit'],
      });
      return { msg, options};
    }
    const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'fading');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Fading (${saveTotal}) -->`);
    switch (true) {
      case situation.naturalRoll == 20
          && (actor as PC).getSocialSLWithTarot('Star') >= 3: {
            msg.push('Critical Success');
            options.push({
              combatant: combatant.id,
              optionName: 'Star Benefit ( get up at 1 HP)',
              mandatory: true,
              optionEffects: ['revive'],
            });
            break;
          }
      case (saveTotal >= 11):{
        msg.push('Success');
        options.push({
          combatant: combatant.id,
          optionName: `${actor.hasStatus('fading') ? 'Barely ' : ''}Hanging On (Help in Spirit Only)`,
          mandatory: true,
          optionEffects: ['fightInSpirit'],
        });
        break;
      }
      default: {
        msg.push('Failure');
        await actor.increaseFadeState();
        const fadeState = actor.hasStatus('fading') ? 'Starting to Fade Away' : 'Fully Fade Away (Ejected from Metaverse)';
        options.push({
          combatant: combatant.id,
          optionName: `${fadeState} (Help in Spirit Only)`,
          mandatory: true,
          optionEffects: ['fightInSpirit'],
        });
        break;
      }
    }
    return { msg, options};
  }

  private mandatoryOtherOpeners( combatant: PersonaCombatant, situation: SituationComponent.Roll): OpenerOptionsGroups {
    let options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    if (!combatant.actor) {return { msg, options};}
    const mandatoryActions = combatant.actor.openerActions.filter( x=> x.hasTag('mandatory', combatant.actor));
    const usableActions = mandatoryActions
      .filter( action => {
        const useSituation = {
          rollTags: situation.rollTags,
          naturalRoll: situation.naturalRoll,
          rollTotal: situation.rollTotal,
          result: situation.result,
          addedTags: situation.addedTags,
          user: situation.user,
          target: situation.user,
          usedPower: action.accessor,
        } satisfies Situation;
        return action.testOpenerPrereqs(useSituation, combatant.actor);
      });
    options = usableActions
      .flatMap( action =>  {
        const possibleTargets= this.combat.combatants.contents.filter (x=> PersonaCombat.isPersonaCombatant(x));
        const targets= PersonaTargetting.getValidTargetsFor(action, combatant, possibleTargets, situation);
        if (targets.length == 0) {return [];}
        return [{
          combatant: combatant.id,
          mandatory: action.hasTag('mandatory', combatant.actor),
          optionName: action.name,
          toolTip: action.system.description,
          optionEffects: []
        }] satisfies OpenerOption[];
      });
    if (options.length > 0) {
      msg.push('Special Actions');
    }
    return {msg, options};
  }

  private saveVsSleep( combatant: Combatant<ValidAttackers>) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    if (!combatant?.actor?.hasStatus('sleep'))  {
      return {msg, options};
    }
    msg.push('Sleeping');
    options.push({
        combatant: combatant.id,
      optionName: 'Sleep Soundly (No fight in spirit)',
      mandatory: true,
      optionEffects: ['skipTurn'],
    });
    return {msg, options};
  }

  private saveVsDizzy( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'dizzy');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Dizzy (${saveTotal}) -->`);
    if (saveTotal >= 6){
      msg.push('Success');
      return {msg, options};
    }
    msg.push('Do Nothing (Miss Turn)');
    options.push({
      optionName: 'Why is Everything Spinning?',
        combatant: combatant.id,
      mandatory: true,
      optionEffects: ['skipTurn'],
    });
    return {msg, options};
  }

  private saveVsFear( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'fear');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Fear (${saveTotal}) -->`);
    switch (true) {
      case (saveTotal >= 11):{
        msg.push('Success');
        break;
      }
      case (saveTotal <= 2) : {
        msg.push('Failure (Flee)');
        options.push({
          optionName: 'Flee from Combat',
          mandatory: true,
        combatant: combatant.id,
          optionEffects: ['skipTurn'],
        });
        break;
      }
      default:
        msg.push('Failure (Miss Turn)');
        options.push({
          optionName: 'Cower in Fear (Miss Turn)',
        combatant: combatant.id,
          mandatory: true,
          optionEffects: ['skipTurn'],
        });
    }
    return {msg, options};
  }

  private rageOpener( combatant: Combatant<ValidAttackers> , _situation: Situation) : OpenerOptionsGroups {
    const msg : string[] = [];
    const options : OpenerOptionsGroups['options'] = [];
    if (combatant?.actor?.hasStatus('rage')) {
      msg.push('Battle Rage');
      options.push({
        optionName: 'Attack random enemy',
        combatant: combatant.id,
        mandatory: true,
        optionEffects: ['attackRandomEnemy'],
      });
    }
    return {msg, options};
  }

  private saveVsConfusion ( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'confused');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Confusion (${saveTotal}) -->`);
    switch (true) {
      case (saveTotal >= 11):{
        msg.push('Success');
        break;
      }
      case (saveTotal <= 2):{
        msg.push('Failure (Miss Turn + lose 10% Resources)');
        options.push({
          optionName: 'Throw Away Money (Miss Turn + lose 10% Resources)',
        combatant: combatant.id,
          mandatory: true,
          optionEffects: ['throw-away-money', 'skipTurn'],
        });
        break;
      }
      default:
        msg.push('Failure (Miss Turn)');
        options.push({
          optionName: 'Stand around confused (Miss Turn)',
        combatant: combatant.id,
          mandatory: true,
          optionEffects: ['skipTurn'],
        });
    }
    return {msg, options};
  }

  private saveVsCharm ( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'charmed');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Charm (${saveTotal}) -->`);
    switch (true) {
      case (saveTotal >= 16): {
        msg.push('Success (Remove Charm)');
        options.push({
          optionName: 'Clear Charm and act normally (Lose opening action)',
          mandatory: true,
        combatant: combatant.id,
          optionEffects: [],
        });
        void combatant.actor?.removeStatus("charmed");
        break;
      }
      case (saveTotal >= 11): {
        msg.push('Partial Success');
        options.push({
          optionName: 'Act normally but charm remains (lose opening action)',
          mandatory: true,
        combatant: combatant.id,
          optionEffects: [],
        });
        break;
      }
      case (saveTotal < 6) : {
        msg.push('Failure (Buff, Heal or attack)');
        options.push({
          optionName: 'Charmed',
          toolTip: 'The enemy chooses your action , causing you to cast a single target healing or buffing effect on an enemy or making a basic attack against an ally',
          mandatory: true,
        combatant: combatant.id,
          optionEffects: [],
        });
        break;
      }
      default:
        msg.push('Failure (Basic Attack)');
        options.push({
          optionName: "Basic Attack against an ally of the enemy's choice",
          mandatory: true,
        combatant: combatant.id,
          optionEffects: ['attackAlly'],
        });
    }
    return {msg, options};
  }

  private disengageOpener( combatant: PersonaCombatant, situation: SituationComponent.Roll) :OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const rollValue = situation.naturalRoll ?? -999;
    if (!situation.rollTags?.includes('opening')) {return {msg, options};}
    if (!combatant.actor?.isCapableOfAction()
      || combatant.actor?.hasStatus('challenged')
    ) {
      return {msg, options};
    }
    const accessor = PersonaDB.getUniversalTokenAccessor(combatant.token as PToken);
    if (!this.combat.isEngagedByAnyFoe(accessor)) {
      const ret : OpenerOptionsGroups = {
        msg, options
      };
      return ret;
    }
    const alliedDefenders = this.combat.getAlliedEngagedDefenders(accessor);
    if (alliedDefenders.length > 0) {
      msg.push(`Can Freely disengage thanks to ${alliedDefenders.map(x=> x.name).join(', ')}`);
      return {msg, options};
    }
    if (!combatant.actor) {return { msg, options};}
    const disengageBonus = combatant.actor.persona().getBonuses('disengage').total(situation);
    const disengageTotal = disengageBonus + rollValue;
    msg.push( `Disengage Total: ${disengageTotal}`);
    switch (true) {
      case disengageTotal >= 16 :
        options.push( {
          optionName: 'Expert Disengage',
          optionEffects: ['disengage'],
        combatant: combatant.id,
          mandatory: false,
        });
        break;
      case disengageTotal >= 11: {
        const enemyDefenders = this.combat.getEnemyEngagedDefenders(combatant);
        if (enemyDefenders.length == 0) {
          options.push( {
            optionName: 'Standard Disengage',
            optionEffects: ['disengage'],
        combatant: combatant.id,
            mandatory: false,
          });
        }
        break;
      }
    }
    return { msg, options};
  }

  // private saveVsDespair ( combatant: Combatant<ValidAttackers> , situation: RollSituation<Situation>) : OpenerOptionsGroups {
  //   const options : OpenerOptionsGroups['options'] = [];
  //   const msg : string[] = [];
  //   const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'despair');
  //   if (saveTotal == undefined) {
  //     return {msg, options};
  //   }
  //   msg.push(`Resisting Despair (${saveTotal}) -->`);
  //   switch (true) {
  //     case (saveTotal >= 11):{
  //       msg.push('Success');
  //       break;
  //     }
  //     default:
  //       msg.push('Failure (Miss Turn)');
  //       options.push({
  //         optionName: 'Wallow in Despair (Miss Turn)',
  //         mandatory: true,
  //       combatant: combatant.id,
  //         optionEffects: ['skipTurn'],
  //       });
  //   }
  //   return {msg, options};
  // }

  private otherOpeners( combatant: PersonaCombatant, situation: SituationComponent.Roll): OpenerOptionsGroups {
    let options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const actor = combatant.actor;
    if (!actor) {return { msg, options};}
    if (!actor.isCapableOfAction()) {
      return {msg, options};
    }
    const openerActions = actor.openerActions;
    const usableActions = openerActions
      .filter( action => {
        const useSituation = {
          // ...situation,
          rollTags: situation.rollTags,
          naturalRoll: situation.naturalRoll,
          rollTotal: situation.rollTotal,
          result: situation.result,
          addedTags: situation.addedTags,
          user: situation.user,
          target: situation.user,
          usedPower: action.accessor,
        } satisfies Situation;
        if (!actor.persona().canPayActivationCost(action)) {return false;}
        return action.testOpenerPrereqs(useSituation, combatant.actor);
      });
    options = usableActions
      .flatMap<OpenerOption>( action =>  {
        const possibleTargets= this.combat.combatants.contents.filter (x=> PersonaCombat.isPersonaCombatant(x));
        const targets= PersonaTargetting.getValidTargetsFor(action, combatant, possibleTargets);
        if (targets.length == 0) {return [];}
        // const printableName = this.getOpenerPrintableName(action, targets);
        return [{
          mandatory: action.hasTag('mandatory', combatant.actor),
          combatant: combatant.id,
          optionName: action.name,
          toolTip: action.system.description,
          // optionTxt: printableName ?? "",
          optionEffects: [],
          power: {
            powerId: action.id,
            targets: action.requiresTargetSelection() ? targets.map( x=> x.id): undefined,
          }
        }] satisfies OpenerOption[];
      });
    if (options.length > 0) {
      msg.push('Other Available Options');
    }
    return {msg, options};
  }

  mockOpeningSaveTotal( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll, status: StatusEffectId) : number | undefined {
    const rollValue = situation.naturalRoll ?? -999;
    if (!combatant.actor) {return undefined;}
    const statusEffect = combatant.actor.getStatus(status);
    if (!statusEffect && status != 'fading') {return undefined;}
    const saveSituation = {
      ...situation,
      saveVersus: status
    } satisfies Situation;
    const saveBonus = combatant.actor.persona().getBonuses('save').total(saveSituation);
    return saveBonus + rollValue;
  }

  async _onOpenerSelect (ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    await lockObject(this, async () => {
      const groupIndex = Number(HTMLTools.getClosestData(ev, "groupIndex"));
      const openerIndex = Number(HTMLTools.getClosestData(ev, "openerIndex"));
      const targetIndex = Number(HTMLTools.getClosestDataSafe(ev, "targetIndex", -1));
      if (Number.isNaN(targetIndex) || targetIndex == -1) {
        await PersonaCombat.combat?.openers.execOpeningOption(groupIndex,  openerIndex);
        return;
      }
      await PersonaCombat.combat?.openers.execOpeningOption( groupIndex, openerIndex, targetIndex);
    }, {
      "inUseMsg":"already doing another opener",
      "timeoutMs": UsableListPanel.USE_POWER_TIMEOUT
    } );

  }

  activateListeners(html: JQuery) {
    html.find(".opener-selector .option-target").on("click", (ev) => void this._onOpenerSelect(ev));
    html.find(".opener-selector button.auto-option").on("click", (ev) => void this._onOpenerSelect(ev));
  }

  async cleanUpAfterOpener() {
    await this.panel.pop();
    // await this.clearOpenerChoices();
  }

  async modifyOpenerMsg( opener: OpenerOption) {
    const msg = this.chatMessage;
    if (!msg) {return;}
    const choice = $(`<div class='opener-choice'>
      <span>Chosen Opener:</span>
      <span>${opener.optionName}</span>
      </div>`);
    const targetToReplace = $(msg.content).find('.opener-choices');
    const replacedData = targetToReplace.empty();
    replacedData.append(choice);
    const newContent = replacedData
      .parents().last().html();
    if (newContent) {
      await msg.update( {'content': newContent});
    }
  }

  async onUpdateCombat(diffObject: FlagChangeDiffObject) : Promise<boolean> {
    //Check for opening changes
    if (diffObject?.flags?.persona?.openingActionData) {
      await this.combat.openers.requestOpenerChoice();
      return true;
    }
    return false;
  }

  static getMandatory(data: readonly OpenerOptionsGroups[]) : N<{group: OpenerOptionsGroups, option: OpenerOption}> { const group = data
      .find(r => r.options
        .some( o=> o.mandatory)
      );
    if (!group) {return null;}
    const option = group.options
      .find(o => o.mandatory)!;
    return {group, option};
  }


  async requestOpenerChoice() {
    console.log("Requesting Opener Choice");
    const comb = this.combat.combatant;
    if (!comb) { return; }
    if (!comb.actor.isOwner) { return; }
    if (game.user.isGM && comb.actor.hasActivePlayerOwner) { return; }
    const choices = this.getOpenerChoices();
    if (choices.length == 0) {return;}
    await CombatPanel.instance.setTarget(comb.token);
    await CombatPanel.instance.activate();
    const mandatory = OpenerManager.getMandatory(choices);
    if (mandatory) {
      console.log("Executing Mandatory Opener");
      await this._execOpener(mandatory.option);
      return;
    }
    this.panel.setOpenerList(comb, choices);
    await SidePanelManager.push(this.panel);
  }

  async execOpeningOption( groupIndex: number, openerIndex: number, targetIndex?: number) : Promise<void> {
    const choices = this.getOpenerChoices();
    const option = choices[groupIndex].options[openerIndex];
    if (!option) {
      PersonaError.softFail(`Can't find Opener option at group ${groupIndex}, option ${openerIndex}, `, choices);
      return;
    }
    await this._execOpener(option, targetIndex);
  }

  private validateCombatant(combatant: U<Combatant<ValidAttackers>>) : combatant is PersonaCombatant {
    if (!combatant || !PersonaCombat.isPersonaCombatant(combatant)) {
      PersonaError.softFail("Couldn't find Combatant to execute Opening Option");
      return false;
    }
    if (!combatant.isOwner) {
      PersonaError.softFail("You don't own this combatant");
      return false;
    }
    if (!this.combat.turnCheck(combatant.actor)) {
      PersonaError.softFail(`${combatant.name} is not currently able to take actions (Out of Turn Action?)`);
      return false;
    }
    return true;
  }

  private async _execOpener(option: OpenerOption, targetIndex ?: number) {
    const combatant = this.combat.combatants.find(c=> c.id == option.combatant);
    if (!this.validateCombatant(combatant)) {
      return;
    }
    await this.modifyOpenerMsg (option);
    if (option.power != undefined) {
      await this.execOpenerPower(combatant, option.power, targetIndex);
    } else {
      await this.simpleOpenerMsg(combatant, option);
    }
    await this.cleanUpAfterOpener();
    await this.processOptionEffects(combatant, option.optionEffects);

  }

  async execOpenerPower(combatant: PersonaCombatant, powerData: NonNullable<OpenerOption["power"]>, targetIndex ?: number) {
    const {powerId, targets} = powerData;
    const targetId =
      targetIndex != undefined
      && targetIndex >= 0
      && targets != undefined
      && targets.length > 0 ? targets[targetIndex]: undefined;
    const power = combatant.actor.openerActions
      .find( pwr=> pwr.id == powerId)
      ?? (combatant.actor.items.find( item=> item.id == powerId));
    if (!power || !power.isUsableType()) {
      PersonaError.softFail(`Couldn't find power id :${powerId} to execute opener`);
      return;
    }
    const resolvedTargets = targets != undefined
      ? this.combat.combatants
      .filter(comb => comb.id == targetId)
      .map(comb => comb?.token as PToken)
      : undefined;
    await this.combat.combatEngine.usePower(combatant.token, power, resolvedTargets);
  }

  async simpleOpenerMsg(combatant: PersonaCombatant, opener: OpenerOption ) {
    const content = `${combatant.name} takes opening action: ${opener.optionName ?? "Unnamed Choice"}`;
    const messageData: MessageData = {
      speaker: {
        token: combatant.token.id,
        actor: combatant.actor.id,
      },
      content: content,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    };
    await ChatMessage.create(messageData, {});
  }


  async processOptionEffects( combatant: PersonaCombatant, optionEffects: OptionEffect[]) {
    for (const effect of optionEffects) {
      switch (effect) {
        case "disengage":
          break;
        case "skipTurn":
          await this.combat.endTurn(combatant);
          break;
        case "fightInSpirit":
          break;
        case "revive":
          await combatant.actor.setHP(1);
          break;
        case "attackRandomEnemy": {
          const engaged = EngagementChecker.listOfCombatantsInMelee(combatant, this.combat)
          .filter( comb => comb.actor.getAllegiance() != combatant.actor.getAllegiance());
          const targets = engaged.length > 0 ? engaged.map( x=> x.token) : this.combat.getAllEnemiesOf(combatant.token).filter (x=> x.actor.isAlive());
          const choice = randomSelect(targets);
          await this.combat.combatEngine.usePower(combatant.token, combatant.actor.basicAttack, [choice]);
          break;
        }
        case "attackAlly": {
          const engaged = EngagementChecker.listOfCombatantsInMelee(combatant, this.combat)
          .filter( comb => comb.actor.getAllegiance() == combatant.actor.getAllegiance());
          const targets = engaged.length > 0 ? engaged.map( x=> x.token) : PersonaCombat.getAllAlliesOf(combatant.token).filter (x=> x.actor.isAlive() && x != combatant.token);
          const choice = randomSelect(targets);
          await this.combat.combatEngine.usePower(combatant.token, combatant.actor.basicAttack, [choice]);
          break;
        }
        case "throw-away-money": {
          if (!combatant.actor.isPC()) {break;}
          const thrownAmt = Math.round(combatant.actor.money * 0.10);
          await combatant.actor.spendMoney(thrownAmt);
          break;
        }
        default:
          effect satisfies never;
          break;
      }
    }
  }

}

export type OpenerOptionGroup = OpenerOptionsGroups;

type OpenerOptionsGroups = {
  msg: string[],
  options: OpenerOption[]
}

export type OpenerOption = {
  mandatory: boolean,
  combatant: PersonaCombatant["id"],
  optionName: string,
  optionEffects: OptionEffect[],
  toolTip ?: string,
  power ?: {
    powerId: Power['id'],
    /** Only included if power has selectable targets, and lists a list of possible legal targets */
    targets: PersonaCombatant["id"][] | undefined,
  }
}

interface OptionEffects {
  'disengage': string;
  'skipTurn': string;
  'fightInSpirit': string;
  'revive': string;
  'attackRandomEnemy': string;
  'attackAlly': string;
  'throw-away-money': string;
}

type OptionEffect = keyof OptionEffects;


export type FlagChangeDiffObject = {
  flags ?: {
    persona?: CombatFlags
  }
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface CombatFlags extends Record<typeof OpenerManager["OPENING_ACTION_FLAG_NAME"], OpenerOption[]> {
  }
}

