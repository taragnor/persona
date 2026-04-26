import { LevelUpCalculator } from "../config/level-up-calculator.js";
import { PersonaCombatStats } from "./actor/persona-combat-stats.js";
import { NonDeprecatedModifierType } from "../config/item-modifiers.js";
import {  ModifierContainer, PersonaItem} from "./item/persona-item.js";
import { Logger } from "./utility/logger.js";
import { removeDuplicates } from "./utility/array-tools.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { Metaverse } from "./metaverse.js";
import { StatusEffectId } from "../config/status-effects.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaCombat, PToken } from "./combat/persona-combat.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaError } from "./persona-error.js";
import { localize } from "./persona.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../config/status-effects.js";
import { RealDamageType, RESIST_STRENGTH_LIST, RESIST_STRENGTHS } from "../config/damage-types.js";
import { multiCheckContains, multiCheckToArray } from "./preconditions.js";
import { PersonaI } from "../config/persona-interface.js";
import { DamageType } from "../config/damage-types.js";
import { ResistStrength } from "../config/damage-types.js";
import {InternalCreatureTag, PersonaTag} from "../config/creature-tags.js";
import {Defense} from "../config/defense-types.js";
import {PersonaStat} from "../config/persona-stats.js";
import {Calculation, EvaluatedCalculation} from "./utility/calculation.js";
import {ConditionalEffectC} from "./conditionalEffects/conditional-effect-class.js";
import {ConditionalEffectPrinter} from "./conditionalEffects/conditional-effect-printer.js";
import {PersonaAura} from "./persona-auras.js";
import {PowerLearningSystem} from "./power-learning.js";
import {CombatEngine} from "./combat/combat-engine.js";
import {PersonaSocial} from "./social/persona-social.js";
import {PersonaTagManager} from "./persona-tags.js";

export class Persona<T extends ValidAttackers = ValidAttackers, S extends ValidAttackers = ValidAttackers> implements PersonaI {
  #combatStats: U<PersonaCombatStats>;
  user: T;
  source: S;
  _powers: Power[];
  #cache: PersonaClassCache;
  private _tags: PersonaTagManager<this>;

  static leveling = {
    SHADOWS_TO_LEVEL: 10,
    BASE_XP: 600, // XP FOR FIRST LEVEL UP
    XP_GROWTH: 200, //added XP for additional level ups
  };

  constructor (source: S, user: T, powers?: Power[]) {
    this.user = user;
    this.source = source;
    this._powers = powers == undefined ? this.loadPowers(): powers;
    this._tags = new PersonaTagManager(this);
    this.resetCache();
  }

  loadPowers() {
    this._powers = this.source._mainPowers();
    return this._powers;
  }

  get tags() {
    return this._tags;
  }

  resetCache() {
    this.tags.resetCache();
    this.#cache = {
      mainModifiers: undefined,
      passivePowers: undefined,
      defensiveModifiers : undefined,
      nearbyAuras: undefined,
      mainModifiersList : undefined,
      // tagListPartial: undefined,
      passiveModifiers: undefined,
    };
  }

  get combatName(): string {
    return this.token?.name ?? this.user.name;
  }

  get token() : N<PToken> {
    const combat = PersonaCombat.combat;
    const user = this.user;
    const comb = combat?.getCombatantByActor(user);
    if (comb && comb.token) {return comb.token as PToken;}
    const tok = game.scenes.current.tokens.find( x=> x.actor == user);
    if (tok) {return tok as PToken;}
    return null;
  }

  get img() : string {
    if (this.source.system.combat.personaImg) {
      return this.source.system.combat.personaImg;
    }
    if (this.source.isShadow() && !this.source.system.combat.builtInPersona) {
      return this.source.img;
    }
    return "";
  }

  get powers() : readonly Power[] {
    return this.mainPowers
      .concat(this.bonusPowers)
      .filter( pwr => this.highestPowerSlotUsable() >= pwr.system.slot);
  }

  get activeCombatPowers() : readonly Power[] {
    return this.powers.filter( pwr =>
      pwr.isMagicSkill()
      || pwr.isWeaponSkill()
      || pwr.isCombatPower()
    );
  }

  get explorationPowers() : readonly Power[] {
    return this.powers.filter( pwr =>
      pwr.canBeUsedInExploration()
    );
  }

  get bonusPowers() : readonly Power [] {
    const bonusPowers : Power[] =
      this.mainModifiers({omitPowers:true, omitTalents: true, omitAuras: true})
      .filter(trait => PersonaItem.grantsPowers(trait))
      .flatMap(powerGranter=> PersonaItem.getAllGrantedPowers(powerGranter, this.user))
      .filter( pwr=> !pwr.hasTag("opener", this))
      .sort ( (a,b)=> a.name.localeCompare(b.name)) ;
    return removeDuplicates(bonusPowers);
  }

  get basicPowers() {
    return this.user.basicPowers;
  }

  get mainPowers(): Power[] {
    return this._powers;
  }

  get statusResists() : Readonly<ValidAttackers["system"]["combat"]["statusResists"]> {
    return this.source.system.combat.statusResists;
  }

  get resists(): Readonly<ValidAttackers["system"]["combat"]["resists"]> {
    return this.source.system.combat.resists;
  }

  get classData(): Readonly<ValidAttackers["system"]["combat"]["classData"]> {
    return this.source.system.combat.classData;
  }

  get focii(): readonly Focus[] {
    const actor = this.source;
    if (actor.isPC())
    {return [];}
    return actor.items.filter( x=> x.isFocus()) as Focus[];
  }

  async learnPower(power: Power, logChanges = true) {
    const ret= await this.powerLearning.learnPower(power, logChanges);
    if (ret) { this.loadPowers();}
    return ret;
  }

  async deletePower(power: Power) {
    const ret= await this.powerLearning.deletePower(power.id);
    if (ret) { this.loadPowers();}
    return ret;
  }

  async swapPower(oldPower: Power, newPower: Power) {
    if (!this.powerLearning.isSwappable(oldPower)) {
      throw new PersonaError("Can't swap this power");
    }
    if (!game.user.isGM && !PersonaCombat.combat?.isSocial){
      throw new PersonaError("Can't swap powers now");
    }
    if (this.source.knowsPowerInnately(newPower)) {
      throw new PersonaError(`You already know ${newPower.name}`);
    }
    if ( await this.deletePower(oldPower)) {;
      await this.learnPower(newPower);
      await Logger.sendToChat(`${this.name} swaps power ${oldPower.name} with ${newPower.name}`);
    } else {
      ui.notifications.error(`Problem deleting ${oldPower.name}. Is this power a bonus from somewhere else and not actually innate?`);
    }
  }

  get talents() : readonly Talent[] {
    const extraTalents = this.mainModifiers({omitTalents: true, omitPowers: true, omitAuras: true})
      .filter( CE=> PersonaItem.grantsTalents(CE))
      .flatMap(CE => PersonaItem.getGrantedTalents(CE, this.user));
    ;
    const mainTalents= this.source.system.combat.talents
      .map( id => PersonaDB.getItemById<Talent>(id))
      .filter( tal => tal != undefined);
    extraTalents.pushUnique(...mainTalents);
    return extraTalents;
  }

  getTalentLevel(talent: Talent | Talent["id"]) : number {
    const id = talent instanceof PersonaItem ? talent.id : talent;
    const talents = this.talents;
    let index = talents.findIndex(tal => tal.id == id);
    if (index == -1) {return 0;}
    const convertedLevel = Math.floor(this.level/10) + 1;
    const effectiveLevel = Math.max(0, convertedLevel  -1);
    const baseVal = Math.floor(effectiveLevel / 3);
    const partial = effectiveLevel % 3;
    index = index >= 2 ? 2 : index;
    if (index < partial) {
      return baseVal + 1;
    }
    return baseVal;
  }

  get name(): string {
    switch (this.source.system.type) {
      case "pc":
      case "npcAlly":
        return this.source.system.personaName ?? this.source.displayedName;
      case "shadow":
          if (!this.source.system.combat.builtInPersona) {
            return this.source.displayedName;
          }
        return this.source.system.personaName;
      default:
          this.source.system satisfies never;
        return "ERROR";
    }
  }

  knowsPowerInnately(power : Power)  : boolean {
    const source = this.source;
    const powers = source.system.combat.powers;
    if (powers.includes(power.id)) {
      return true;
    }
    if (!this.user.isShadow()) {
      const sideboard =  this.user.system.combat.powers_sideboard;
      if (sideboard.includes(power.id)) {
        return true;
      }
    }
    const buffer= source.system.combat.learnedPowersBuffer;
    if (buffer.includes(power.id)) {
      return true;
    }
    return false;
  }

  get trueName() {
    switch (this.source.system.type) {
      case "pc":
      case "npcAlly":
        return this.source.system.personaName ?? this.source.name;
      case "shadow":
          if (!this.source.system.combat.builtInPersona) {
            return this.source.name;
          }
        return this.source.system.personaName;
      default:
          this.source.system satisfies never;
        return "ERROR";
    }
  }

  get displayedName(): string {
    return this.name;
  }

  get publicName() : string {
    switch (this.source.system.type) {
      case "pc":
      case "npcAlly":
        return this.displayedName;
      case "shadow":
        if (this.source.system.combat.builtInPersona) {
          return this.displayedName;
        }
        return this.source.publicName;
      default:
        this.source.system satisfies never;
        return "ERROR";
    }
  }

  get unspentStatPoints() : number {
    return this.combatStats.unspentStatPoints();
  }

  get XPForNextLevel() : number {
    return LevelUpCalculator.XPRequiredToAdvanceToLevel(this.level +1);
  }

  get totalXP() : number {
    return this.source.system.combat.personaStats.xp;
  }

  /**XP gained in excess of current level */
  get xp(): number {
    return this.totalXP - LevelUpCalculator.minXPForEffectiveLevel(this.level);
  }

  get effectiveScanLevel(): number {
    const user = this.user;
    const source = this.source;
    if (game.user.isGM) {return 3;}
    if (source.hasPlayerOwner && user.hasPlayerOwner) {
      return 3;
    }
    const permission = Math.min(source.permission, user.permission);
    if (permission >= 2) {return 3;}
    if (this.isPartial) {return 3;}
    if (source.isShadow()) {
      return source.system.scanLevel ?? 0;
    }
    return 0;
  }

  async resetCombatStats( autoSpendersOnly :boolean) {
    if (!game.user.isGM) {return;}
    if (autoSpendersOnly && !this.canAutoSpendStatPoints() ) {return;}
    const source = this.source;
    const stats = source.system.combat.personaStats.stats;
    console.log(`Resetting stats for ${this.name}`);
    for (const k of Object.keys(stats)) {
      stats[k as PersonaStat] = 1;
    }
    await source.update({
"system.combat.personaStats.stats": stats
    });
    if (this.canAutoSpendStatPoints()) {
      await this.combatStats.autoSpendStatPoints();
    }
  }

  canAutoSpendStatPoints() : boolean {
    const source = this.source;
    const isNPCAllyOrShadow = source.isNPCAlly()
      || source.isShadow();
    return isNPCAllyOrShadow
      && !source.isCustomPersona() 
      && source.tarot != undefined;
  }

  get scanLevelRaw() : number {
    const source = this.source;
    if (source.isShadow()) {
      return source.system.scanLevel ?? 0;
    }
    return 3;
  }

  equals(other: Persona) : boolean {
    return this.source == other.source;
  }

  eq(other: Persona): boolean {
    return this.equals (other);
  }

  get level() : number {
    // return this.classData.level;
    return this.source.system.combat.personaStats.pLevel ?? 0;
  }

  get startingLevel() : number {
    return this.source.startingLevel;
  }

  /**gains X amount of levels */
  async gainLevel(amt: number) : Promise<void> {
    const source=  this.source;
    const currLevel = source.system.combat.personaStats.pLevel;
    const newLevel = amt + currLevel;
    const neededXP = LevelUpCalculator.minXPForEffectiveLevel(newLevel);
    await source.update( {
      "system.combat.personaStats.pLevel" : newLevel,
      "system.combat.personaStats.xp": neededXP,
    });
    await Logger.sendToChat(`${this.displayedName} gained ${amt} levels`);
  }

  /** return leveled Persona on level up*/
  async awardXP(amt: number, allowMult = true): Promise<U<XPGainReport>> {
    const isSideboard = this.user.sideboardPersonas.some(x=> x.equals(this));
    const isInactive = !this.user.persona().equals(this) && !isSideboard;
    if (!amt) {
      return undefined;
    }
    if (Number.isNaN(amt)) {
      PersonaError.softFail(`Attempting to add NaN XP to ${this.name}, aborted`);
      return undefined;
    }
    amt = Math.floor(amt);
    const sit: Situation = {
      ...this.baseSituation,
    };
    if (allowMult) {
      const XPMult = this.getBonuses("xp-multiplier").total(sit, "percentage") ?? 1;
      amt = amt * XPMult;
    }
    if (amt <= 0) {
      PersonaError.softFail(`Could be an error as XP gained is now ${amt}`);
      return undefined;
    }
    if (isInactive) {
      let multiplier = this.getBonuses("inactive-persona-xp").total(sit);
      multiplier = Math.clamp(multiplier, 0, 1);
      amt *= multiplier;
    }
    if (isSideboard) {
      let multiplier = this.getBonuses("sideboard-persona-xp").total(sit);
      multiplier = Math.clamp(multiplier, 0, 1);
      amt *= multiplier;
    }
    if (amt <= 0) {return undefined;}
    return this.increaseXP(amt);
  }

  async increaseXP(amt: number): Promise<U<XPGainReport>> {
    amt = Math.round(amt);
    const currXP  = this.source.system.combat.personaStats.xp;
    const newXP = Math.round(currXP + amt);
    let newLevel = this.level;
    while (newXP >= LevelUpCalculator.minXPForEffectiveLevel(newLevel +1)) {
      newLevel += 1;
    }
    const	levelUp = newLevel> this.level;
    if (!PersonaSettings.freezeXPGain()) {
      await this.source.update({
        "system.combat.personaStats.xp" : newXP,
        "system.combat.personaStats.pLevel" : newLevel
      });
    }
    if (levelUp ) {
      await this.source.onLevelUp_BasePersona(newLevel);
    }
    return {
      name: `${this.name} (${this.user.name})`,
      amount: amt,
      leveled: levelUp,
    };
  }

  awardLevels(numOfLevels: number) : number {
    const XPGain = LevelUpCalculator.XPToGainXLevels(this.totalXP, numOfLevels);
    return XPGain;
  }

  get baseSituation() : SituationComponent.User {
    return {
      user: this.user.accessor,
    };
  }

  get pLevel() : number {
    return this.source.system.combat.personaStats.pLevel;
  }

  isEligibleToBecomeDMon() : boolean {
    const source = this.source;
    if (!source.isShadow()) {return false;}
    if (source.system.combat.builtInPersona) {return false;}
    if (source.hasRole(["boss", "miniboss", "treasure-shadow", "duo", "solo", "summoner"])) {return false;}
    if (source.system.creatureType != "shadow" && source.system.creatureType != "daemon") {return false;}
    if (source.hasCreatureTag("pure-shadow")) {return false;}
    return true;
  }

  isEligibleToBecomeWildPersona(): boolean {
    const source = this.source;
    if (!source.isShadow()) {return false;}
    if (!source.tarot || source.tarot.name.length == 0) { return false; }
    if (source.system.combat.builtInPersona) {return false;}
    if (source.level <= 0) {return false;}
    if (this.isPersona()) {return true;}
    if (this.isDMon()) {return true;}
    if (source.prototypeToken.actorLink == true) {return false;}
    if (source.hasRole(["boss", "miniboss", "treasure-shadow", "summoner", "minion"])) {return false;}
    if (source.system.creatureType != "shadow" && source.system.creatureType != "daemon") {return false;}
    if (source.hasCreatureTag("pure-shadow")) {return false;}
    return true;
  }

  isFusable(): boolean {
    if (!this.isEligibleToBecomeWildPersona()) {return false;}
    if (this.hasTag("non-fusable-variant")) {return false;}
    if (this.source.system.creatureType == "daemon") {return false;}
    return true;
  }

  isPersona(): boolean {
    const source = this.source;
    if (source.isPC() || source.isNPCAlly()) {return true;}
    if (source.system.creatureType == "persona") {return true;}
    return false;
  }

  get isCustomPersona() : boolean {
    return this.source.isCustomPersona();
  }

  isDMon() : boolean {
    const source = this.source;
    if (source.system.creatureType == "d-mon") {return true;}
    if (source.isShadow() && source.hasCreatureTag("d-mon")) {return true;}
    return false;
  }

  get powerLearning() : PowerLearningSystem<typeof this.source> {
    return new PowerLearningSystem(this.source);
  }

  numOfWeaknesses(): number {
    return Object.values(this.resists)
      .reduce( (acc, res) =>  acc + (res == "weakness" ? 1 : 0) ,0);
  }

  numOfIncAdvances(): number {
    return this.source.numOfIncAdvances();
  }

  getDefensiveBonuses( modNames : MaybeArray<NonDeprecatedModifierType>)  : ModifierList {
    return this.getBonuses(modNames, this.defensiveModifiers());
  }

  getPassiveBonusesIgnoreAuras (modNames : MaybeArray<NonDeprecatedModifierType>): ModifierList {
    return this.getBonuses( modNames, this.mainModifiers({omitAuras: true})
      .filter (x=> x.conditionalType == "passive")
    );
  }

  getBonuses (modnames : MaybeArray<NonDeprecatedModifierType>, usedPower: Usable) : ModifierList;
  getBonuses (modnames : MaybeArray<NonDeprecatedModifierType>, sources?: readonly SourcedConditionalEffect[]): ModifierList;
  getBonuses (modnames : MaybeArray<NonDeprecatedModifierType>, sources: (readonly SourcedConditionalEffect[] | Usable) = this.passiveModifiers()): ModifierList {
    if (sources instanceof PersonaItem) {
      const baseMods = this.getBonuses(modnames);
      const usable = sources;
      const usableEffects = usable.getPassiveAndDefensiveEffects(this.user);
      const mods = PersonaItem.getModifier(usableEffects, modnames);
      const modList = new ModifierList(mods);
      return baseMods.concat(modList);
    }
    const mods = PersonaItem.getModifier(sources, modnames)
      .filter( mod => mod.modifier != 0);
    return new ModifierList(mods);
  }

  private mainModifiers(options?: MainModifierOptions ): readonly ConditionalEffectC[] {
    const personal = this.personalMainModifiers(options);
    const ret = personal.slice();
    if (!options?.omitAuras) {
      ret.push(...this.aurasInRange());
      return ret;
    }
    return ret;
  }

  private personalMainModifiers(options?: MainModifierOptions ): ConditionalEffectC[] {
    const canCache = this.canCache(options);
    if (this.canCache(options) && this.#cache.mainModifiers != undefined) {
      return this.#cache.mainModifiers;
    }
    const mainMods = this._mainModifiers(options);
    if (canCache) {
      this.#cache.mainModifiers = mainMods;
    }
    return mainMods;
  }

  private _mainModifiersList(options?: MainModifierOptions): readonly ModifierContainer[] {
    if (!this.canCache(options)) {
      return this._mainModifiersListGen(options);
    }
    if (this.#cache.mainModifiersList == undefined) {
      this.#cache.mainModifiersList = this._mainModifiersListGen(options);
    }
    return this.#cache.mainModifiersList;
  }

  private _mainModifiersListGen(options?: MainModifierOptions): readonly ModifierContainer[] {
    const user = this.user;
    const roomModifiers : UniversalModifier[] = [];
    roomModifiers.push(...Metaverse.activeRoomModifiers());
    const passiveOrTriggeredPowers = (options && options.omitPowers) ? [] : this.nonActivePowers();
    const talents = (options && options?.omitTalents) ? [] : this.talents;
    const mainModsList : ModifierContainer[]= [
      ...this.focii,
      ...talents,
      ...passiveOrTriggeredPowers,
      ...user.actorMainModifiers(options),
      ...roomModifiers,
      ...PersonaDB.getGlobalPassives(),
      ...PersonaDB.navigatorModifiers(),
    ];
    return mainModsList;
  }

  private _mainModifiers(options?: MainModifierOptions): ConditionalEffectC[] {
    return this._mainModifiersList(options)
      .flatMap( x=> x.getEffects(this.user));
  }

  myAuraEffects(options : MainModifierOptions = {}) : ConditionalEffectC[] {
    return this._mainModifiersList(options)
      .flatMap( x=> x.getAuraEffects(this.user));
  }

  private aurasInRange() : ConditionalEffectC[] {
    if (!this.canCache(undefined)) {
      return this._aurasInRange();
    }
    if (this.#cache.nearbyAuras == undefined) {
      this.#cache.nearbyAuras = this._aurasInRange();
    }
    return this.#cache.nearbyAuras;
  }

  private _aurasInRange() : ConditionalEffectC[] {
    if (!PersonaSettings.aurasEnabled()) {
      //TODO: temporary code to fix performance
      return [];
    }
    return PersonaAura.activeAuras(this);
  }

  nonActivePowers() : readonly Power[] {
    const PersonaCaching = this.canCache({});
    if (this.#cache.passivePowers == undefined || !PersonaCaching) {
      const val =  this.powers
        .filter( power => !power.isTrulyUsable())
        .filter( power=> power.hasPassiveEffects(this.user) || power.hasTriggeredEffects(this.user) || power.hasDefensiveEffects(this.user));
      if (!PersonaCaching) {return val;}
      this.#cache.passivePowers = val;
    }
    return this.#cache.passivePowers;
  }

  defensiveModifiers(): readonly ConditionalEffectC[] {
    if (!this.#cache.defensiveModifiers || !this.canCache) {
      const val =  this.mainModifiers().filter ( eff => eff.conditionalType == "defensive");
      if (!this.canCache) {return val;}
      this.#cache.defensiveModifiers = val;
    }
    return this.#cache.defensiveModifiers;
  }

  allModifiers(...args: Parameters<Persona["mainModifiers"]>) : readonly ConditionalEffectC[] {
    return this.mainModifiers(...args);
  }

  passiveModifiers() : readonly ConditionalEffectC[] {
    if (!this.#cache.passiveModifiers || !this.canCache) {
      const val =  this.mainModifiers().filter ( eff => eff.conditionalType == "passive");
      if (!this.canCache) {return val;}
      this.#cache.passiveModifiers = val;
    }
    return this.#cache.passiveModifiers;
  }

  async addTalent(talent: Talent) {
    const source = this.source;
    const arr = source.system.combat.talents;
    if (!this.source.isShadow() && talent.system.shadowOnly) {
      ui.notifications.error("This talent can only be used by shadows");
    }
    arr.pushUnique(talent.id);
    await source.update( {"system.combat.talents": arr});
    if (source.hasPlayerOwner) {
      await Logger.sendToChat(`${this.name} added ${talent.name} Talent` , source);
    }
  }

  async deleteTalent(id: Talent["id"]) {
    const source = this.source;
    const talent = PersonaDB.getItemById<Talent>(id);
    if (!talent) {throw new PersonaError(`No such talent ${id}`);}
    const arr = source.system.combat.talents
      .filter(x=> x != id);
    await source.update( {"system.combat.talents": arr});
    await Logger.sendToChat(`${this.name} deleted ${talent.name} Talent` , source);
  }


  get effectiveLevel() : number {
    const advances = this.numOfIncAdvances();
    const maxIncAdvances = this.maxIncrementalAdvances();
    const valPerAdvance = 1 / maxIncAdvances;
    return this.source.system.combat.classData.level + (valPerAdvance * advances);
  }

  maxIncrementalAdvances(): number {
    return this.source.maxIncrementalAdvances();
  }

  /* Base XP for one shadow of equal power **/
  static get BaselineXP(): number {
    const SHADOWS_TO_LEVEL = Persona.leveling.SHADOWS_TO_LEVEL;
    const firstLevelUp = Persona.leveling.BASE_XP;
    return firstLevelUp/SHADOWS_TO_LEVEL;
  }

  static MIN_XP_MULT = 0.05;
  static MAX_XP_MULT = 3;

  static calcXP(killedTargets: ValidAttackers[], numOfAllies: number): number {
    const XP= killedTargets.reduce( (a,x) => x.XPValue() + a, 0);
    return Math.floor(XP / numOfAllies);
  }

  get baseInitRank() : ValidAttackers["system"]["combat"]["initiative"] {
    return this.source.system.combat.initiative;
  }

  get combatInit(): Calculation {
    const initBonus = this
      .getBonuses("initiative");
    const agi = this.combatStats.baseInit();
    agi.add(1, initBonus, "Init bonus");
    return agi;
  }

  printableDefenseMods( defense: Defense) :EvaluatedCalculation["steps"] {
    const def = this.getDefense(defense);
    const situation : Situation  = {
      user: this.user.accessor,
      target: this.user.accessor,
    };
    return def.eval(situation).steps;
  }

  getDefense(defense: Defense) : Calculation {
    const calc= new Calculation(CombatEngine.getBaseDefense(defense));
    if (defense == "none") {return calc;}
    const modifiers = [
      ...this.defensiveModifiers(),
    ];
    modifiers.pushUnique(...this.defensiveModifiers());
    const defenseMods = this.getBonuses([defense, "allDefenses"], modifiers);
    const modList = new ModifierList();
    return calc.add(1, modList.concat(defenseMods), "Other Modifiers");
  }

  get tarot() {
    return this.source.tarot;
  }

  get tarotLoc() {
    return this.source.tarotLoc;
  }


  get combatStats(): PersonaCombatStats {
    if (this.#combatStats == undefined) {
      this.#combatStats = new PersonaCombatStats(this);
    }
    return this.#combatStats;
  }

  get resistancesPrintable() : PrintableResistData[] {
    return Object.entries(this.resists).map( ([k, originalResist]) => {
      const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
      const damageType = k as RealDamageType;
      const actualResist = this.elemResist(damageType);
      let modified : PrintableResistData["modified"];
      switch (true) {
        case actualResist == originalResist :
          modified= "normal";
          break;
        case resval(originalResist) > resval(actualResist):
          modified = "downgraded";
          break;
        case resval(originalResist) < resval(actualResist):
          modified ="upgraded";
          break;
        default:
          modified = "upgraded";
          break;
      }
      const icon = PersonaItem.getDamageIconPath(damageType);
      const data : PrintableResistData =  {
        icon: icon ?? "",
        damageType: damageType,
        resistance: actualResist,
        resistanceLoc: localize(RESIST_STRENGTHS[actualResist]),
        modified,
      };
      return data;
    });
  }

  elemResist(type: Exclude<DamageType, "by-power">): ResistStrength {
    switch (type) {
      case "untyped":  case "none":
      case "all-out":
        return "normal";
      case "healing":
        return "absorb";
    }
    const baseResist = this.resists[type] ?? "normal";
    const modifiers = [
      // ...this.defensiveModifiers(),
      ...this.mainModifiers(),
    ];
    const effectChangers=  modifiers.filter( x=>
      x.consequences
      .some( cons=>cons.type == "raise-resistance" || cons.type == "lower-resistance"));
    const situation : Situation = {
      user: this.user.accessor,
      target: this.user.accessor,
    };
    const consequences = effectChangers
      .flatMap( eff =>
        eff.getActiveConsequences(situation)
      );
    const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
    let resBonus = 0, resPenalty = 0;
    for (const cons of consequences) {
      switch (cons.type) {
        case "raise-resistance": {
          const isSameType = multiCheckContains(cons.resistType, [type]);
          // if (cons.resistType == type &&
          if (isSameType &&
            resval(cons.resistanceLevel) > resval(baseResist)) {
            resBonus = Math.max(resBonus, resval(cons.resistanceLevel) - resval(baseResist));
          }
          break;
        }
        case "lower-resistance": {
          const isSameType = multiCheckContains(cons.resistType, [type]);
          if (isSameType &&
            resval (cons.resistanceLevel) < resval(baseResist))  {
            resPenalty = Math.min(resPenalty, resval(cons.resistanceLevel) - resval(baseResist));
          }
          break;
        }
        default:
          break;
      }
    }
    const resLevel = Math.clamp(resval(baseResist) + resBonus + resPenalty, 0 , RESIST_STRENGTH_LIST.length-1);
    return RESIST_STRENGTH_LIST[resLevel];
  }

  isWeakTo(dtype: RealDamageType) : boolean {
    return this.elemResist(dtype) == "weakness";
  }

  static combinedPersona<T extends ValidAttackers>(basePersona: Persona<T>, attachedPersona: Persona) : Persona<T> {
    const fusedPowers = attachedPersona.powers.concat(
      basePersona.powers);
    fusedPowers.length = Math.min(6, fusedPowers.length);
    const fusedPersona = new Persona(attachedPersona.source, attachedPersona.user, fusedPowers);
    fusedPersona.user = basePersona.user;
    fusedPersona.source = attachedPersona.source;
    //I am not sure if this really persona<T> as there were errors but not sure if this ufnction is even used
    return fusedPersona as Persona<T>;
  }

  get isBasePersona(): boolean {
    //TS seemed to have an issue with this for some reason
    return this.source as unknown == this.user;
  }

  get printableResistanceString() : string {
    const resists = this.statusResists;
    const retdata = Object.entries(resists)
      .filter ( ([statusId, _y]) => CONFIG.statusEffects.some(st=> st.id == statusId))
      .map(([statusRaw, _level]) => {
        const actual = this.statusResist(statusRaw as StatusEffectId);
        const statusTrans = localize(STATUS_EFFECT_TRANSLATION_TABLE[statusRaw as StatusEffectId]);
        if (statusTrans == undefined) {
          return "ERROR";
        }
        switch (actual) {
          case "weakness": return `Weakness ${statusTrans}`;
          case "resist": return `Resist ${statusTrans}`;
          case "absorb":
          case "reflect":
          case "block": return `Block ${statusTrans}`;
          default: return "";
        }
      })
      .filter( x=> x.length > 0)
      .join(", ");
    return retdata;
  }

  statusResist(status: StatusEffectId, modifiers ?: readonly ConditionalEffectC[]) : ResistStrength {
    const actor= this.source;
    if (!modifiers) {
      modifiers = this.mainModifiers();
    }
    const effectChangers = modifiers
      .filter ( mod => mod.consequences
        .some( cons=>
          cons.type == "raise-status-resistance" && multiCheckContains(cons.statusName,status)
        ));
    const situation : Situation = {
      user: actor.accessor,
      target: actor.accessor,
    };
    const consequences = effectChangers.flatMap(
      eff => eff.getActiveConsequences(situation)
    );
    const resists = this.statusResists;
    type ResistableStatus = keyof typeof resists;
    const baseStatusResist = resists[status as ResistableStatus] ? resists[status as ResistableStatus] : "normal" ;
    const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
    let resist= baseStatusResist;
    for (const cons of consequences) {
      if (cons.type == "raise-status-resistance") {
        const statusList = multiCheckToArray(cons.statusName);
        if (statusList.includes(status)) {
          if (!cons.lowerResist && resval(cons.resistanceLevel) > resval(resist)) {
            resist = cons.resistanceLevel;
          }
          if (cons.lowerResist && resval(cons.resistanceLevel) < resval(resist)) {
            resist = cons.resistanceLevel;
          }
        }
      }
    }
    return resist;
  }


  get maxSideboardPowers() : number {
    if (!this.source.isValidCombatant()) {return 0;}
    switch (this.source.system.type) {
      case "npcAlly":
      case "shadow":
        return 0;
      case "pc": {
        if (!this.source.class.system.canUsePowerSideboard) {return 0;}
        const extraMaxPowers = this.getPassiveBonusesIgnoreAuras("extraMaxPowers");
        return extraMaxPowers
        .total ( {user: this.user.accessor});
      }
      default:
        this.source.system satisfies never;
        return -1;
    }
  }

  get maxMainPowers() : number {
    switch (this.source.system.type) {
      case "pc":
      case "npcAlly":
        return 8;
      case "shadow":
        if (this.isPersona()) {return 8;}
        return 25;
      default:
        this.source.system satisfies never;
        return -1;
    }
  }

  maxDefensiveBoosts() : number {
    const baseBoosts = this.#baseDefenseBoosts();
    const situation: Situation = {
      user: this.user.accessor,
      target: this.user.accessor,
    };
    const bonusBoosts =this.getPassiveBonusesIgnoreAuras("max-defense-boosts").total(situation);
    return baseBoosts + bonusBoosts;
  }

  #baseDefenseBoosts() : number {
    switch (this.source.system.type) {
      case "pc": return 1;
      case "shadow": {
        if (this.source.isCustomPersona()) {return 1;}
        return 2;
      }
      case "npcAlly": return 1;
      default:
        this.source.system satisfies never;
        return 0;
    }
  }

  maxResists () : number {
    const baseResists = this.#baseResists();
    const situation: Situation = {
      user: this.user.accessor,
      target: this.user.accessor,
    };
    const bonusBoosts = this.getPassiveBonusesIgnoreAuras("max-resist-boosts").total(situation);
    return baseResists + bonusBoosts;
  }

  #baseResists() : number {
    switch (this.source.system.type) {
      case "pc": return -1;
      case "shadow" : {
        if (this.source.isCustomPersona()) {
          return -1;
        }
        return 1;
      }
      case "npcAlly": return -1;
      default:
        this.source.system satisfies never;
        return -999;
    }
  }

  get isOverResistCap(): boolean {
    return this.source.totalResists() > this.maxResists();
  }

  // wpnAtkBonus() : Calculation {
  //   const mods = this.getBonuses(["allAtk", "wpnAtk"]);
  //   const wpnAtk = this.combatStats.baseWpnAttackBonus();
  //   return wpnAtk.add(1, mods, "Mods");
  // }

  // magAtkBonus() : Calculation {
  //   const mods = this.getBonuses(["allAtk", "magAtk"]);
  //   const magAtk = this.combatStats.baseMagAttackBonus();
  //   return magAtk.add(1, mods, "Mods");
  // }

  // instantDeathAtkBonus() : Calculation {
  //   const mods = this.getBonuses(["instantDeathRange"]);
  //   const deathAtk = this.combatStats.baseDeathAtkBonus();
  //   return deathAtk.add(1, mods, "Mods");
  // }

  // ailmentAtkBonus() : Calculation {
  //   const mods = this.getBonuses("afflictionRange");
  //   const ailAtk = this.combatStats.baseAilmentAtkBonus();
  //   return ailAtk.add(1, mods, "Mods");
  // }

  itemAtkBonus(item : Consumable) : Calculation {
    const calc=new Calculation();
    const mods = this.getBonuses(["itemAtk", "allAtk"]);
    return calc
      .add(1, item?.system?.atk_bonus ?? 0, "Item Modifier")
      .add(1, mods, "Modifiers");
  }

  get isUnderResistCap(): boolean {
    const leeway  = 0;  //allow leeway for double weakness
    return this.source.totalResists() + leeway < this.maxResists();
  }

  hpCostMod() : ModifierList {
    return this.getBonuses("hpCostMult");
  }

  canUsePower_getIneligibilityReason (usable: UsableAndCard) : N<string> {
    const msg =
    this._consumableCheck(usable)
    || this._explorationCheck(usable)
    || this._combatTypeCheck(usable)
    || this._downtimeUsageCheck(usable)
    || this._powerInhibitingStatusCheck(usable)
    || this._powerTooStrong(usable)
    || this._deadCheck(usable)
    || this._isTrulyUsable(usable)
    || this._canPayActivationCostCheck(usable)
    || this._checkConditionals(usable)
    || this._checkTeamworkMove(usable)
    || this._checkCooldown(usable)
    || this._pauseCheck()
    ;
    return msg;
  }

  canUsePower (usable: UsableAndCard, outputReason: boolean) : boolean {
    const msg = this.canUsePower_getIneligibilityReason(usable);
    // this._consumableCheck(usable)
    // || this._explorationCheck(usable)
    // || this._combatTypeCheck(usable)
    // || this._downtimeUsageCheck(usable)
    // || this._powerInhibitingStatusCheck(usable)
    // || this._powerTooStrong(usable)
    // || this._deadCheck(usable)
    // || this._isTrulyUsable(usable)
    // || this._canPayActivationCostCheck(usable)
    // || this._checkConditionals(usable)
    // || this._checkTeamworkMove(usable)
    // || this._checkCooldown(usable)
    // || this._pauseCheck()
    // ;
    if (msg === null) {return true;}
    if (outputReason) {
      ui.notifications.warn(msg);
    }
    return false;
  }

  private _pauseCheck() : N<FailReason> {
    if (game.paused && !game.user.isGM) {
      return "Game is Paused";
    }
    return null;
  }

  private _checkTeamworkMove(power: UsableAndCard) :N<FailReason> {
    if (!power.isTeamwork() ) {return null;}
    const combat= PersonaCombat.combat;
    if (!combat || !combat.combatant) {return "No Combat, can't use teamwork move";}
    if (combat.combatant?.actor == this.user) {
      return "Can't use a teamwork move during your own turn";
    }
    if (this.user.hasStatusOfType("distracting")) {
      return "Can't use a teamwork move while distracted";
    }
    //this breaks determining if move is usable  from followup to find moves ready to be used beofre passing the turn
    // if (!this.user.hasStatusOfType("enable-teamwork")) {
    //   return "Requires a status effect that allows teamwork moves";
    // }
    return null;
  }

  private _isTrulyUsable( usable: UsableAndCard) : N<FailReason> {
    if (!usable.isTrulyUsable()) {
      return `${usable.name} isn't a usable type of Power or Item`;
    }
    return null;
  }

  private _deadCheck(usable: UsableAndCard) : N<FailReason> {
    if (!this.user.isAlive() && !usable.hasTag("usable-while-dead", this)) {return "Can't Use While Unconscious";}
    return null;
  }

  private _powerTooStrong(usable: UsableAndCard) : N<FailReason> {
    if (usable.isPower() && this.highestPowerSlotUsable() < usable.system.slot) {
      return "Power is too advanced for you to use";
    }
    return null;
  }

  private _consumableCheck(usable: UsableAndCard) : N<FailReason> {
    if (usable.isConsumable() && !usable.canUseConsumable(this.user)) {
      return "You don't meet the conditions to use this consumable";
    }
    return null;
  }

  private _explorationCheck (usable: UsableAndCard) : N<FailReason> {
    if (usable.hasTag("exploration", this) && !usable.hasTag("combat", this)) {
      if (Metaverse.getPhase() == "combat") {
        return "Can't use this during combat";
      }
    }
    return null;
  }

  private _combatTypeCheck(usable: UsableAndCard) : N<FailReason> {
    if (game.user.isGM) {return null;}
    const phase= Metaverse.getPhase();
    switch (phase) {
      case "downtime":
        if (!usable.canBeUsedInDowntime()) {
          return "This can't be used during Downtime";
        }
        break;
      case "combat":
        if (!usable.canBeUsedInCombat()) {
          return "This can't be used during Combat";
        }
        break;
      case "exploration":
        if (!usable.canBeUsedInExploration()) {
          return "This can't be used during Exploration";
        }
        break;
      default:
        phase satisfies never;
    }
    return null;
  }

  private _downtimeUsageCheck(usable: UsableAndCard) : N<FailReason> {
    if (Metaverse.getPhase() != "downtime") {return null;}
    if (usable.hasTag("downtime-minor", this)) {
      if (!this.user.isPC()) {return "Only PCs can take downtime minor actions";}
      if (!PersonaSocial.hasMinorSocialAction(this.user) && !PersonaSettings.debugMode()) {
        return "You don't have a social minor action";
      }
    }
    return null;
  }

  private _powerInhibitingStatusCheck(usable: UsableAndCard) : N<FailReason> {
    const user = this.user;
    switch (true) {
      case (user.hasStatus("rage")
        && usable != PersonaDB.getBasicPower("Basic Attack") ): {
          return "Can't only use Basic Attack while having Rage Status";
        }
      case user.hasStatus("sealed")
          && usable.isPower()
          && !usable.isBasicPower()
          && !usable.hasTag("usable-while-sealed", this):
        return " Can't take that action because of status: Sealed";
    }
    return null;
  }

  canPayActivationCost(usable: UsableAndCard) : boolean {
    return this._canPayActivationCostCheck(usable) == null;
  }

  private _canPayActivationCostCheck(usable: UsableAndCard) : N<FailReason> {
    switch (this.user.system.type) {
      case "npcAlly":
      case "pc":
        return (this as Persona<PC | NPCAlly>)._canPayActivationCostCheck_pc(usable);
      case "shadow":
        return (this as Persona<Shadow>)._canPayActivationCostCheck_shadow(usable);
      default:
        this.user.system satisfies never;
        throw new PersonaError("Unknown Type");
    }
  }

  private _checkCooldown(usable: UsableAndCard) : N<FailReason> {
    if (!usable.isPower()) {return null;}
    if (this.user.isPowerOnCooldown(usable)) {
      return "Power is on cooldown";
    }
    return null;
  }

  public isPowerOnCooldown(power: Power) : boolean {
    return this.user.isPowerOnCooldown(power);
  }

  private _checkConditionals(usable: UsableAndCard) : N<FailReason> {
    const effects= usable.getTriggeredEffects(this.user, {triggerType: "on-power-usage-check"});
    const situation : Situation = {
      trigger : "on-power-usage-check",
      user: this.user.accessor,
      usedPower: usable.accessor,
      triggeringUser: game.user,
    };
    for (const eff of effects) {
      const cons = eff.getActiveConsequences(situation);
      const cancelEffect = cons.find(cons => cons.type =="cancel");
      if (cancelEffect) {
        return `Failed due to Conditional ${ConditionalEffectPrinter.printConditions(eff.conditions)}`;
      }
    }
    return null;
  }

  private _canPayActivationCostCheck_pc(this: Persona<PC | NPCAlly>, usable: UsableAndCard) : N<FailReason> {
    switch (usable.system.type) {
      case "power": {
        if (usable.system.tags.includes("basicatk")) {
          return null;
        }
        switch (usable.system.subtype) {
          case "weapon":
            if ( this.user.hp <= (usable as Power).hpCost()) {return "HP cost would kill user";}
            break;
          case "magic": {
            const mpcost = (usable as Power).mpCost(this);
            if (mpcost > 0 && this.user.mp < mpcost) {
              return "Can't afford MP Cost";
            }
          }
            break;
          case "social-link": {
            const inspirationId = usable.system.inspirationId;
            if (!this.user.isPC()) {return "Non-PCs can't use social-link powers";}
            if (inspirationId) {
              const socialLink = this.user.system.social.find( x=> x.linkId == inspirationId);
              if (!socialLink) {return "You don't have the social link required";}
              if (socialLink.inspiration < usable.system.inspirationCost) {
                return "You can't pay the inspiration cost";
              }
            } else {
              const inspiration = this.user.system.social.reduce( (acc, item) => acc + item.inspiration , 0);
              if (inspiration < usable.system.inspirationCost) {return "You can't pay the inspiration cost";}
            }
          }
            break;
          case "downtime": {
            const combat = PersonaCombat.combat;
            if (!combat || combat.isSocial) {return "Can only use this during downtime rounds";}
            break;
          }
          default:
            return null;
        }
      }
        break;
      case "consumable":
        if (usable.system.amount <= 0) {
          return "You don't have any of that consumable";
        }
        break;
      case "skillCard":
        if(!this.powerLearning.canLearnNewSkill()) {
          return "You have no space left to learn";
        }
    }
    return null;
  }

  private _canPayActivationCostCheck_shadow(this: Persona<Shadow>, usable: UsableAndCard) : N<FailReason> {
    if (usable.system.type == "skillCard") {
      return "Shadows cant use skill cards";
    }
    if (usable.isPower()) {
      const combat = game.combat;
      const energyRequired = usable.energyRequired(this);
      const energyCost = usable.energyCost(this);
      const currentEnergy = this.user.system.combat.energy.value;
      if (combat && energyRequired > 0 && energyRequired > currentEnergy) {
        return `Requires ${energyRequired} energy and you only have ${currentEnergy}`;
      }
      if (combat && energyCost > (currentEnergy + 3)) {
        return (`Costs ${energyCost} energy and you only have ${currentEnergy}`);
      }
      if (usable.system.reqHealthPercentage < 100) {
        const reqHp = (usable.system.reqHealthPercentage / 100) * this.user.mhpEstimate ;
        if (this.user.hp > reqHp) {
          return `Power Only Usable when Hp < ${reqHp}`;
        }
      }
    }
    return null;
  }

  hasTag(tag: PersonaTag) : boolean {
    return this.tags.hasTag(tag);
  }

  // private getCacheValue<T extends keyof PersonaClassCache> (key: T, refreshFn: ( ()=> NonNullable<PersonaClassCache[T]>)): NonNullable<PersonaClassCache[T]> {
  //   if (!PersonaSettings.agressiveCaching()) {
  //     return refreshFn();
  //   }
  //   const data = this.#cache[key];
  //   if (data != undefined) {
  //     return data;
  //   }
  //   this.#cache[key] = refreshFn();
  //   return this.#cache[key]!;
  // }

  realTags() : Tag[] {
    return this.tags.realTags();
  }

  highestPowerSlotUsable() : 0 | 1 | 2 | 3 {
    const POWER_MAX = 3 as const;
    if (this.user.isShadow()) {return POWER_MAX;}
    const level = Math.floor(this.user.level / 10) +1;
    const CAP = this.user.system.combat.usingMetaPod ? 2 : POWER_MAX;
    const maxLevel = this.source.isShadow() && !this.source.isCustomPersona() ? POWER_MAX : this.#powerSlotMaxByLevel(level);
    return Math.min(CAP, maxLevel) as 0 | 1 | 2 | 3;
  }

  #powerSlotMaxByLevel(this: void, level: number) {
    switch (true) {
      case level > 6: return 3;
      case level > 4: return 2;
      case level > 2: return 1;
      default: return 0;
    }

  }

  getBonusWpnDamage() : ModifierList {
    return this.getBonuses("wpnDmg");
  }

  getBonusVariance() : ModifierList {
    return this.getBonuses("variance");
  }

  async levelUp_manual() {
    const level = this.source.system.combat.personaStats.pLevel;
    const currXP = this.source.system.combat.personaStats.xp;
    const XPForNext = LevelUpCalculator.minXPForEffectiveLevel(level + 1);
    const XPNeeded = XPForNext - currXP;
    console.log(`${this.name} XP needed: ${XPNeeded}`);
    await this.awardXP(XPNeeded, false);
  }

  get isHypothetical() : boolean {
    return false;
  }

  get isCompendiumEntry() : boolean {
    return this.source.isCompendiumEntry;
  }

  get isActivateable() : boolean {
    if (this.isHypothetical) {return false;}
    if (!this.source.hasPlayerOwner) {return false;}
    return this.user.personaList
      .some( persona => this.equals(persona));
  }

  get isActive() : boolean {
    return this.user.persona().equals(this);
  }

  get isPartial() : boolean {
    return this.isHypothetical;
  }

  canCache(options: U<MainModifierOptions> ) : boolean {
    if (!this.cachingEnabled) {return false;}
    if (options?.omitPowers) {return false;}
    if (options?.omitTalents) {return false;}
    if (options?.omitTags) {return false;}
    return true;

  }
  get cachingEnabled() : boolean {
    const PersonaCaching = PersonaSettings.agressiveCaching();
    return !this.isPartial && PersonaCaching;
  }

  get maxEnergy() : number {
    if (!this.user.isShadow()) {return 0;}
    const BASE_MAX_ENERGY = 10;
    const situation = {
      user: this.user.accessor,
    };
    const maxEnergy = BASE_MAX_ENERGY + this.getPassiveBonusesIgnoreAuras("max-energy").total(situation);
    return maxEnergy;
  }

  get hp() : number {
    return this.user.hp;
  }

  get mhp() : number {
    return Math.round(this.combatStats.mhpCalculation().total);
  }

  get mmp() : number {
    if (this.user.isShadow()) {return 0;}
    const val = Math.round(this.combatStats.mmpCalculation().total);
    void this.user.refreshMaxMP(val);
    return val;
  }

  possibleElementTypes(): RealDamageType[] {
    return this.powers
      .filter (pwr => pwr.system.damageLevel != "none")
      .filter( x=> {
        const dtype  = x.getDamageType(this.user);
        switch (dtype) {
          case "none":
          case "healing":
            return false;
        }
        return true;
      })
      .map ( x=> x.getDamageType(this.user));
  }

  get compendiumEntry(): U<Shadow> {
    return this.source.compendiumEntry;
  }

  get maxPowers() : number {
    if (this.source.isNPCAlly()) {
      return 8;
    }
    const extraMaxPowers = this.getPassiveBonusesIgnoreAuras("extraMaxPowers");
    return 8 + extraMaxPowers.total ( {user: this.user.accessor});
  }

  get sideboardPowers() : Power[] {
    return this.user.sideboardPowers;
  }


  get needsToDeleteMainPower() : boolean {
    return this.mainPowers.length > this.maxPowers
      || this.source.topLearnedBuffer != undefined ;
  }

} // end of class


interface PersonaClassCache {
  mainModifiers: U<ConditionalEffectC[]>;
  passivePowers: U<readonly Power[]>;
  defensiveModifiers: U<ConditionalEffectC[]>;
  passiveModifiers: U<ConditionalEffectC[]>;
  nearbyAuras:  U<ConditionalEffectC[]>;
  mainModifiersList: U<readonly ModifierContainer[]>;
  // tagListPartial: U<(PersonaTag | Tag["id"] | InternalCreatureTag)[]>;
}

export interface MainModifierOptions {
  omitPowers?: boolean;
  omitTalents?: boolean;
  omitTags ?: boolean;
  omitAuras ?: boolean;
}

type FailReason = string;


interface PrintableResistData {
  /** Path to icon */
  icon: string;
  damageType: RealDamageType;
  resistance: ResistStrength;
  resistanceLoc: string;
  modified: "normal" | "upgraded" | "downgraded"
}
