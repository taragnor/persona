import {StatusEffectId} from "../../config/status-effects.js";
import {OpenerPanel} from "../panels/openers-panel.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaRoller} from "../persona-roll.js";
import {SidePanelManager} from "../side-panel/side-panel-manager.js";
import {randomSelect} from "../utility/array-tools.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {EngagementChecker} from "./engageChecker.js";
import {PersonaCombat, PersonaCombatant, PToken} from "./persona-combat.js";
import {PersonaTargetting} from "./persona-targetting.js";

export class OpenerManager {
  combat: PersonaCombat;
  openerOptions: OpenerOption[] = [];
  static panel = new OpenerPanel();

  static OPENING_ACTION_FLAG_NAME = "openingActionData" as const;
  constructor(combat: PersonaCombat) {
    this.combat = combat;
  }

  get panel() : OpenerPanel {
    return OpenerManager.panel;
  }

  async printOpenerList(combatant: PersonaCombatant) : Promise< U<{openerMsg:  string, roll: Roll}>> {
    const openingReturn = await this.execOpeningRoll(combatant);
    if (openingReturn) {
      await this.storeOpenerChoices(openingReturn.data);
      const {data, roll} = openingReturn;
      const openerMsg = await foundry.applications.handlebars.renderTemplate('systems/persona/parts/openers-list.hbs', {roll, openers: data, combatant});
      return {
        openerMsg: openerMsg,
        roll: roll
      };
    }
  }

  async storeOpenerChoices (openingReturn: OpenerOptionsReturn[]) {
    const options = openingReturn.flatMap ( or => or.options);
    await this.combat.setFlag("persona", OpenerManager.OPENING_ACTION_FLAG_NAME, options);
  }

  getOpenerChoices()  : OpenerOption[] {
    return (this.combat.getFlag("persona", OpenerManager.OPENING_ACTION_FLAG_NAME) as OpenerOption[]) ?? [];
  }

  async execOpeningRoll( combatant: PersonaCombatant) : Promise<{data: OpenerOptionsReturn[], roll: Roll} | null> {
    const returns :OpenerOptionsReturn[]= [];
    if (this.combat.isSocial) {return null;}
    const actor = combatant.actor;
    if (!actor) {return null;}
    const openingRoll = await PersonaRoller.hiddenRoll();
    // const openingRoll = new Roll('1d20');
    const rollValue = openingRoll.total;
    const situation : Situation = {
      user: actor.accessor,
      naturalRoll: rollValue,
      rollTags: ['opening'],
      rollTotal: rollValue,
      activeCombat: true,
    };
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
      return  {
        roll: openingRoll,
        data: [{
          msg: mandatory.msg,
          options: [mandatory.options.find(x=> x.mandatory)!],
        }]
      };
    };
    const data = returns.filter(x=> x.msg.length > 0);
    return {
      roll: openingRoll,
      data,
    };
  }

  private async fadingRoll( combatant: Combatant<ValidAttackers> , situation: Situation) : Promise<OpenerOptionsReturn> {
    const options : OpenerOptionsReturn['options'] = [];
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

  private mandatoryOtherOpeners( combatant: PersonaCombatant, situation: Situation): OpenerOptionsReturn {
    let options : OpenerOptionsReturn['options'] = [];
    const msg : string[] = [];
    if (!combatant.actor) {return { msg, options};}
    const mandatoryActions = combatant.actor.openerActions.filter( x=> x.hasTag('mandatory', combatant.actor));
    const usableActions = mandatoryActions
      .filter( action => {
        const useSituation : Situation = {
          ...situation,
          usedPower: action.accessor,
        };
        return action.testOpenerPrereqs(useSituation, combatant.actor);
      });
    options = usableActions
      .flatMap( action =>  {
        const possibleTargets= this.combat.combatants.contents.filter (x=> PersonaCombat.isPersonaCombatant(x));
        const targets= PersonaTargetting.getValidTargetsFor(action, combatant, situation, possibleTargets);
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

  private saveVsSleep( combatant: Combatant<ValidAttackers>) : OpenerOptionsReturn {
    const options : OpenerOptionsReturn['options'] = [];
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

  private saveVsDizzy( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
    const options : OpenerOptionsReturn['options'] = [];
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

  private saveVsFear( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
    const options : OpenerOptionsReturn['options'] = [];
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

  private rageOpener( combatant: Combatant<ValidAttackers> , _situation: Situation) : OpenerOptionsReturn {
    const msg : string[] = [];
    const options : OpenerOptionsReturn['options'] = [];
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

  private saveVsConfusion ( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
    const options : OpenerOptionsReturn['options'] = [];
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

  private saveVsCharm ( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
    const options : OpenerOptionsReturn['options'] = [];
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

  private disengageOpener( combatant: PersonaCombatant, situation: Situation) :OpenerOptionsReturn {
    const options : OpenerOptionsReturn['options'] = [];
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
      const ret : OpenerOptionsReturn = {
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

  private saveVsDespair ( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
    const options : OpenerOptionsReturn['options'] = [];
    const msg : string[] = [];
    const saveTotal = this.mockOpeningSaveTotal(combatant, situation, 'despair');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Despair (${saveTotal}) -->`);
    switch (true) {
      case (saveTotal >= 11):{
        msg.push('Success');
        break;
      }
      default:
        msg.push('Failure (Miss Turn)');
        options.push({
          optionName: 'Wallow in Despair (Miss Turn)',
          mandatory: true,
        combatant: combatant.id,
          optionEffects: ['skipTurn'],
        });
    }
    return {msg, options};
  }

  private otherOpeners( combatant: PersonaCombatant, situation: Situation): OpenerOptionsReturn {
    let options : OpenerOptionsReturn['options'] = [];
    const msg : string[] = [];
    const actor = combatant.actor;
    if (!actor) {return { msg, options};}
    if (!actor.isCapableOfAction()) {
      return {msg, options};
    }
    const openerActions = actor.openerActions;
    const usableActions = openerActions
      .filter( action => {
        const useSituation : Situation = {
          ...situation,
          usedPower: action.accessor,
        };
        if (!actor.persona().canPayActivationCost(action)) {return false;}
        return action.testOpenerPrereqs(useSituation, combatant.actor);
      });
    options = usableActions
      .flatMap<OpenerOption>( action =>  {
        const possibleTargets= this.combat.combatants.contents.filter (x=> PersonaCombat.isPersonaCombatant(x));
        const targets= PersonaTargetting.getValidTargetsFor(action, combatant, situation, possibleTargets);
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

  mockOpeningSaveTotal( combatant: Combatant<ValidAttackers> , situation: Situation, status: StatusEffectId) : number | undefined {
    const rollValue = situation.naturalRoll ?? -999;
    if (!combatant.actor) {return undefined;}
    const statusEffect = combatant.actor.getStatus(status);
    if (!statusEffect && status != 'fading') {return undefined;}
    const saveSituation : Situation = {
      ...situation,
      saveVersus: status
    };
    const saveBonus = combatant.actor.persona().getBonuses('save').total(saveSituation);
    return saveBonus + rollValue;
  }

  /** return true if action executed */
  async activateGeneralOpener (ev: JQuery.ClickEvent) :Promise<boolean> {
    if (!await HTMLTools.confirmBox('use this opener?', 'use this opener?')) {return false;}
    const combatantId = HTMLTools.getClosestData(ev,'combatantId');
    const powerId = HTMLTools.getClosestDataSafe(ev,'powerId', '');
    const combatant = this.combat.ensureActivatingCharacterValid(combatantId as ValidAttackers["id"]);
    const options = HTMLTools.getClosestDataSafe(ev, 'optionEffects', '');
    if (!combatant) {
      PersonaError.softFail("Invalid combatant");
      return false;
    }
    if (!powerId) {
      this.execSimpleAction(options);
      const actionName = $(ev.currentTarget).parents('li.opener-option').find('.option-name').text().trim();
      await this.chooseOpener(actionName);
      // await this.chooseOpener(ev);
      return true;
    }
    const power = combatant.actor.getUsableById(powerId as Power["id"]);
    if (!power) { return false; }
    if (power && combatant.actor?.canUseOpener()) {
      await combatant.parent.combatEngine.usePower(combatant.token as PToken, power);
      const actionName = $(ev.currentTarget).parents('li.opener-option').find('.option-name').text().trim();
      await this.chooseOpener(actionName);
      // await this.chooseOpener(ev);
      return true;
    } else {
      ui.notifications.warn("Can't use opener here");
      return false;
    }
  }

  execSimpleAction(options: string) {
    options = options.trim();
    if (options.length == 0) {return;}
    switch (options.trim() as OptionEffect) {
      case 'disengage':
        //TODO handle disengage later
    }
    ui.notifications.notify('Executing simple action');
  }

  async chooseOpener(openerName: string) {
    if (!this.combat.combatant?.isOwner)  {
      PersonaError.softFail("Can't pick opener, it's not your turn");
      return;
    }
    const reverseArray = game.messages.contents.reverse();
    const msgTarget = reverseArray.find( msg => {
      if (!msg.isOwner) {return false;}
      const html = $(msg.content);
      const openerList = html.find(".option-name");
      if (openerList.length> 0) {
        return true;
      }
    });
    if (!msgTarget) {
      PersonaError.softFail("Couldnt' find message target to choose opener");
      return;
    }
    await this.modifyOpenerMsg(msgTarget, openerName);
  }

  async modifyOpenerMsg(msg: ChatMessage, actionName: string) {
    if (!msg) {return;}
    const choice = $(`<div class='opener-choice'>
      <span>Chosen Opener:</span>
      <span>${actionName}</span>
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

  /** returns true if the opener actually gets executed*/
  async activateTargettedOpener(combatant :PersonaCombatant,  power: Usable, target: PersonaCombatant, actionName: string ) : Promise<boolean> {
    if (!await HTMLTools.confirmBox('use this opener?', 'use this opener?')) {return false;}
    // const combatantId = HTMLTools.getClosestData(ev,'combatantId');
    // const powerId = HTMLTools.getClosestData<Power["id"]>(ev,'powerId');
    // const targetId = HTMLTools.getClosestData(ev,'targetId');
    if (!this.combat.ensureActivatingCharacterValid(combatant.id)) {return false;}
    // const power = combatant.actor.getUsableById(powerId);
    // if (!power) { return false; }
    // const target = combatant.parent?.combatants.find(c=> c.id == targetId);
    // if (!target) {
    //   PersonaError.softFail(`Cant find target Id ${targetId}`);
    //   return false;
    // }
    // if (!combatant.actor?.canUseOpener()) { return false;}
    await combatant.parent.combatEngine.usePower(combatant.token as PToken, power, [target.token]);
    // const actionName = $(ev.currentTarget).parents('li.opener-option').find('.option-name').text().trim();
    await this.chooseOpener(actionName);
    // await this.chooseOpener(ev);
    return true;
  }

  static checkForOpeningChanges(diffObject: FlagChangeDiffObject) : boolean {
    if (diffObject?.flags?.persona?.openingActionData) {
      return true;
    }
    return false;
  }

  getOpenerPrintableName(usable: Usable, targetList: PersonaCombatant[]) : string  | undefined {
    const targets= targetList.map( target=> target.name);
    return `${usable.displayedName.toString()} (${targets.join(', ')}): ${usable.system.description}`;
  }

  async requestOpenerChoice() {
    const comb= this.combat.combatant;
    if (!comb || !PersonaCombat.isPersonaCombatant(comb)) {
      return;
    }
    if (game.user.isGM && comb.actor.hasActivePlayerOwner) {
      return;
    }
    if (!comb.actor.isOwner) { return; }
    this.panel.setOpenerList(comb, this.getOpenerChoices());
    await SidePanelManager.push(this.panel);
  }

  async execOpeningOption( option: OpenerOption) : Promise<void> {
    const combatant= this.combat.combatants.find(c=> c.id == option.combatant);
    if (!combatant || !PersonaCombat.isPersonaCombatant(combatant)) {
      PersonaError.softFail("Couldn't find Combatant to execute Opening Option");
      return;
    }
    if (!combatant.isOwner) {
      PersonaError.softFail("You don't own this combatant");
      return;
    }
    if (!this.combat.turnCheck(combatant.actor)) {
      PersonaError.softFail(`${combatant.name} is not currently able to take actions (Out of Turn Action?)`);
      return;
    }
    if (option.power) {
      await this.execOpenerPower(combatant, option.power);
    }
    await this.processOptionEffects(combatant, option.optionEffects);
  }

  async execOpenerPower(combatant: PersonaCombatant, powerData: NonNullable<OpenerOption["power"]>) {
    const {powerId, targets} = powerData;
    const power = combatant.actor.persona().powers
      .find( pwr=> pwr.id == powerId)
      ?? (combatant.actor.items.find( item=> item.id == powerId));
    if (!power || !power.isUsableType()) {
      PersonaError.softFail(`Couldn't find power id :${powerId} to execute opener`);
      return;
    }
    const resolvedTargets = targets != undefined
      ? targets.map (target => this.combat.combatants
        .find(comb => comb.id == target)?.token as U<PToken>)
      .filter( tok => tok != undefined)
      : undefined;
    await this.combat.combatEngine.usePower(combatant.token, power, resolvedTargets);
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

export type OpenerOptionsReturn = {
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
