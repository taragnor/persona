import { Consequence, ConsequenceAmountV2 } from "../../config/consequence-types.js";
import {NonDeprecatedModifierTarget, NonDeprecatedModifierType} from "../../config/item-modifiers.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {ModifierV2Target} from "../bonus-calc.js";
import {ModifierContainer, PersonaItem} from "../item/persona-item.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {MultiTierCache, PermanentCache, TimedCache} from "../utility/cache.js";
import {CETypes, ConditionalEffectManager} from "./conditional-effect-manager.js";
import {ConditionalEffectPrinter} from "./conditional-effect-printer.js";
import { ConsequenceC} from "./consequence-class.js";
import {PreconditionC} from "./precondition-class.js";
import {testPrecondition} from "./preconditions.js";

export class ConditionalEffectC {

  static _lastCreationId = 1;

  #CACHE_TIME = 5000;

  static batchConverted = new Set<ConditionalEffectC>();

  private _preconditions : readonly PreconditionC[];
  private _consequences: readonly ConsequenceC[];
  private _isEmbedded : boolean;
  private _original : CondEffectObject | CardItem;
  private _conditionalType: typeof CETypes[number];
  private _isDefensiveRaw: boolean;
  private _isMainModifier: boolean;
  private _isAura: boolean;
  private _embeddedEffects : ConditionalEffectC[] = [];
  private _grantedBonuses: Set<NonDeprecatedModifierTarget>= new Set();

  private _ownershipData: EffectOwnershipData;

  static EmptyCE = this.createConsequenceOnly([], null, null, null);


  static NULL_OWNERSHIP : EffectOwnershipData= {
    owner: undefined,
    source: undefined,
    realSource: undefined,
    _id: -1,
    creationId: -1,
  };
  static parents = new WeakMap<object, ConditionalEffectC>();
  static parentsCreationId = new Map<number, WeakRef<ConditionalEffectC>>();

  #cache = {
    cancelEffects: new PermanentCache( () => this._hasCancelEffects()),
    allowOpenersForPowers: new TimedCache( () => this._canAllowOpenersForPowers(), this.#CACHE_TIME),
    bonusTypes : new MultiTierCache( (bonusType: ModifierV2Target) => new TimedCache ( () => this._grantsBonusType(bonusType) , this.#CACHE_TIME)),
  };

  private constructor (card: CardItem);
  private constructor (ce: CondEffectObject, sourceItem: N<ConditonalEffectHolderItem> , sourceActor: N<PersonaActor>, realSource ?: N<ConditonalEffectHolderItem>);
  private constructor (ce: CondEffectObject | CardItem, sourceItem?: N<ConditonalEffectHolderItem> , sourceActor?: N<PersonaActor>, realSource ?: N<ConditonalEffectHolderItem>) {
    if (ce instanceof PersonaItem)  {
      this._generateCardEffects(ce);
      return;
    }
    this._original = ce;
    this._buildOwnershipData(sourceItem!, sourceActor!, realSource!);
    this._buildCoreData(ce);
    this._isEmbedded = ce.isEmbedded ?? false;
    this._isAura = ce.isAura ?? false;
    this._conditionalType = this.#determineConditionalType(ce, this._preconditions, this._consequences, sourceItem!);
    this._isDefensiveRaw = ce.isDefensive ?? false;
    this._isMainModifier = !this._isEmbedded && !this._isAura;
    this.setGrantedBonuses();
  }

  private _buildOwnershipData( sourceItem: N<ConditonalEffectHolderItem> , sourceActor: N<PersonaActor>, realSource : N<ConditonalEffectHolderItem>) {
    const creationId= ConditionalEffectC.getCreationId();
    this._ownershipData = {
      owner: sourceActor?.accessor,
      source: sourceItem != null ? sourceItem.accessor : undefined,
      realSource: realSource? realSource.accessor: undefined,
      creationId,
      _id: creationId,
    };
    Object.freeze(this._ownershipData);
    return this._ownershipData;
  }

  //alternate
  private _buildCoreData(ce: CondEffectObject) {
    this._preconditions = PreconditionC.fromArrayLike(ce.conditions, this);
    this._consequences = ConsequenceC.fromArrayLike(ce.consequences, this);
  }


  private setGrantedBonuses() {
    this._grantedBonuses = this.consequences.reduce<Set<NonDeprecatedModifierType>>( (acc, consC) => {
      const cons = consC.cons;
      if ('modifiedFields' in cons) {
        Object.entries(cons.modifiedFields)
          .filter( ([_k,v])=> v == true)
          .forEach ( ([k,_v]) => acc.add(k as NonDeprecatedModifierType));
      }
      if ('modifiedField' in cons) {
        acc.add(cons.modifiedField);
      }
      return acc;
    }, new Set());
  }

  static getCreationId() {
    return this._lastCreationId++;
  }

  static convertBatch(ceArr: CondEffectObject[], sourceItem: N<ConditonalEffectHolderItem> , sourceActor: N<PersonaActor>, realSource ?: ConditonalEffectHolderItem) : ConditionalEffectC[] {
    const arr = ceArr
      .map( x=> new ConditionalEffectC(x, sourceItem, sourceActor, realSource) );
    arr.forEach(x=> ConditionalEffectC.batchConverted.add(x));
    if (arr.some(ce=> ce._isEmbedded)) {
      const embedded = arr.filter(x=> x._isEmbedded);
      arr.forEach(ce => ce._embeddedEffects = !ce._isEmbedded ? embedded : []);
    }
    return arr;
  }

  static createPreconditionOnly(
    preconditionArr: readonly Precondition[],
    sourceItem: N<ConditonalEffectHolderItem> = null,
    sourceActor: N<PersonaActor> = null,
    realSource : N<ConditonalEffectHolderItem> = null)
    :ConditionalEffectC {
    const condEffectObject = this.createDummyCondEffectObject(preconditionArr, []);
    return new ConditionalEffectC(condEffectObject, sourceItem, sourceActor, realSource);
  }

  static createConsequenceOnly(
    consequenceArr: readonly Consequence[],
    sourceItem: N<ConditonalEffectHolderItem>,
    sourceActor: N<PersonaActor>,
    realSource ?: N<ConditonalEffectHolderItem>)  :ConditionalEffectC {
    const condEffectObject = this.createDummyCondEffectObject([], consequenceArr);
    return new ConditionalEffectC(condEffectObject, sourceItem, sourceActor, realSource);
  }

  private static createDummyCondEffectObject(conditions: readonly Precondition[], consequences: readonly Consequence[]): CondEffectObject {
    const condEffectObject = {
      conditions: conditions,
      consequences: consequences,
      isDefensive: false,
      isEmbedded: false,
      isAura: false,
    } satisfies CondEffectObject;
    return condEffectObject;
  }

  static fromCard( card: CardItem) {
    return new ConditionalEffectC(card);
  }

  getEmbeddedEffects() {
    return this._embeddedEffects;
  }

  get conditionalType () {
    return this._conditionalType;
  }

  get displayedName() : string {
    return this.name;
  }

  get name() : string {
    let ret = "";
    if (this.realSource && !PersonaDB.accessorEq(this.realSource, this.source)) {
      ret += this.findRealSource()?.name;
    }
    if (this.source) {
      const sourceName = this.findSource()?.name;
      ret += ` (${sourceName})`;
    }
    if (this.owner) {
      const ownerName = this.findOwner()?.name;
      ret += ` (${ownerName})`;
    }
    if (ret.length == 0) {
      return "unknown";
    }
    return ret;
  }

  toString() : string {
    const text = ConditionalEffectPrinter.printEffect(this);
    return `${this.name} : ${text}`;
  }

  toJSON() : ConditionalEffect {
    const conditions = this._conditionsRaw();
    const consequences = this._consequencesRaw();
    const ret: ConditionalEffect = {
      isDefensive: this._isDefensiveRaw,
      isEmbedded: this._isEmbedded,
      isAura: this._isAura,
      conditions,
      consequences,
    };
    return ret;
  }

  get ownershipInfo() : EffectOwnershipData {
    return this._ownershipData;
  }

  grantsBonusTypeV1(btype: NonDeprecatedModifierTarget) : boolean {
    return this._grantedBonuses.has(btype);
  }

  grantsBonusTypeV2(btype: ModifierV2Target) {
    return this.#cache.bonusTypes.get(btype);
  }

  _grantsBonusType( btype : ModifierV2Target) : boolean {
    return this.consequences
      .some(cons => cons.cons.type == "modifier-v2"
        && cons.cons.modTarget== btype
      );
  }

  private _conditionsRaw(): ConditionalEffect["conditions"] {
    // return this.conditions.slice();
    return this.conditions.map(cond => cond.cond);
  }

  private _consequencesRaw(): ConditionalEffect["consequences"] {
    // return this.consequences.slice();
    return this.consequences.map(cons => cons.cons);
  }

  get conditions() {
    return this._preconditions;
  }

  get conditionsRaw() : Precondition[] {
    return this._preconditions.map( x=> x.cond);
  }

  get consequences() {
    return this._consequences;
  }

  get consequencesRaw() : Consequence[] {
    return this._consequences.map( x=> x.cons);
  }

  get isDefensive(): boolean {
    return this._conditionalType == "defensive";
  }

  get isMainModifier() :boolean {
    return this._isMainModifier;
  }

  get isEmbedded(): boolean {
    return this._isEmbedded;
  }

  get isAura() : boolean {
    return this._isAura;
  }

  findSource() { return this.source ? PersonaDB.find(this.source) : undefined;}
  findRealSource() { return this.realSource ? PersonaDB.find(this.realSource) : undefined;}
  findOwner() { return this.owner ? PersonaDB.find(this.owner) : undefined;}
  get source() { return this._ownershipData.source;}
  get realSource() { return this._ownershipData.realSource;}
  get owner() { return this._ownershipData.owner; }

  equals( other: ConditionalEffectC) : boolean {
    return this._original == other._original;
  }

  testPreconditions(situation: Situation) : boolean {
    if (!this.conditions
      .every( cond=>testPrecondition(cond.cond, situation, cond.ownershipInfo))
    ) {return false;}
    return true;
  }

  getFailedPreconditions(situation: Situation) : ConditionalEffectC["conditions"] {
    return this.conditions
      .filter( cond => testPrecondition(cond.cond, situation, cond.ownershipInfo) == false);
  }


  canCancel(): boolean {
    return this.#cache.cancelEffects.value;
  }

  private _hasCancelEffects() : boolean {
    return this.consequences.some(cons => cons.cons.type == "trigger-event-cons"
      && cons.cons.eventMod == "cancel");
  }

  getActiveConsequences(situation: Situation) : ConditionalEffectC["consequences"] {
    if (!this.conditions
      .every( cond=> testPrecondition(cond.cond, situation, cond.ownershipInfo))
    ) {return [];}
    return this.consequences;
  }

  static failedPreconditions(conditions: readonly PreconditionC[], situation: Situation): PreconditionC[];
  static failedPreconditions(conditions: readonly SourcedPrecondition[], situation: Situation, ownershipInfo: EffectOwnershipData) : SourcedPrecondition[];
  static failedPreconditions(conditions: readonly (PreconditionC | SourcedPrecondition)[], situation: Situation, ownershipInfo?: EffectOwnershipData) {
    return conditions
      .filter( cond=> {
        const ownership = cond instanceof PreconditionC ? cond.ownershipInfo: ownershipInfo!;
        const pc = cond instanceof PreconditionC ? cond.cond: cond;
        return testPrecondition(pc, situation, ownership) == false;
      });
  }

  failedPreconditions(situation: Situation) : ConditionalEffectC["conditions"] {
    return ConditionalEffectC.failedPreconditions(this.conditions, situation);
  }

  toFailReasonString(situation ?: Situation) : string {
    const conditions = situation? this.failedPreconditions(situation) : this.conditions;
    return `${this.name}: ${ConditionalEffectPrinter.printConditions(conditions)}`;
  }

  getCancelEffectReason(situation: Situation) : ConditionalEffectC["conditions"] {
    if (!this.canCancel()) {return [];}
    if (! this.testPreconditions(situation)) {return [];}
    return this.conditions;
  }

  checkForCancelEffect(situation: Situation) : boolean {
    return this.canCancel() && this.testPreconditions(situation);
  }

  getModifierAmount(targetMods: NonDeprecatedModifierTarget[] | NonDeprecatedModifierTarget) : (number | Sourced<ConsequenceAmountV2>)[] {
    return ConditionalEffectC.getModifierAmount(this.consequences, targetMods);
  }

  #determineConditionalType (ce: CondEffectObject, _conditions: ConditionalEffectC["conditions"], _consequences : ConditionalEffectC["consequences"], sourceItem: N<ConditonalEffectHolderItem> ) : this["conditionalType"] {
    let condType : this["conditionalType"] = "unknown";
    const forceDefensive = (sourceItem?.isDefensive)
      ? sourceItem.isDefensive()
      : false;
    switch (true) {
      case forceDefensive || ce.isDefensive:
        return "defensive";
      default:
        // if (sourceItem!.name == "Soma") {debugger;}
        condType = !forceDefensive ? ConditionalEffectManager.getConditionalType(ce, sourceItem): "defensive";
        if (condType == "unknown" && sourceItem) {
          return (sourceItem.defaultConditionalEffectType) ? sourceItem.defaultConditionalEffectType() : "passive";
        }
    }
    return condType;
  }

  public canAllowOpenersForPowers() : boolean {
    return this.#cache.allowOpenersForPowers.value;
  }

  _canAllowOpenersForPowers() : boolean {
    return this._consequences
      .some (cons =>
        cons.canAllowOpenersForPowers()
      );
  }

  private _generateCardEffects(card: CardItem) {
    this._original = card;
    const id = ConditionalEffectC.getCreationId();
    this._ownershipData = {
      source : card.accessor,
      owner : card.parent?.accessor,
      realSource: undefined,
      creationId: id,
      _id : id,
    };
    this._isEmbedded = false;
    this._conditionalType = "on-use";
    if (card.isSkillCard()) {
      return this._generateSkillCardTeachEffect(card);
    }
    if (card.isPersonaCard()) {
      return this._generatePersonaCardEffect(card);
    }
    PersonaError.softFail(`Unhandled card type ${card.system.subtype}`, card);
  }

  private _generateSkillCardTeachEffect(card: SkillCard) {
    if (!card.system.skillId) {
      this._preconditions = [];
      this._consequences = [];
      return;
    }
    this._preconditions = [
      new PreconditionC({
        type: 'always',
      }
        , this)];
    this._consequences= [
      new ConsequenceC( {
        type: 'other-effect',
        otherEffect: "teach-power",
        randomPower: false,
        id: card.system.skillId,
        applyTo: "user",
      } satisfies ConditionalEffect["consequences"][number], this)
    ];
  }

  private _generatePersonaCardEffect(card: PersonaCard) {
    if (!card.system.shadowId) {
      this._preconditions = [];
      this._consequences = [];
      return;
    }
    this._preconditions = [
      new PreconditionC( {
        type: 'always',
      }, this)
    ];
    this._consequences= [
      new ConsequenceC( {
      type: 'other-effect',
      otherEffect: "grant-persona",
      id: card.system.shadowId,
      applyTo: "user",
    } satisfies ConditionalEffect["consequences"][number], this)
    ];
  }

    static getModifierAmount(consequences: ConditionalEffectC["consequences"], targetMods: NonDeprecatedModifierTarget[] | NonDeprecatedModifierTarget) : (number | Sourced<ConsequenceAmountV2>)[] {
    targetMods = Array.isArray(targetMods) ? targetMods : [targetMods];
      return consequences.map( c=> {
        const cons = c instanceof ConsequenceC ? c.toSourced() : c;
        const ret = ConsequenceC.getModifierAmount(cons, targetMods);
        return ret;
      })
      .filter (x => x != null);

  }

}

type CondEffectObject = ConditionalEffect;

export type ConditonalEffectHolderItem = ModifierContainer & CEItemData;

type CEItemData =
  Partial< {
    isDefensive : () => boolean, defaultConditionalEffectType: () => TypedConditionalEffect["conditionalType"]
  } > ;


export type EffectOwnershipData = {
  source: U<ModifierContainer["accessor"]>;
  owner: U<UniversalActorAccessor<PersonaActor>>;
  realSource: U<ModifierContainer["accessor"]>;
  creationId: number;
  _id: number;
};


