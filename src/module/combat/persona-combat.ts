/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { EnhancedSourcedConsequence, NonDeprecatedConsequence} from '../../config/consequence-types.js';
import { sleep, waitUntilTrue } from '../utility/async-wait.js';
import { CardTag } from '../../config/card-tags.js';
import { RollTag } from '../../config/roll-tags.js';
import { PersonaScene } from '../persona-scene.js';
import { CombatHooks } from './combat-hooks.js';
import { TriggeredEffect } from '../triggered-effect.js';
import { PersonaCalendar } from '../social/persona-calendar.js';
import { ConsTarget } from '../../config/consequence-types.js';
import { PersonaSocial } from '../social/persona-social.js';
import { PersonaSFX } from './persona-sfx.js';
import { PersonaSettings } from '../../config/persona-settings.js';
import { ModifierContainer } from '../item/persona-item.js';
import { TurnAlert } from '../utility/turnAlert.js';
import { EngagementChecker } from './engageChecker.js';
import { Metaverse } from '../metaverse.js';
import { StatusEffectId } from '../../config/status-effects.js';
import { HTMLTools } from '../utility/HTMLTools.js';

import { PersonaError } from '../persona-error.js';
import { CombatResult } from './combat-result.js';
import { PersonaActor } from '../actor/persona-actor.js';
import { AttackResult } from './combat-result.js';
import { PersonaDB } from '../persona-db.js';
import { PersonaRoller, RollBundle } from '../persona-roll.js';
import { EngagementList } from './engagementList.js';
import {FinalizedCombatResult} from './finalized-combat-result.js';
import {CombatScene} from './combat-scene.js';
import {CombatEngine} from './combat-engine.js';
import {ConditionTarget} from '../../config/precondition-types.js';
import {NavigatorVoiceLines} from '../navigator/nav-voice-lines.js';
import {OpenerManager} from './openers.js';
import { CombatPanel } from './panels/combat-panel.js';
import {TreasureSystem} from '../exploration/treasure-system.js';
import {ModifierList} from './modifier-list.js';
import {FollowUpManager} from './follow-up-actions.js';
import {ConditionalEffectPrinter} from '../conditionalEffects/conditional-effect-printer.js';
import {PersonaSockets} from '../persona.js';


declare global {
  interface SocketMessage {
    'QUERY_ALL_OUT_ATTACK' : Record<string, never>;
    'REQUEST_TEAMWORK': {
      requestor: U<UniversalActorAccessor<ValidAttackers>>;
      teammateTarget: UniversalActorAccessor<ValidAttackers>;
    }
  }
}

declare global {
  interface HOOKS {
    'onUsePower': (power: UsableAndCard, user: PToken, defender: PToken) => unknown;
  }
}

export class PersonaCombat extends Combat<ValidAttackers> {
  static WAIT_FOR_FOUNRY_DELAY = 1000 as const;
  _resolvingAttack: boolean = false;
  _engagedList: EngagementList;
  consecutiveCombat: number =0;
  defeatedFoes : ValidAttackers[] = [];
  private _lastActivationRoll: number;
  combatEngine: CombatEngine;
  openers: OpenerManager;
  followUp: FollowUpManager;

  constructor (...args: unknown[]) {
    super(...args);
    this.combatEngine = new CombatEngine(this);
    this.consecutiveCombat = 0;
    this.defeatedFoes = [];
    this.openers = new OpenerManager(this);
    this.followUp = new FollowUpManager(this);
  }

  hasCombatantRanStartCombatTrigger(combatant: Combatant<ValidAttackers>) : boolean {
    const startedList = this.getFlag<Combatant['id'][]>('persona', 'startedCombatList') ?? [];
    return startedList.includes(combatant.id);
  }

  async setCombatantRanStartCombatTrigger(combatant: Combatant<ValidAttackers>) {
    const startedList = this.getFlag<Combatant['id'][]>('persona', 'startedCombatList') ?? [];
    startedList.pushUnique(combatant.id);
    await this.setFlag('persona', 'startedCombatList', startedList);
  }

  setLastActivationRoll(val: number) {
    this._lastActivationRoll = val;
  }

  get lastActivationRoll(): number {
    return this._lastActivationRoll;
  }


  static get combat() : U<PersonaCombat> {
    return game?.combat as U<PersonaCombat>;
  }

  allowedToTakeActions(actor: ValidAttackers) {
    if (game.user.isGM) {return true;}
    return this.turnCheck(actor);
  }

  async runAllCombatantStartCombatTriggers() {
    const combatants = this.combatants
      .filter( c => c.actor != undefined
        && !this.hasCombatantRanStartCombatTrigger(c));
    const promises = combatants.map( comb => this.runCombatantStartCombatTriggers(comb));
    const resolutions = (await Promise.allSettled(promises));
    const errors = resolutions
      .filter( res => res.status=="rejected")
      .map (x => x.reason as unknown);
    if (errors.length) {
      console.error(errors);
      ui.notifications.error("Errors on start Combat triggers");
    }
    const results = resolutions
      .filter( res => res.status == "fulfilled")
      .map(res => res.value)
      .filter( res=> res != undefined);
    if (results.length > 0) {
      const CR = results.reduce ( (acc, res) => acc.addChained(res));
      const header = `<h3> Start Combat Triggers</h3>`;
      await CR.toMessage(header);
    }
  }

  async runCombatantStartCombatTriggers(comb: Combatant<ValidAttackers>) : Promise<U<FinalizedCombatResult>> {
    if (!comb.actor) {return;}
    if (!game.user.isGM) {return;}
    if (this.hasCombatantRanStartCombatTrigger(comb)) {
      return;
    }
    await this.setCombatantRanStartCombatTrigger(comb);
    const token = comb.token as PToken;
    const situation : Situation = {
      activeCombat : true,
      user: comb.actor.accessor,
      triggeringCharacter: comb.actor.accessor,
    };
    const CR = TriggeredEffect
    .autoTriggerToCR('on-combat-start', token.actor, situation);
    return CR?.finalize();
  }

  get validEngagementCombatants(): PersonaCombatant[] {
    return this.combatants.contents.filter( comb => {
      if (!comb.token || !comb.token.actor) {return false;}
      const actor = comb.token.actor;
      if (!actor) {return false;}
      if (actor.hasStatus('charmed')) {return false;}
      if (!actor.isAlive()) {return false;}
      return true;
    }) as PersonaCombatant[];
  }

  get panel() : CombatPanel {
    return CombatPanel.instance;
  }

  override async startCombat(options: StartCombatOptions = {}) {
    await this.panel.activate();
    let msg = '';
    this._engagedList = new EngagementList(this);
    await this._engagedList.flushData();
    const assumeSocial = !(this.combatants.contents.some(comb=> comb.actor && comb.actor.system.type == 'shadow'));
    const regionMods: UniversalModifier["id"][] = [];
    const region = Metaverse.getRegion();
    if (region) {
      regionMods.push(...region.parent.getRoomEffects());
    } else {
      const rmods = (game.scenes.current as PersonaScene).getRoomEffects();
      regionMods.push(...rmods);
    }
    if (options.roomMods) {
      regionMods.pushUnique(...options.roomMods);
    }
    const combatInit = await this.roomEffectsDialog(regionMods, assumeSocial);
    await this.setSocialEncounter(combatInit.isSocialScene);
    if (combatInit.isSocialScene != this.isSocial) {
      throw new PersonaError('WTF Combat not updating!');
    }
    if (combatInit.isSocialScene) {
      if (combatInit.disallowMetaverse) {
        //this is techincally for exiting the MV
        await Metaverse.exitMetaverse();
      }
      await PersonaSocial.startSocialCombatRound(combatInit.disallowMetaverse, combatInit.advanceCalendar);
    }
    const mods = combatInit.roomModifiers;
    await this.setRoomEffects(mods);
    await this.setEscalationDie(0);
    msg += this.roomEffectsMsg();
    if (msg.length > 0) {
      const messageData: MessageData = {
        speaker: {alias: 'Combat Start'},
        content: msg,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      };
      await ChatMessage.create(messageData, {});
    }
    const starters = this.combatants.contents.map( comb => comb?.actor?.onCombatStart())
      .filter (x=> x != undefined);
    await Promise.all(starters);
    void this.refreshActorSheets();
    const unrolledInit = this.combatants
      .filter( x=> x.initiative == undefined)
      .map( c=> c.id);
    if (!this.isSocial) {
      await TriggeredEffect.autoApplyTrigger('on-combat-start-global');
    }
    if (unrolledInit.length > 0) {
      await this.rollInitiative(unrolledInit);
    }
    void this.navigatorOpen();
    return await super.startCombat();
  }

  async navigatorOpen() {
    await sleep(12000);
    await NavigatorVoiceLines.onStartCombat(this);

  }

  override async delete() : Promise<void> {
    await this.onEndCombat();
    return await super.delete();
  }

  async onEndCombat() : Promise<void> {
    if (!game.user.isGM) {return;}
    void this.openers.onEndCombat();
    void this.refreshActorSheets();
    await this.generateTreasureAndXP();
    if (this.isSocial && await HTMLTools.confirmBox('Enter Meta', 'Enter Metaverse?', true)) {
      await Metaverse.enterMetaverse();
    }
    await this.combatantsEndCombat();
    if (this.didPCsWin()) {
      await this.clearFoes();
    }
  }

  didPCsWin(): boolean {
    const actorList = this.combatants.contents
      .map( x=> x?.actor)
      .filter (x=> x !== undefined);
    const isPCStanding = actorList
      .some ( c=> c.isAlive() && c.getAllegiance() === 'PCs');
    const isShadowStanding = actorList
      .some ( c=> c.isAlive() && c.getAllegiance() === 'Shadows');
    const PCsWin = isPCStanding && !isShadowStanding;
    return PCsWin;
  }

  async combatantsEndCombat() : Promise<void> {
    if (!game.user.isGM) {return;}
    await this.endCombatTriggers();
    await this.reviveFallenActors();
    const promises = this.combatants.contents.map( async (c) => {
      try {
        await c.actor?.onEndCombat();
      } catch (e) {
        PersonaError.softFail(e);
        console.warn(e);
      }
    });
    const nav = PersonaDB.getNavigator();
    if (nav) {
      await nav.onEndCombat();
    }
    await Promise.allSettled(promises);
  }

  async reviveFallenActors(): Promise<void> {
    const promises = this.combatants.contents
    .filter( combatant=> combatant.actor != undefined
      && !combatant.actor.hasStatus('full-fade')
    )
    .map( async (combatant) => {
      const actor = combatant.actor!;
      if (actor.isFading()) {
        await actor.modifyHP(1);
      }
    });
    await Promise.allSettled(promises);
  }

  async endCombatTriggers() : Promise<void> {
    if (this.isSocial) {return;}
    const PCsWin = this.didPCsWin();
    const promises = this.combatants
    .filter (x=> x.actor != undefined)
    .map( async (comb) => {
      const situation : Situation = {
        trigger: 'on-combat-end',
        triggeringUser: game.user,
        hit: PCsWin,
        triggeringCharacter: comb.actor!.accessor,
        user: comb.actor!.accessor,
        combatOutcome: PCsWin ? "win" : "draw",
      };
      const CR =  TriggeredEffect.autoTriggerToCR('on-combat-end', comb.actor, situation);
      return await CR?.toMessage('End Combat Triggered Effect', comb.actor);
    });
    await Promise.allSettled(promises);
    const CR = TriggeredEffect.autoTriggerToCR('on-combat-end-global');
    await CR?.toMessage('End Combat Global Trigger', undefined);
  }

  async checkEndCombat() : Promise<boolean> {
    if (this.isSocial) {return false;}
    const winner = this.combatants.find(x=>
      x.actor != undefined
      && x.actor.isAlive()
      && !this.getAllies(x)
      .some( ally => ally.actor && ally.actor.hasStatus('charmed'))
      && !this.getFoes(x)
      .some(f => !f.isDefeated)
    );
    if (winner) {
      if (await this.endCombat()) {
        return true;
      }
    }
    return false;
  }

  refreshActorSheets(): void {
    for (const comb of this.combatants) {
      const actor= comb.token?.actor;
      if (!actor) {continue;}
      if (actor.sheet._state > 0) {
        actor.sheet?.render(true);
      }
    }
  }

  override async endCombat() : Promise<boolean> {
    const dialog = await HTMLTools.confirmBox('End Combat', 'End Combat?');
    if (dialog == false) {return false;}
    const nextCombat = await this.checkForConsecutiveCombat();
    if (!nextCombat) {
      await this.delete();
      return true;
    }
    await this.prepareForNextCombat();
    return true;
  }

  async prepareForNextCombat() {
    const actors = await this.clearFoes();
    this.defeatedFoes = this.defeatedFoes.concat(actors);
    for (const comb of this.combatants) {
      try {
        const actorType = comb.actor?.system?.type;

        switch (actorType) {
          case 'pc':
          case'npcAlly':
            await comb.update({'initiative': null});
            break;
          case 'shadow':
            break;
          case undefined:
            break;
          default:
            actorType satisfies never;
            PersonaError.softFail(`${actorType as string} is an invalid Actor type for a combatant`);
            break;
        }
      } catch {
        PersonaError.softFail(`Error resetting initiative for ${comb?.name}`);
      }
    }
    await this.update({ 'round': 0, });
  }

  async clearFoes() : Promise<ValidAttackers[]> {
    if (this.isSocial) {return [];}
    const combatantsToDelete = this.combatants
    .filter(x => x.token != undefined
      && x.actor != undefined
      && !x.actor.isAlive()
      && x.actor.isShadow()
      && !x.token.isLinked);
    const tokensToDelete = combatantsToDelete.map( x=> x.token.id);
    await game.scenes.current.deleteEmbeddedDocuments('Token', tokensToDelete);
    return combatantsToDelete.flatMap(x=> x.actor ? [x.actor] : []);
  }

  isBossBattle() : boolean {
    return this.combatants.contents.some( c =>
      c.actor
      && c.actor.isBossOrMiniBossType()
    );
  }

  async checkForConsecutiveCombat() : Promise<boolean> {
    try {
      if (!this.didPCsWin()) {return false;}
      if (this.isBossBattle()) {return false;}
      const region = CombatScene.instance && game.scenes.active == CombatScene.instance.scene ? CombatScene.instance.region : Metaverse.getRegion();
      if (!region)  {return false;}
      this.consecutiveCombat += 1;
      const check = await region.presenceCheck('secondary', -this.consecutiveCombat);
      if (!check) {
        this.consecutiveCombat = 0;
        return false;
      }
      return true;
    } catch (e) {
      if (e instanceof Error) {
        PersonaError.softFail(`Error with checking for consecutive combats: ${e.message}`, e);
      }
      this.consecutiveCombat = 0;
      return false;
    }
  }

  validCombatants(attacker?: PToken): PersonaCombatant[] {
    const challenged = attacker?.actor.hasStatus('challenged');
    return this.combatants.contents.filter( x=> {
      if (!x.actor) {return false;}
      if (attacker == x.token) {return true;}
      if (challenged || x.actor.hasStatus('challenged')) {
        if (!this.isEngaging(PersonaDB.getUniversalTokenAccessor(attacker!), PersonaDB.getUniversalTokenAccessor(x.token as PToken))) {
          return false;
        }
      }
      return true;
    }) as PersonaCombatant[];
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async ensureSheetOpen(combatant: PersonaCombatant) {
    if (!combatant.actor) {return;}
    for (const comb of this.combatants) {
      if (comb != combatant && comb.actor && comb.actor.sheet._state >= 0)
      {comb.actor.sheet.close();}
    }
    void CombatPanel.instance.setTarget(combatant.token as PToken);
  }

  playerAlert( combatant: Combatant<PersonaActor>) : boolean {
    if (combatant.actor?.isOwner && !game.user.isGM)
    {
      TurnAlert.alert();
      return true;
    }
    return false;
  }

  async onNewRound() {
    if (!game.user.isGM) {return;}
    const debug = PersonaSettings.debugMode();
    const nav = PersonaDB.getNavigator();
    if (debug) { console.log("New Round Start");}
    if (nav) {
      const exp = await nav.onStartCombatTurn();
      if (debug) { console.log(`On new round: ${exp.join()}`);}
    }
  }

  async resetBatonStates() {
    for (const comb of this.combatants) {
      await comb.actor?.setBatonLevel(0);
    }
  }

  async startCombatantTurn( combatant: Combatant<PersonaActor>){
    if (!PersonaCombat.isPersonaCombatant(combatant)) {return;}
    this.setLastActivationRoll(-1);
    const actor = combatant.actor;
    if (!game.user.isGM && actor.isOwner) {
      await this.panel.activate(true);
      await this.panel.setTarget(combatant.token);
    }
    if (!game.user.isGM) {return;}
    await this.resetBatonStates();
    if (await this.checkEndCombat() == true) {
      return;
    }
    const baseRolls : Roll[] = [];
    const rolls : RollBundle[] = [];
    await actor.refreshActions();
    if (!actor.hasPlayerOwner) {
      await this.ensureSheetOpen(combatant);
    }
    let startTurnMsg = [ `<u><h2> Start of ${combatant.token.name}'s turn</h2></u><hr>`];
    const engaged = this.getAllEngagedEnemies(combatant);
    if (engaged.length > 0) {
      const engagedMsg  = `<div> <b>Engaged By:</b> ${engaged.map(x=> x.name).join(', ')}</div>`;
      startTurnMsg.push(engagedMsg);
    }
    startTurnMsg = startTurnMsg.concat(
      await (actor as PC | Shadow).onStartCombatTurn(),
      this.handleStartTurnEffects(combatant),
    );
    await this.execStartingTrigger(combatant);
    const openingRoll = await this.openers.makeOpeningRoll();
    baseRolls.push(openingRoll);
    const openerMsg = await this.openers.onOpeningRoll(openingRoll.total, combatant);
    if (openerMsg) {
      startTurnMsg.push(openerMsg);
    }
    const speaker = {alias: 'Combat Turn Start'};
    const messageData = {
      speaker: speaker,
      content: startTurnMsg.join('<br>'),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rolls: rolls.map(r=> r.roll).concat(baseRolls),
      sound: rolls.length + baseRolls.length > 0 ? CONFIG.sounds.dice : undefined
    };
    const msg = await ChatMessage.create(messageData, {});
    await this.openers.storeOpenerChatMsg(msg.id);
    const actorOwner = actor.getPrimaryPlayerOwner();
    if (actorOwner) {
      await sleep(PersonaCombat.WAIT_FOR_FOUNRY_DELAY);
      await msg.update({'author': actorOwner});
    }
  }

  override get combatant() : U<PersonaCombatant> {
    const comb = super.combatant;
    if (!comb || !PersonaCombat.isPersonaCombatant(comb)) {return undefined;}
    return comb;
  }

  static addOpeningActionListeners(elem: JQuery) : void {
    this.combat?.openers.activateListeners(elem);
  }

  static _openRollBlock(ev: JQuery.ClickEvent) {
    $(ev.currentTarget).closest('.outer-roll-block').toggleClass('open');
  }

  static ensureActivatingCharacterValid(combatantId: PersonaCombatant['id']): PersonaCombatant | undefined {
    const currentCombat = game.combat as PersonaCombat | undefined;
    if (!currentCombat) {return;}
    return currentCombat.ensureActivatingCharacterValid(combatantId);
  }

  ensureActivatingCharacterValid(combatantId: PersonaCombatant['id']): U<PersonaCombatant> {
    const combatant = this?.combatant;
    if (!combatant || !combatant.actor) {return;}
    if (combatant?.id != combatantId) {
      ui.notifications.warn('Not your turn');
      return;
    }
    return combatant;
  }

  async execStartingTrigger(combatant: PersonaCombat['combatant']) {
    const triggeringCharacter  = (combatant as Combatant<ValidAttackers>)?.token?.actor;
    if (triggeringCharacter != undefined) {
      for (const user of this.combatants) {
        if (user.token.actor == undefined) {continue;}
        const situation : Situation = {
          trigger: "start-turn",
          triggeringCharacter: triggeringCharacter.accessor,
          triggeringUser: game.user,
          user: user.token.actor.accessor,
          activeCombat: true,
        };
        await TriggeredEffect.execCombatTrigger('start-turn', user.token.actor, situation);
      }
    }
  }

  static isSameTeam( one: PToken | Combatant<ValidAttackers> | ValidAttackers, two: PToken | Combatant<ValidAttackers> | ValidAttackers) : boolean {
    const actor1 = one instanceof PersonaActor ? one: one.actor;
    const actor2 = two instanceof PersonaActor ? two: two.actor;
    if (!actor1 || !actor2) {return false;}
    return actor1.getAllegiance() == actor2.getAllegiance();
  }

  toCombatant(c: IntoCombatant) : PersonaCombatant | undefined {
    if (c instanceof Combatant) {return c;} 
    if (PersonaDB.isTokenAccessor(c))  {
      const tok= PersonaDB.findToken(c);
      return this.findCombatant(tok);
    }
    if (PersonaDB.isActorAccessor(c)) {
      const actor = PersonaDB.findActor(c);
      return this.findCombatant(actor);
    }
    throw new Error('Illegal Argument passed to toCombatant');
  }

  /** finds enemies with defender auara that are engaging the target*/
  getEnemyEngagedDefenders(x: IntoCombatant) : PersonaCombatant[] {
    const comb = this.toCombatant(x);
    if (!comb) {
      PersonaError.softFail("Can't find Combatant", x);
      return [];
    }
    const meleeCombatants = EngagementChecker.listOfCombatantsInMelee(comb, this);
    return meleeCombatants
      .filter( x=> x.actor && x.actor.hasDefenderAura()
        && !PersonaCombat.isSameTeam(comb,x )
        && x.actor.canEngage()
      );


  }

  getAlliedEngagedDefenders(Tacc: UniversalTokenAccessor<PToken>) : PersonaCombatant[];
  getAlliedEngagedDefenders(comb: PersonaCombatant  ) : PersonaCombatant[];
  getAlliedEngagedDefenders(Tacc: UniversalTokenAccessor<PToken> | PersonaCombatant) : PersonaCombatant[] {
    const comb = this.toCombatant(Tacc);
    if (!comb) {
      PersonaError.softFail("Can't find Combatant", Tacc);
      return [];
    }
    const meleeCombatants = EngagementChecker.listOfCombatantsInMelee(comb, this);
    return meleeCombatants
      .filter( x=> x.actor && x.actor.hasDefenderAura()
        && PersonaCombat.isSameTeam(comb,x )
        && x.actor.canEngage()
      );
  }

  static isPersonaCombatant(comb: Combatant<PersonaActor>) : comb is PersonaCombatant {
    return comb.actor?.isValidCombatant() == true && comb.parent != undefined;
  }

  isInChallengeWith(user: Combatant<ValidAttackers>, target: Combatant<ValidAttackers>) : boolean {
    const userActor = user.token.actor;
    const targetActor = target.token.actor;
    if (!userActor || !targetActor) {return false;}
    if (!userActor.hasStatus('challenged'))
    {return false;}
    if (!targetActor.hasStatus('challenged'))
    {return false;}
    return EngagementChecker.isWithinEngagedRange(user.token as PToken, target.token as PToken);

  }

  getAllEngagedEnemies(subject: PersonaCombatant): PersonaCombatant[] {
    return EngagementChecker.getAllEngagedEnemies(subject, this);
  }
  getDisengageDC(combatant: PersonaCombatant) : number {
    if (!combatant.token) {return 11;}
    const list = EngagementChecker.getAllEngagedEnemies(combatant, this);
    for (const item of list) {
      if (item.actor && item.actor.hasDefenderAura()) {return 16;}
    }
    return 11;
  }

  async skipBox(msg: string) {
    if (await HTMLTools.confirmBox(msg, msg)) {
      await this.nextTurn();
    }
  }

  async endTurn(combatant: Combatant<ValidAttackers>) {
    const actor = combatant.actor;
    if (!actor) {return;}
    if (!actor.isOwner) {return;}
    if (this.isSocial) {
      if (!actor.isPC()) {return;}
      await PersonaSocial.endSocialTurn(actor);
      return;
    }
    const triggeringCharacter  = (combatant)?.token?.actor?.accessor;
    if (triggeringCharacter) {
      for (const user of this.combatants) {
        if (user.token.actor == undefined) {continue;}
        const situation : Situation = {
          trigger: 'end-turn',
          triggeringUser: game.user,
          triggeringCharacter,
          user: user.token.actor.accessor,
          activeCombat: true,
        };
        const CR = TriggeredEffect.autoTriggerToCR('end-turn', user.actor, situation);
        await CR?.toMessage('On End Turn', combatant.actor);
      }
    }
    const notes = await actor?.onEndCombatTurn() ?? [];
    if (notes.length > 0) {
      const messageData: MessageData = {
        speaker: {alias: 'End of Turn'},
        content: notes.join('<br>'),
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      };
      await ChatMessage.create(messageData, {});
    }
    await this.followUp.onEndTurn();
    await this.openers.onEndTurn();
  }

  handleStartTurnEffects(combatant: Combatant<ValidAttackers>): string[] {
    const actor= combatant.actor;
    if (!actor) {return [];}
    const Msg: string[] = [];
    const debilitatingStatuses :StatusEffectId[] = [
      'sleep',
      'shock'
    ];
    const debilitatingStatus = actor.effects.find( eff=> debilitatingStatuses.some( debil => eff.statuses.has(debil)));
    if (debilitatingStatus) {
      const msg =  `${combatant.name} can't take actions normally because of ${debilitatingStatus.name}`;
      Msg.push(msg) ;
      if (actor.system.type == 'shadow') {
        void this.skipBox(`${msg}. <br> Skip turn?`); //don't await this so it processes the rest of the code
      }
    }
    const despair = actor.hasStatus('despair');
    const burnStatus = actor.effects.find( eff=> eff.statuses.has('burn'));
    if (burnStatus) {
      const damage = burnStatus.potency;
      Msg.push(`${combatant.name} is burning and will take ${damage} damage at end of turn. (original Hp: ${actor.hp})`);
    }
    if (despair && actor.isPC()) {
      const drain = actor.despairMPDamage();
      Msg.push(`${combatant.name} is feeling despair and will lose ${drain} MP at end of turn. (original MP: ${actor.mp}`);
    }
    const poisonStatus = actor.effects.find( eff=> eff.statuses.has('poison'));
    if (poisonStatus) {
      const damage = actor.getPoisonDamage();
      Msg.push(`${combatant.name} is poisoned and will take ${damage} damage on each action. (original Hp: ${actor.hp})`);
    }
    return Msg;
  }

  get engagedList() : EngagementList {
    if (!this._engagedList)  {
      this._engagedList = new EngagementList(this);
    }
    return this._engagedList;
  }

  async postActionCleanup(attacker: PToken, result: FinalizedCombatResult ) {
    // await this.afterActionTriggered(attacker, result);
    const power = result.power;
    if (!power) {return;}
    const comb = this.combatant;
    if (!comb || !PersonaCombat.isPersonaCombatant(comb)) {return;}
    if ( await this.checkFollowUpAction(attacker)) {
      return;
    }
    if (comb?.token == attacker) {
      const shouldEndTurn =
        (
          this.hasRunOutOfActions(comb)
          || power == PersonaDB.getBasicPower('All-out Attack')
        ) ;
      const autoEndTurn = PersonaSettings.autoEndTurn() && shouldEndTurn;
      if (shouldEndTurn) {
        if (autoEndTurn) {
          if (this.forceAdvanceTurn) {
            await this.setForceEndTurn(false);
          }
          await this.nextTurn();
          return;
        }
        await this.displayEndTurnMessage();
      } else {
        await this.displayActionsRemaining(comb);
      }
    }
  }

  async checkFollowUpAction(attacker: PToken ) {
    const status = attacker.actor.effects.find( eff=> eff.statuses.has("bonus-action"));
    if (status && status.activationRoll) {
      await this.followUp.onFollowUpAction(attacker, status.activationRoll);
      return true;
    }
    return false;
  }

  async callOnTeammateForTeamworkMove(teammate: PersonaCombatant, requestor : U<PToken>) {
    const actor = teammate.actor;
    const owner = game.users.find( user=> user.active && actor.isPC() && user == actor.getPrimaryPlayerOwner()) ??
      game.users.find ( user => user.active && !user.isGM && actor.testUserPermission(user, "OWNER"))
      ?? game.users.find ( user => user.isGM);
    if (owner) {
      try {
        const teamworkData : SocketMessage["REQUEST_TEAMWORK"] = {
          requestor: requestor?.actor?.accessor,
          teammateTarget: actor.accessor,
        };
      const response = await PersonaSockets.verifiedSend("REQUEST_TEAMWORK", teamworkData, owner.id);
      return response;
      } catch (e) {
        PersonaError.softFail(`Problem Contactign ${owner.name}`, e);
        return false;
      }
    }
    return false;
  }

  static async onTeamworkRequest(data: SocketMessage["REQUEST_TEAMWORK"]) {
    const leader = data.requestor ? PersonaDB.findActor(data.requestor) : undefined;
    const yourChar = PersonaDB.findActor(data.teammateTarget);
    const reply = await HTMLTools.confirmBox("Teamwork request", `${leader?.name ?? "Unknown Character"} requests that ${yourChar.name} perform a teamwork move`);
    if (!reply) {
      const msg = `${yourChar.name} turns down opportunity to use teamwork move!`;
      await PersonaSocial.characterDialog(yourChar, msg);
      return;
    }
    await PersonaCombat.combat?.followUp.prepareToActOnTeammateAction(yourChar, leader );
  }


  async displayActionsRemaining(combatant: PersonaCombatant) : Promise<ChatMessage> {
    const token = combatant?.token as PToken;
    const boldName = `<b>${token.name}</b>`;
    const actor = combatant.actor;
    const actionsRemaining = actor.actionsRemaining + ( actor.hasStatus('bonus-action') ? 1 : 0);
    const content = `<div>${boldName} has ${actionsRemaining} actions remaining.</div>`;
    const messageData: Foundry.MessageData = {
      speaker: {
        alias: actor.displayedName ?? 'ERROR'
      },
      content,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    };
    return await ChatMessage.create(messageData, {});
  }

  hasRunOutOfActions(combatant: Combatant<ValidAttackers>) : boolean {
    if (!combatant.actor) {return false;}
    const moreActions = combatant.actor.actionsRemaining || combatant.actor.hasStatus('bonus-action');
    const shouldEndTurn =
      (
        !moreActions
        || this?.forceAdvanceTurn
      );
    return shouldEndTurn;
  }

  async displayEndTurnMessage(): Promise<ChatMessage | null>  {
    const combatant = this.combatant;
    const actor = combatant?.actor;
    const token = combatant?.token as PToken;
    if (!actor || !token)  {
      PersonaError.softFail('No actor for endTurn Message');
      return null;
    }
    const boldName = `<b>${token.name}</b>`;
    let content = `<div>${boldName} has run out of actions.</div>`;
    const pushMsg = `<div> ${boldName} can take an additional action by pushing themself, but this inflicts 1 fatigue level`;
    if (actor.fatigueLevel > 0 ) {
      content = content  + pushMsg;
    }
    if (actor.canEngage() && !this.isEngagedByAnyFoe(PersonaDB.getUniversalTokenAccessor(token))) {
      content += `<div> ${boldName} can choose target to engage</div>`;
    }
    content = `<div class="end-turn-msg"> ${content} </div>`;
    const messageData: Foundry.MessageData = {
      speaker: {
        alias: actor.displayedName ?? 'ERROR'
      },
      content,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    };
    return await ChatMessage.create(messageData, {});
  }

  get forceAdvanceTurn() : boolean {
    return this.getFlag<boolean>('persona', 'autoEndTurn') ?? false;
  }

  async setForceEndTurn(val = true): Promise<void> {
    await this.setFlag('persona', 'autoEndTurn', val);
  }

  static getSimulatedResult(attacker: PToken, power: UsableAndCard, target: PToken, situation : AttackResult['situation']) : CombatResult;
  static getSimulatedResult(attacker: PToken, power: UsableAndCard, target: PToken, simNaturalRoll: number) : CombatResult;
  static getSimulatedResult(attacker: PToken, power: UsableAndCard, target: PToken, simSitOrNat: AttackResult['situation'] |  number) : CombatResult {
    let situation : AttackResult['situation'];
    const combat = game.combat as PersonaCombat | undefined;
    if (typeof simSitOrNat == 'number') {
      const simNaturalRoll = simSitOrNat;
      situation = {
        user: attacker.actor.accessor,
        usedPower: PersonaDB.getUniversalItemAccessor(power),
        attacker: attacker.actor.accessor,
        target: target.actor.accessor,
        naturalRoll: simNaturalRoll,
        rollTags: ['attack'],
        rollTotal: simNaturalRoll,
        hit: true,
        addedTags: ['pierce'],
        criticalHit: false,
        isSocial: false,
        rollType: "standard",
        DC: 0,
        result: "hit",
        withinAilmentRange: false,
        withinInstantKillRange: false,
        withinCritRange: false,
        struckWeakness: false,
        resisted: false,
        activeCombat:combat && !combat.isSocial ? Boolean(combat.combatants.find( x=> x.actor?.system.type != attacker.actor.system.type)): false ,
      } satisfies AttackResult["situation"];
    } else {
      situation = simSitOrNat;
    }
    type maybeRange = U<AttackResult["ailmentRange"]>
    let ailmentRange : maybeRange, critRange: maybeRange, instantKillRange: maybeRange;
    if (!power.isSocialCard()) {
      const ranges= CombatEngine.calculateRanges(attacker.actor.persona(), target.actor.persona(), power as Usable, situation);
      ailmentRange = ranges.ailmentRange;
      critRange = ranges.critRange;
      instantKillRange= ranges.instantKillRange;
    }
    const simAtkResult : AttackResult = {
      result: 'hit',
      target: PersonaDB.getUniversalTokenAccessor(target),
      attacker: PersonaDB.getUniversalTokenAccessor(attacker),
      power: PersonaDB.getUniversalItemAccessor(power),
      ailmentRange,
      instantKillRange,
      critRange,
      situation,
      roll: null,
    };
    const proc = new CombatEngine(undefined);
    const CR = proc.processEffects(simAtkResult);
    return CR;
  }

  static getPTokenFromActorAccessor(acc: UniversalActorAccessor<PersonaActor>) : PToken | undefined {
    const combat = game.combat as U<PersonaCombat>;
    if (acc.token) {
      return PersonaDB.findToken(acc.token) as PToken;
    }
    const actor = PersonaDB.findActor(acc);
    if (combat && actor.isValidCombatant())  {
      const ptoken = combat.getPToken(actor);
      if (ptoken) {return ptoken;}
    }
    const tok = game.scenes.current.tokens.contents.find( tok => tok.actor == actor);
    if (tok) {return tok as PToken;}
    return undefined;
  }

  getPToken(actorAcc: UniversalActorAccessor<PersonaActor>) : U<PToken>;
  getPToken(actor: ValidAttackers) : U<PToken> ;
  getPToken(actor: ValidAttackers | UniversalActorAccessor<PersonaActor>) : U<PToken> {
    if ("actorId" in actor) {
      const act = PersonaDB.findActor(actor);
      if (!act || !act.isValidCombatant()) {return undefined;}
      actor = act;
    }
    const comb = this.combatants.find( c=> c.actor == actor);
    if (comb) {return comb.token as PToken;}
    const tok = game.scenes.current.tokens.contents.find( tok => tok.actor == actor);
    if (tok) {return tok as PToken;}
    return undefined;
  }


//   static resistIKMod(targetPersona: Persona, power: Usable) : number {
//     const fn = function (elem: RealDamageType) {
//       const resist = targetPersona.elemResist(elem);
//       switch (resist) {
//         case "weakness":
//           return -3;
//         case "normal":
//           return 0;
//         case "resist": return 3;
//         case "block":
//         case "absorb":
//         case "reflect": return 9999;
//         default:
//           resist satisfies never;
//           return 0;
//       }
//     };
//     let ret = 0;
//     if (power.hasTag("dark")) {
//       ret += fn ("dark");
//     }
//     if (power.hasTag("light")) {
//       ret += fn ("light");
//     }
//     return ret;
//   }

  static createTargettingContextList(situation: Partial<Situation>, cons : Sourced<NonDeprecatedConsequence> | null) : TargettingContextList {
    const {target, attacker, user, cameo} = situation;
    const triggeringCharacter = 'triggeringCharacter' in situation ? situation.triggeringCharacter : undefined;
    const owner : UniversalActorAccessor<PersonaActor>[] = [];
    if (cons && cons.owner) {
      if (cons.owner)
      {owner.push(cons.owner);}
    }
    const foes :TargettingContextList['all-foes'] = [];
    const allies : TargettingContextList['all-allies'] = [];
    if (attacker && game.combat) {
      const attackerToken = this.getPTokenFromActorAccessor(attacker);
      if (attackerToken) {
        foes.push(...this
          .getAllEnemiesOf(attackerToken)
          .map( x=> x.actor.accessor)
        );
      }
      if (attackerToken) {
        allies.push(...this
          .getAllAlliesOf(attackerToken)
          .map( x=> x.actor.accessor)
        );
      }
    }

    const allInRegion :TargettingContextList['all-in-region'] = [];
    const id = ('triggeringRegionId' in situation)? situation.triggeringRegionId : undefined;
    const region = Metaverse.getRegion(id);
    if (region)  {
      const tokens = Array.from(region.tokens);
      const actors = tokens
        .filter( x=> x.actor && x.actor.isValidCombatant())
        .map( x=> (x.actor as ValidAttackers).accessor);
      allInRegion.push(...actors);
    }

    const nav = PersonaDB.getNavigator();
    const context : TargettingContextList = {
      target: target ? [target] : [],
      owner,
      attacker: attacker ? [attacker] : [],
      user: user ? [user] : [],
      'triggering-character': triggeringCharacter ? [triggeringCharacter] : [],
      cameo: cameo ? [cameo] : [],
      'all-allies': allies,
      'all-foes': foes,
      'all-in-region': allInRegion,
      navigator: nav ? [nav.accessor] : [],
      'pc-party': PersonaDB.activePCParty().map ( pc => pc.accessor),
    };
    return context;
  }

  /** forces a result from solve effective targets if possible */
  static solveEffectiveTargetsForce < T extends keyof Omit<TargettingContextList, "situation">>(applyTo :T, situation: Situation, cons?: SourcedConsequence<NonDeprecatedConsequence>) : readonly (ValidAttackers | ValidSocialTarget)[]  {
    const solutionList : (keyof Omit<TargettingContextList, "situation">)[] = [applyTo];
    switch (applyTo) {
      case "target":
        solutionList.push("triggering-character");
        solutionList.push("user");
        solutionList.push("owner");
        break;
      case "owner":
        solutionList.push("triggering-character");
        solutionList.push("user");
        solutionList.push("owner");
        solutionList.push("attacker");
        break;
      case "attacker":
        solutionList.push("triggering-character");
        solutionList.push("user");
        solutionList.push("owner");
        solutionList.push("target");
        break;
      case "user":
        solutionList.push("triggering-character");
        solutionList.push("owner");
        solutionList.push("attacker");
        solutionList.push("target");
        break;
      case "triggering-character":
        solutionList.push("user");
        solutionList.push("owner");
        solutionList.push("target");
        solutionList.push("attacker");
        break;
      case "cameo":
        solutionList.push("user");
        break;
      case "all-allies":
        break;
      case "all-foes":
        break;
      case "all-in-region":
        solutionList.push("pc-party");
        break;
      case "navigator":
        break;
      case "pc-party":
        solutionList.push("all-in-region");
        break;
      default:
        applyTo satisfies never;
    }
    const resolved= solutionList.reduce( (acc, newApplyTo, i) => {
      if (acc.length > 0) {
        return acc;
      }
      const ret= this.solveEffectiveTargets(newApplyTo, situation, cons);
      if (ret.length > 0 && i > 0) {
        PersonaError.softFail(`Had to default to ${newApplyTo} in place of ${applyTo} for bugged consequence ${cons?.type ?? "unknown consequence"}`, cons);
      }
      return ret;
    }, [] as ReturnType<typeof PersonaCombat["solveEffectiveTargets"]>);
    if (resolved.length == 0) {
      const consPrintout = cons ? ConditionalEffectPrinter.printConsequence(cons): "No Cons";
      throw new PersonaError(`Couldn't resolve effective targets for ${consPrintout}`);
    }
    return resolved;
  }

  static solveEffectiveTargets< T extends keyof Omit<TargettingContextList, "situation">>(applyTo :T, situation: Situation, cons?: SourcedConsequence) : readonly (ValidAttackers | ValidSocialTarget)[]  {
    switch (applyTo) {
      case 'target' : {
        const target = situation.target
        ? PersonaDB.findActor(situation.target)
        : situation.socialTarget
        ? PersonaDB.findActor(situation.socialTarget)
        : undefined;
        return target ? [target]: []; }
      case 'attacker': {
        const attacker = situation.attacker ? PersonaDB.findActor(situation.attacker) : undefined;
        return attacker ? [attacker]: []; }
      case 'owner':
        if (cons) {
          if (cons.owner) {
            const pt =  this.getPTokenFromActorAccessor(cons.owner);
            if (pt && pt.actor) {return [pt.actor];}
          }
          if (cons.owner) {
            const pt =  this.getPTokenFromActorAccessor(cons.owner);
            if (pt && pt.actor) {return [pt.actor];}
          }
          else {return [];}
        }
        ui.notifications.notify("Can't find Owner of Consequnece");
        return [];
      case 'user': {
        if (!situation.user) {return [];}
        if (situation.user) {
          const userToken  = this.getPTokenFromActorAccessor(situation.user);
          if (userToken)  { return [userToken.actor];}
          const userActor = PersonaDB.findActor(situation.user);
          if (userActor) {return [userActor];}
        }
        if (cons && cons.owner) {
          const owner =  PersonaDB.findActor(cons.owner);
          if (owner) {return [owner as ValidAttackers];}
        }
        return [];
      }
      case 'triggering-character': {
        const triggerer = 'triggeringCharacter' in situation? situation.triggeringCharacter: undefined;
        if (!triggerer) {
          PersonaError.softFail(`Can't target triggering character for ${"trigger" in situation ? situation.trigger: ""}`, situation);
          return [];
        }
        const token = this.getPTokenFromActorAccessor(triggerer);
        if (token) { return [token.actor];}
        const actor = PersonaDB.findActor(triggerer);
        if (actor) { return [actor];}
        return [];
      }
      case 'cameo': {
        const cameo = 'cameo' in situation && situation.cameo ? PersonaDB.findActor(situation.cameo) : undefined;
        return cameo ? [cameo] : []; }
      case 'all-foes': {
        const user = situation.user ? PersonaDB.findActor(situation.user) : undefined;
        if (!user) {return [];}
        const userToken = this.getPTokenFromActorAccessor(user.accessor);
        if (!userToken) {return [];}
        return this.getAllEnemiesOf(userToken).map( x=> x.actor);
      }
      case 'all-allies': {
        const user = situation.user ? PersonaDB.findActor(situation.user) : undefined;
        if (!user) {return [];}
        const userToken = this.getPTokenFromActorAccessor(user.accessor);
        if (!userToken) {return [];}
        return this.getAllAlliesOf(userToken)
        .map( x=> x.actor);
      }
      case undefined: {
        const target = situation.target ? PersonaDB.findActor(situation.target) : undefined;
        return target ? [target] : []; } //default to target since this is old material
      case 'all-in-region': {
        let id : string | undefined;
        if ('triggeringRegionId' in situation) {
          id = situation.triggeringRegionId;
        }
        const region = Metaverse.getRegion(id);
        if (!region) {return [];}
        const tokens = Array.from(region.tokens);
        const actors = tokens
        .filter( x=> x.actor && x.actor.isValidCombatant())
        .map( x=> x.actor! as ValidAttackers);
        return actors;
      }
      case "navigator": {
        const nav = PersonaDB.getNavigator();
        return nav ? [nav] : [];
      }
      case "pc-party": {
        return PersonaDB.activePCParty();
      }
      default:
        applyTo satisfies never;
        return [];
    }
  }

  static getAltTargets ( attacker: PToken, situation : Situation, targettingType :  ConsTarget) : PToken[] {
    const attackerType = attacker.actor.getAllegiance();
    switch (targettingType) {
      case 'target': {
        if (!situation.target) {return [];}
        const token = this.getPTokenFromActorAccessor(situation.target);
        if (token) {return [token];} else {return [];}
      }
      case 'owner':
        return [attacker];
      case 'attacker': {
        if (!situation.attacker) {return [];}
        const token = this.getPTokenFromActorAccessor(situation.attacker);
        if (token) {return [token];} else {return [];}
      }
      case 'all-enemies': {
        const combat = this.ensureCombatExists();
        const targets = combat.combatants.filter( x => {
          const actor = x.actor;
          if (!actor || !(actor).isAlive())  {return false;}
          return ((x.actor as ValidAttackers).getAllegiance() != attackerType);
        });
        return targets.map( x=> x.token as PToken);
      }
      case 'all-allies': {
        return this.getAllAlliesOf(attacker);
      }
      case 'all-foes':{
        return this.getAllEnemiesOf(attacker);
      }
      case 'all-combatants': {
        const combat = game.combat as PersonaCombat;
        if (!combat) {return [];}
        return combat.validCombatants(attacker).flatMap( c=> c.actor ? [c.token as PToken] : []);
      }
      case 'user': {
        if (!situation.user) {return [];}
        const token = this.getPTokenFromActorAccessor(situation.user);
        if (token) {return [token];} else {return [];}
      }
      case 'triggering-character': {
        if (!('triggeringCharacter' in  situation)) {return [];}
        if (!situation.triggeringCharacter) {return [];}
        const token = this.getPTokenFromActorAccessor(situation.triggeringCharacter);
        if (token) {return [token];} else {return [];}
      }
      case 'cameo': {
        return [];
      }
      case 'all-in-region':
        PersonaError.softFail('all-in-region does not support alt targets');
        return [];
      case "navigator":
        PersonaError.softFail(`navigator doesn't support alt targets`);
        return [];
      case "pc-party":
        PersonaError.softFail(`pc-party doesn't support alt targets`);
        return [];
      default:
        targettingType satisfies never;
        return [];
    }
  }

  getAllEnemiesOf(token: PToken) : PToken [] {
    const attackerType = token.actor.getAllegiance();
    const targets = this.validCombatants(token).filter( x => {
      const actor = x.actor;
      if (!actor || !actor.isAlive())  {return false;}
      return (x.actor && x.actor.getAllegiance() != attackerType);
    });
    return targets.map( x=> x.token as PToken);

  }

  static getAllEnemiesOf(actor: ValidAttackers) : PToken [];
  static getAllEnemiesOf(token: PToken) : PToken [];
  static getAllEnemiesOf(tokenOrActor: PToken | ValidAttackers) : PToken [] {
    const combat= this.ensureCombatExists();
    const token = tokenOrActor instanceof TokenDocument ? tokenOrActor  : combat.getCombatantByActor(tokenOrActor)?.token;
    if (token) {
      return combat.getAllEnemiesOf(token as PToken);
    }
    throw new PersonaError(`${tokenOrActor.name} isn't in combat`);
  }

  /** returns self and all allies */
  static getAllAlliesOf(actor: ValidAttackers) : PToken[] ;
  static getAllAlliesOf(token: PToken) : PToken[] ;
  static getAllAlliesOf(tokenOrActor: PToken | ValidAttackers) : PToken[] {
    const actor = tokenOrActor instanceof PersonaActor ? tokenOrActor : tokenOrActor.actor;
    // const token = tokenOrActor instanceof TokenDocument ? tokenOrActor : tokenOrActor.actor;
    const attackerType = actor.getAllegiance();
    const combat= this.combat;
    const tokens = combat
      ? ( combat.validCombatants(combat.getCombatantByActor(actor)!.token as PToken)
        .filter( x=> x.actor)
        .map(x=> x.token))
      : (game.scenes.current.tokens
        .filter( (x : TokenDocument<PersonaActor>) => x.actor != undefined && (x?.actor?.isPC() || x?.actor?.isNPCAlly())
        ));
    const targets= tokens.filter( x => {
      const actor = x.actor as ValidAttackers | undefined;
      if (!actor)  {return false;}
      if (!actor.isAlive()) {return false;}
      if (actor.isFullyFaded()) {return false;}
      return (actor.getAllegiance() == attackerType);
    });
    return targets.map( x=> x as PToken);
  }

  static canBeTargetted(token : PToken) : boolean {
    return token.actor && !token.actor.hasStatus('protected');
  }

  static ensureCombatExists() : PersonaCombat {
    const combat = game.combat;
    if (!combat) {
      const error = 'No Combat';
      throw new PersonaError(error);
    }
    return combat as PersonaCombat;
  }

  getEscalationDie() : number {
    return (this.getFlag('persona', 'escalation') as number) ?? -1;
  }

  async incEscalationDie() : Promise<void> {
    await this.setEscalationDie(Math.min(this.getEscalationDie() +1, 6));
  }

  async decEscalationDie() : Promise<void> {
    await  this.setEscalationDie(Math.max(this.getEscalationDie() - 1, 0));
  }

  async setEscalationDie(val: number) : Promise<void> {
    const clamp = Math.clamp(val,0,6);
    await this.setFlag('persona', 'escalation', clamp);
  }

  async setSocialEncounter(isSocial: boolean) {
    await this.setFlag('persona', 'isSocial', isSocial);
  }

  get isSocial() : boolean {
    return this.getFlag('persona', 'isSocial') ?? false;
  }

  isEngagedByAnyFoe(subject: UniversalTokenAccessor<PToken>) : boolean {
    const comb = this.findCombatant(subject);
    if (!comb) {return false;}
    return EngagementChecker.isEngagedByAnyFoe(comb, this);
  }

  isInMeleeWith (token1: UniversalTokenAccessor<PToken> | PToken, token2: UniversalTokenAccessor<PToken> | PToken) : boolean {
    const c1 = token1 instanceof TokenDocument ? this.findCombatant(token1) : this.findCombatant(token1);
    if (!c1) {
      // PersonaError.softFail("Can't find combatant");
      return false;
    }
    const c2 = token2 instanceof TokenDocument ? this.findCombatant(token2) : this.findCombatant(token2);
    if (!c2) {
      // PersonaError.softFail("Can't find combatant");
      return false;
    }
    const melee = EngagementChecker.listOfCombatantsInMelee(c1, this);
    return melee.includes(c2);
  }

  isEngaging(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
    const c1 = this.findCombatant(token1);
    const c2 = this.findCombatant(token2);
    if (!c2 || !c1) {
      PersonaError.softFail("Can't find combatant");
      return false;
    }
    return EngagementChecker.isEngaging(c1, c2, this);
  }

  isEngagedBy(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
    const c1 = this.findCombatant(token1);
    const c2 = this.findCombatant(token2);
    if (!c2 || !c1) {
      PersonaError.softFail("Can't find combatant");
      return false;
    }
    return EngagementChecker.isEngagedBy(c1, c2, this);
  }

  getCombatantFromTokenAcc(acc: UniversalTokenAccessor<PToken>): PersonaCombatant {
    const token = PersonaDB.findToken(acc);
    const combatant = this.combatants.find( x=> x?.actor?.id == token.actor.id);
    if (!combatant || !PersonaCombat.isPersonaCombatant(combatant)) {
      throw new PersonaError(`Can't find combatant for ${token.name}. are you sure this token is in the fight? `);
    }
    return combatant;
  }

  async setEngageWith(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) {
    const c1 = this.getCombatantFromTokenAcc(token1);
    const c2 = this.getCombatantFromTokenAcc(token2);
    await this.engagedList.setEngageWith(c1, c2);
  }

  static async disengageRoll( actor: ValidAttackers, DC = 11) : Promise<{total: number, rollBundle: RollBundle, success: boolean}> {
    const situation : Situation = {
      user: PersonaDB.getUniversalActorAccessor(actor),
    };
    const mods = actor.getDisengageBonus();
    const labelTxt = 'Disengage Check';
    const roll = new Roll('1d20');
    await roll.roll();
    const rollBundle = new RollBundle(labelTxt, roll, actor.system.type == 'pc', mods, situation);
    return {
      total: rollBundle.total,
      rollBundle,
      success: rollBundle.total >= DC,
    };
  }

  /** return true if the token has any enemies remainig*/
  enemiesRemaining(token: PToken) : boolean{
    return this.combatants.contents.some(x=> x.token.actor && x.token.actor.system.type != token.actor.system.type);
  }

  /**return true if the target is eligible to use the power based on whose turn it is
   */
  turnCheck(token: ValidAttackers): boolean;
  turnCheck(combatant: Required<typeof this.combatant>): boolean;
  turnCheck(token: PToken): boolean ;
  turnCheck(thing: PToken  | Required<typeof this.combatant> | ValidAttackers): boolean  {
    const combatant = thing instanceof TokenDocument
      ? this.getCombatantByToken(thing)
      : thing instanceof PersonaActor
      ? this.getCombatantByActor(thing)
      : thing;
    if (!combatant || !combatant.actor) {return false;}
    if (
      this.isSocial
      || combatant.actor.hasStatusOfType("out-of-turn-action")
      || combatant.actor.hasStatus('bonus-action'))
    {

      return true;
    }
    if (!this.combatant) {return false;}
    return (this.combatant.id == combatant.id);
  }

  async waitUntilAttackResolves() {
    await waitUntilTrue(() => this._resolvingAttack == false, 150);
  }

  static async allOutAttackPrompt() {
    if (!PersonaSettings.get('allOutAttackPrompt'))
    {return;}
    const combat= this.ensureCombatExists();
    await combat.waitUntilAttackResolves();
    const comb = combat?.combatant as Combatant<ValidAttackers> | undefined;
    const actor = comb?.actor;
    if (!comb || !actor) {return;}
    if (!actor.canAllOutAttack()) {return;}
    const allies = combat.getAllies(comb)
      .filter(comb=> comb.actor && comb.actor.isCapableOfAction() && !comb.actor.isDistracted());
    const numOfAllies = allies.length;
    if (numOfAllies < 1) {
      ui.notifications.notify('Not enough allies to all out attack!');
      return;
    }
    if (!comb || !actor?.isOwner) {return;}
    void PersonaSFX.onAllOutPrompt();
    if (!await HTMLTools.confirmBox('All out attack!', `All out attack is available, would you like to do it? <br> (active Party members: ${numOfAllies})`)
    ) {return;}
    if (!actor.hasStatus('bonus-action')) {ui.notifications.warn('No bonus action');}
    const allOutAttack = PersonaDB.getBasicPower('All-out Attack');
    if (!allOutAttack) {throw new PersonaError("Can't find all out attack in database");}
    const attacker = comb.token as PToken;
    const result = await combat.combatEngine.usePower(attacker, allOutAttack);
    return result;
  }

  findCombatant(acc :UniversalTokenAccessor<TokenDocument<ValidAttackers>>) : PersonaCombatant | undefined;
  findCombatant(actor: ValidAttackers): PersonaCombatant | undefined;
  findCombatant(comb :PersonaCombatant) : PersonaCombatant | undefined;
  findCombatant(token :PToken) : PersonaCombatant | undefined;
  findCombatant(thing :PToken | PersonaCombatant | UniversalTokenAccessor<TokenDocument<ValidAttackers>> | ValidAttackers) : Combatant<ValidAttackers> | undefined {
    const validCombatants = this.validCombatants();
    switch (true) {
      case thing instanceof Combatant: {
        return validCombatants.find( comb=> comb == thing);
      }
      case thing instanceof TokenDocument: {
        return validCombatants.find( comb=> comb.token == thing);
      }
      case thing instanceof Actor: {
        return validCombatants.find( comb=> comb.actor == thing);
      }
      default: {
        const tokenDoc = PersonaDB.findToken(thing);
        return validCombatants.find( comb=> comb.token != undefined && comb.token == tokenDoc); 
      }
    }
  }

  getAllies(comb: Combatant<ValidAttackers>, includeSelf = false) : PersonaCombatant[] {
    const allegiance = comb.actor?.getAllegiance();
    if (!allegiance) {return [];}
    return this.validCombatants().filter( c => c.actor != null
      && (c.actor.getAllegiance() == allegiance)
      && (includeSelf || c != comb)
    );
  }

  getFoes(comb: Combatant<ValidAttackers>) : PersonaCombatant[] {
    const allegiance = comb.actor?.getAllegiance();
    if (!allegiance) {return [];}
    return this.validCombatants().filter( c => c.actor != null
      && (c.actor.getAllegiance() != allegiance)
      && c != comb);
  }

  getLivingFoes(comb: Combatant<ValidAttackers>) : PersonaCombatant[] {
    return this.getFoes(comb).filter ( c=> c.actor && c.actor.isAlive());
  }

  getToken( acc: UniversalActorAccessor<PersonaActor>  | undefined): UniversalTokenAccessor<PToken> | undefined {
    if (!acc) {return undefined;}
    if (acc.token) {return acc.token as UniversalTokenAccessor<PToken>;}
    const token = this.combatants.find( comb=> comb?.actor?.id == acc.actorId && comb.actor?.token == undefined)?.token;
    if (token && token.actor) {return PersonaDB.getUniversalTokenAccessor(token as PToken);}
    return undefined;
  }

  getRoomEffects() : UniversalModifier[] {
    const effectIds= this.getFlag<string[]>('persona', 'roomEffects');
    const allRoomEffects = PersonaDB.getSceneAndRoomModifiers();
    if (!effectIds) {return [];}
    return effectIds.flatMap(id=> {
      const effect = allRoomEffects.find(eff => eff.id == id);
      return effect ? [effect] : [];
    });
  }

  async alterRoomEffects() {
    const initial = this.getRoomEffects().map( x=> x.id);
    const result = await this.roomEffectsDialog(initial, false);
    await this.setRoomEffects(result.roomModifiers);
    const msg = this.roomEffectsMsg();
    const messageData: MessageData = {
      speaker: {alias: 'Room Effects Update'},
      content: msg,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    };
    await ChatMessage.create(messageData, {});
  }

  roomEffectsMsg(): string {
    const mods = this.getRoomEffects();
    if (mods.length == 0) {
      return '';
    }
    let msg = '';
    msg += '<u><h2>Room Effects</h2></u><ul>';
    msg += mods.map( x=> `<li><b>${x.name}</b> : ${x.system.description}</li>`).join('');
    msg += '</ul>';
    return msg;
  }

  async setRoomEffects(effects: ModifierContainer[]) {
    await this.setFlag('persona', 'roomEffects', effects.map(eff=> eff.id));
  }

  async roomEffectsDialog(initialRoomModsIds: string[] = [], startSocial: boolean) : Promise<DialogReturn> {
    const roomMods = PersonaDB.getSceneAndRoomModifiers();
    const ROOMMODS = Object.fromEntries(roomMods.map( mod => [mod.id, mod.name]));
    const html = await foundry.applications.handlebars.renderTemplate('systems/persona/sheets/dialogs/room-effects.hbs', {
      ROOMMODS : {
        '': '-',
        ...ROOMMODS
      },
      roomMods: initialRoomModsIds,
      startSocial,
    });
    return new Promise( (conf, rej) => {
      const dialogOptions : DialogOptions = {
        title: 'room Effects',
        content: html,
        close: () => rej(new Error('Closed')),
        buttons: {
          'ok': {
            label: 'ok',
            callback: (html: string) => {
              const mods : UniversalModifier[] = [];
              $(html)
                .find('select.room-mod')
                .find(':selected')
                .each( function ()  {
                  const id= String( $(this).val());
                  const mod = roomMods.find(x=> x.id == id);
                  if (mod) {
                    mods.push(mod);
                  }
                });
              const isSocialScene = $(html).find('.social-round').is(':checked');
              const advanceCalendar = $(html).find('.advance-calendar').is(':checked');
              const disallowMetaverse = $(html).find('.disallow-metaverse').is(':checked');
              const ret : DialogReturn = {
                roomModifiers: mods,
                isSocialScene,
                advanceCalendar,
                disallowMetaverse,
              };
              conf(ret);
            },
          }
        }
      };
      const dialog = new Dialog( dialogOptions, {});
      dialog.render(true);
    });
  }

  debug_engageList() {
    const list : string[] = [];
    const combs= this.combatants;
    for (const comb of combs) {
      const combAcc = PersonaDB.getUniversalTokenAccessor(comb.token as PToken);
      const foeEng = this.isEngagedByAnyFoe(combAcc) ? '*' : '';
      const engagedBy = combs
        .filter( c => this.isEngagedBy(combAcc, PersonaDB.getUniversalTokenAccessor(c.token as PToken)))
        .map(c=> c.name);
      list.push(`${comb.name}${foeEng} Engaged By: ${engagedBy.join(' , ')}`);
      const engaging = combs
        .filter( c=> this.isEngaging(combAcc, PersonaDB.getUniversalTokenAccessor(c.token as PToken)))
        .map( c=> c.name);
      list.push(`${comb.name}${foeEng} is Engaging: ${engaging.join(' , ')}`);
    }
    console.log(list.join('\n'));
  }

  async generateTreasureAndXP() {
    if (this.isSocial) {return;}
    if (this.didPCsWin() == false) {return;}
    const actors = this.combatants
      .contents.flatMap( x=> x?.actor ? [x.actor] : [] );
    const shadows= actors
      .filter (x => x.system.type == 'shadow');
    if (shadows.some(x=> !x.hasPlayerOwner && x.hp > 0)) {
      return;
    }
    const defeatedFoes = this.defeatedFoes.concat(shadows);
    for (const foe of defeatedFoes) {
      await foe.onDefeat();
    }
    this.defeatedFoes = [];
    const pcs = actors.filter( x => x.isPC());
    const party = actors.filter( x=> x.isPC() ||  x.isNPCAlly() || (x.isDMon() && x.hasPlayerOwner));
    try {
      await Metaverse.awardXP(defeatedFoes as Shadow[], party);
    } catch  {
      PersonaError.softFail('Problem with awarding XP');
    }
    try {
      const treasure = await TreasureSystem.generateBattleTreasure(defeatedFoes);
      await TreasureSystem.printTreasure(treasure);
      await Metaverse.distributeMoney(treasure.money, pcs);
      await CombatScene.createTreasure(treasure);
    } catch (e)  {
      PersonaError.softFail('Problem with generating treasure', e);
    }
    await NavigatorVoiceLines.playVoice({
      type: "great-work"
    });
  }

  displayCombatHeader(element : JQuery<HTMLElement>) {
    try {
      if ($(element).find('.escalation-die').length == 0) {
        const escalationTracker = `
         <div class="combat-info flexrow">
           <div class="weather-icon">
           </div>
           <div class="region-treasures">
           </div>
         </div>
            `;
        element.find('.combat-tracker-header').append(escalationTracker);
      }
      const weatherIcon = PersonaCalendar.getWeatherIcon();
      element.find('div.weather-icon').append(weatherIcon);
      const treasures = Metaverse.getRegion()?.treasuresRemaining;
      if (treasures && treasures >= 0) {
        element.find('div.region-treasures').append(`<span> Treasures Remaining ${treasures} </span>`);
      }
      element.find('div.weather-icon').append(weatherIcon);
    } catch (e) {
      PersonaError.softFail("Can't display Combat Tracker stuff", e);
    }
    this.displayRoomEffectChanger(element);
  }

  displayRoomEffectChanger(element: JQuery<HTMLElement>) {
    if (element.find('.room-effects-button').length == 0) {
      const button = $( `
         <button>
         <i class="fa-solid fa-wand-magic-sparkles"></i>
         </button>
`).addClass('room-effects-button');
      if (game.user.isGM) {
        button.on('click', this.alterRoomEffects.bind(this));
      } else {
        button.on('click', this.showRoomEffects.bind(this));
      }
      element.find('.combat-info').append(button);
    }
  }

  async showRoomEffects() {
    const msg = this.roomEffectsMsg();
    const messageData: MessageData = {
      speaker: {alias: 'Room Effects'},
      whisper: [game.user],
      content: msg,
      style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
    };
    await ChatMessage.create(messageData, {});
  }

  override async rollInitiative(ids: string[], {formula=null, updateTurn=true, messageOptions={}}={}) {

    // Structure input data
    ids = typeof ids === 'string' ? [ids] : ids;
    const currentId = this.combatant?.id;

    // Iterate over Combatants, performing an initiative roll for each
    const updates = [];
    const rolls :{ combatant: Combatant, roll: Roll}[]= [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for ( const [_i, id] of ids.entries() ) {

      // Get Combatant data (non-strictly)
      const combatant = this.combatants.get(id as Combatant["id"]);
      if ( !combatant?.isOwner ) {continue;}

      // Produce an initiative roll for the Combatant
      const roll = combatant.getInitiativeRoll(formula);
      await roll.evaluate();
      PersonaRoller.hideAnimation(roll);
      rolls.push({combatant, roll});
      updates.push({_id: id, initiative: roll.total});

    }
    if ( !updates.length ) {return this;}

    // Update multiple combatants
    await this.updateEmbeddedDocuments('Combatant', updates);

    // Ensure the turn order remains with the same combatant
    if ( updateTurn && currentId ) {
      await this.update({turn: this.turns.findIndex(t => t.id === currentId)});
    }

    await this.generateInitRollMessage(rolls, messageOptions);
    // Create multiple chat messages
    // await ChatMessage.implementation.create(messages);
    return this;
  }

  async generateInitRollMessage<R extends Roll>(rolls: {combatant: Combatant, roll: R}[], messageOptions: Foundry.MessageOptions = {}): Promise<ChatMessage<R>> {
    const rollTransformer = function (roll: Roll) {
      const total = roll.total;
      if (total <= 0) {return 'last';}
      else {return Math.round(total);}
    };
    const rolltxt = rolls
    .sort( (a, b) => b.roll.total - a.roll.total)
    .map(({roll, combatant}) => `<div class="init-roll"> ${combatant.name}: ${rollTransformer(roll)} </div>`)
    .join('');
    const html = `<h3 class="init-rolls"> Initiative Rolls </h3> ${rolltxt}`;
    const chatMessage: MessageData<R> = {
      speaker: {alias: 'Combat Start'},
      content: html,
      rolls: rolls.map(x=> x.roll),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    };
    return await ChatMessage.create(chatMessage, messageOptions);
  }

  async markTokenDefeated(target: PToken) : Promise<boolean> {
    if (target.actor.isShadow()) {
      const shadow = this.findCombatant(target);
      if (shadow) {
        if (!shadow.defeated) {
          try {
            await shadow.update( {defeated: true});
            return true;
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
    return false;
  }

  static get instance() : U<PersonaCombat> {
    if (game.combat) {
      return game.combat as PersonaCombat;
    }
    return undefined;
  }

  private static getSimulationTargets(attacker: PToken) : PToken[] {
    const scene = CombatScene.scene;
    if (attacker.actor.isShadow()) {
      const PCTokens= scene.tokens.filter( (tok: PToken)=> tok.actor != undefined && !tok.hidden && tok.actor.isPCLike()) as PToken[];
      return PCTokens;
    }
    if (attacker.actor.isPCLike()) {
      const combat = PersonaCombat.combat;
      if (!combat) {return [];}
      const combatant = combat.getCombatantByToken(attacker);
      if (!combatant) {return [];}
      return combat.getFoes(combatant)
        .map( comb => comb.token)
        .filter( token => token.actor.persona().effectiveScanLevel >= 2);
    }
    return [];
  }

  static async testPowerVersusFoes(attacker: PToken, power: Usable) :Promise<string[]> {
    const processor = this.instance?.combatEngine ?? new CombatEngine(undefined);
    const testingTargets= this.getSimulationTargets(attacker);
    const result = await processor.usePower(attacker, power, testingTargets, {askForModifier: false, setRoll: 16, ignorePrereqs : true, simulated: true});
    const changes = result.attacks.flatMap( atk => atk.changes);
    const PCResult = testingTargets.map( target => {
      const PCChanges = changes.filter( ch => {
        const actor = PersonaDB.findActor(ch.actor);
        return actor == target.actor;
      });
      const HPChanges = PCChanges.map ( x=> x.damage.reduce (
        (acc, dmg) => acc + dmg.hpChange, 0));
      const dmg= -1 * HPChanges.reduce( (acc,ch) => acc+ch, 0);
      return `${target.name} HTK ${(target.actor.mhp / dmg).toFixed(2)}`;
    });
    //BUG does not work well for flurry powers yet
    return PCResult;
  }

} // end of class


export type PToken = TokenDocument<ValidAttackers> & {get actor(): ValidAttackers};

CONFIG.Combat.initiative = {
  formula : '1d20 + @parent.init',
  decimals: 2
};

type DialogReturn = {
  roomModifiers: UniversalModifier[],
  isSocialScene: boolean,
  advanceCalendar: boolean,
  disallowMetaverse: boolean,
}

export type SaveOptions = {
  label?: string,
  DC?: number,
  askForModifier?: boolean,
  saveVersus?: StatusEffectId,
  modifier ?: number,
  rollTags : (RollTag | CardTag) [],
}


export type ConsequenceProcessed = {
  consequences: {
    applyTo: 'global' | ValidAttackers,
    cons: EnhancedSourcedConsequence<NonDeprecatedConsequence>,
  }[],
}

CombatHooks.init();

export type PersonaCombatant = Combatant<ValidAttackers> & {actor: ValidAttackers , token: PToken, parent: PersonaCombat};


type IntoCombatant = PersonaCombatant | UniversalTokenAccessor<PToken> | UniversalActorAccessor<ValidAttackers>;


export type TargettingContextList = Omit<Record<ValidAttackersApplies, UniversalActorAccessor<ValidAttackers>[]>, "owner"> & {
  owner: UniversalActorAccessor<PersonaActor>[],
  cameo: UniversalActorAccessor<ValidSocialTarget>[];
}

type ValidAttackersApplies = Exclude<NonNullable<ConditionTarget>, 'cameo'>;

export type TargettingContext = <T extends keyof TargettingContextList>( applyTo: T) => TargettingContextList[T]


export interface CombatOptions {
  askForModifier ?: boolean;
  setRoll?: number;
  ignorePrereqs?: boolean;
  simulated?: boolean;
  modifiers?: ModifierList;
}

void CombatPanel.init();

export interface StartCombatOptions {
  roomMods?: UniversalModifier["id"][];
}

const COMBAT_OUTCOME_LIST = [
  "win",
  "draw",
  "lose",
] as const;

export const COMBAT_OUTCOME = HTMLTools.createLocalizationObject(COMBAT_OUTCOME_LIST, "persona.combat.outcome");

