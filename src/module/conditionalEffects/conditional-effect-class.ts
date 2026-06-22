import { ConsequenceAmountV2, NonDeprecatedConsequence } from "../../config/consequence-types.js";
import {NonDeprecatedModifierTarget} from "../../config/item-modifiers.js";
import {NonDeprecatedPrecondition} from "../../config/precondition-types.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {ModifierV2Target} from "../bonus-calc.js";
import {ModifierContainer, PersonaItem} from "../item/persona-item.js";
import {PersonaAE} from "../persona-ae.js";
import {PersonaDB} from "../persona-db.js";
import {MultiTierCache, PermanentCache, TimedCache} from "../utility/cache.js";
import {CETypes, ConditionalEffectManager} from "./conditional-effect-manager.js";
import {ConditionalEffectPrinter} from "./conditional-effect-printer.js";
import {ConsequenceAmountResolver} from "./consequence-amount.js";
import {testPrecondition} from "./preconditions.js";

export class ConditionalEffectC {

  #CACHE_TIME = 5000;

  _preconditions : SourcedPrecondition<NonDeprecatedPrecondition<Precondition>>[];
  _consequences: SourcedConsequence<NonDeprecatedConsequence>[];
  _isEmbedded : boolean;
  _source: U<ModifierContainer["accessor"]>;
  _owner: U<UniversalActorAccessor<PersonaActor>>;
  _realSource: U<ModifierContainer["accessor"]>;
  _original : CondEffectObject | SkillCard;
  _conditionalType: typeof CETypes[number];
  _isDefensiveRaw: boolean;
  _isMainModifier: boolean;
  _isAura: boolean;

  #cache = {
    cancelEffects: new PermanentCache( () => this._hasCancelEffects()),
    allowOpenersForPowers: new TimedCache( () => this._canAllowOpenersForPowers(), this.#CACHE_TIME),
    bonusTypes : new MultiTierCache( (bonusType: ModifierV2Target) => new TimedCache ( () => this._grantsBonusType(bonusType) , this.#CACHE_TIME)),
  };

  constructor (card: SkillCard);
  constructor (ce: CondEffectObject, sourceItem: N<ConditonalEffectHolderItem> , sourceActor: N<PersonaActor>, realSource ?: ConditonalEffectHolderItem);
  constructor (ce: CondEffectObject | SkillCard, sourceItem?: N<ConditonalEffectHolderItem> , sourceActor?: N<PersonaActor>, realSource ?: ConditonalEffectHolderItem) {
    if (ce instanceof PersonaItem)  {
      this._generateSkillCardTeachEffect(ce);
      return;
    }
    this._original = ce;
    this._preconditions = ConditionalEffectManager.getConditionals(ce.conditions, sourceItem!, sourceActor!, realSource);
    this._consequences = ConditionalEffectManager.getConsequences(ce.consequences, sourceItem!, sourceActor!, realSource);
    this._isEmbedded = ce.isEmbedded ?? false;
    this._isAura = ce.isAura ?? false;
    this._conditionalType = this.#determineConditionalType(ce, this._preconditions, this._consequences, sourceItem!);
    this._owner= sourceActor?.accessor;
    this._source= sourceItem != null ? sourceItem.accessor : undefined;
    this._realSource= realSource? realSource.accessor: undefined;
    this._isDefensiveRaw = ce.isDefensive ?? false;
    this._isMainModifier = !this._isEmbedded && !this._isAura;
  }

  get conditionalType () {
    return this._conditionalType;
  }

  get displayedName() : string {
    return this.name;
  }

  get name() : string {
    let ret = "";
    if (this._realSource && !PersonaDB.accessorEq(this._realSource, this._source)) {
      ret += PersonaDB.find(this._realSource)?.name;
    }
    if (this._source) {
      const sourceName = PersonaDB.find(this._source)?.name;
      ret += ` (${sourceName})`;
    }
    if (this._owner) {
      const ownerName = PersonaDB.find(this._owner)?.name;
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

  grantsBonusType(btype: ModifierV2Target) {
    return this.#cache.bonusTypes.get(btype);
  }

  _grantsBonusType( btype : ModifierV2Target) : boolean {
    return this.consequences
      .some(cons => cons.type == "modifier-v2"
        && cons.modTarget== btype
      );
  }

  private _conditionsRaw(): ConditionalEffect["conditions"] {
    return this.conditions;
  }

  private _consequencesRaw(): ConditionalEffect["consequences"] {
    return this.consequences;
  }

  get conditions() {
    return this._preconditions;
  }

  get consequences() {
    return this._consequences;
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

  findSource() { return this._source ? PersonaDB.find(this._source) : undefined;}
  findRealSource() { return this._realSource ? PersonaDB.find(this._realSource) : undefined;}
  findOwner() { return this._owner ? PersonaDB.find(this._owner) : undefined;}
  get source() { return this._source;}
  get realSource() { return this._realSource;}
  get owner() { return this._owner; }

  equals( other: ConditionalEffectC) : boolean {
    return this._original == other._original;
    // &&
    // PersonaDB.accessorEq(this._realSource,other._realSource);
    // && PersonaDB.accessorEq(this._source, other._source);
  }

  testPreconditions(situation: Situation) : boolean {
    if (!this.conditions
      .every( cond=>testPrecondition(cond, situation))
    ) {return false;}
    return true;
  }

  getFailedPreconditions(situation: Situation) : ConditionalEffectC["conditions"] {
    return this.conditions
      .filter( cond => testPrecondition(cond, situation) == false);
  }


  canCancel(): boolean {
    return this.#cache.cancelEffects.value;
  }

  private _hasCancelEffects() : boolean {
    return this.consequences.some(cons => cons.type == "trigger-event-cons"
      && cons.eventMod == "cancel");
  }

  getActiveConsequences(situation: Situation) : ConditionalEffectC["consequences"] {
    // const source = this.source;
    if (!this.conditions
      .every( cond=>testPrecondition(cond, situation))
    ) {return [];}
    return this.consequences;
    // return this.consequences.map( cons => ({
    //   ...cons,
    //   source,
    //   owner: this.owner,
    // }));
  }

  static failedPreconditions(conditions: SourcedPrecondition[], situation: Situation) {
    return conditions
      .filter( cond=>testPrecondition(cond, situation) == false);
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
    // const activeCons = this.getActiveConsequences(situation);
    // if (activeCons.some(cons => cons.type == "trigger-event-cons"
    //   && cons.eventMod == "cancel")) {
    //   return this.conditions;
    // }
  }

  checkForCancelEffect(situation: Situation) : boolean {
    return this.canCancel() && this.testPreconditions(situation);
    // if (!this.canCancel()) { return false;}
    // const activeCons = this.getActiveConsequences(situation);
    // return activeCons.some(cons => cons.type == "trigger-event-cons"
    //   && cons.eventMod == "cancel");
  }

  getModifierAmount(targetMods: NonDeprecatedModifierTarget[] | NonDeprecatedModifierTarget) : (number | Sourced<ConsequenceAmountV2>)[] {
    return ConditionalEffectC.getModifierAmount(this.consequences, targetMods);
  }

  #determineConditionalType (ce: CondEffectObject, _conditions: SourcedConditionalEffect["conditions"], _consequences : SourcedConditionalEffect["consequences"], sourceItem: N<ConditonalEffectHolderItem> ) : this["_conditionalType"] {
    let condType : this["_conditionalType"] = "unknown";
    const forceDefensive = (sourceItem?.isDefensive)
      ? sourceItem.isDefensive()
      : false;
    switch (true) {
      case forceDefensive || ce.isDefensive:
        return "defensive";
      default:
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

  private _canAllowOpenersForPowers() : boolean {
    return this._consequences
      .some (cons =>
        cons.type == "trigger-event-cons"
        && cons.eventMod == "allow-as-opener");
  }

  private _generateSkillCardTeachEffect(card: SkillCard) {
    this._original = card;
    this._source = card.accessor;
    this._owner = card.parent?.accessor;
    this._isEmbedded = false;
    this._conditionalType = "on-use";
    this._realSource = undefined;
    if (!card.system.skillId) {
      this._preconditions = [];
      this._consequences = [];
      return;
    }
    this._preconditions = [ {
      type: 'always',
      source: card.accessor,
      owner: card.parent?.accessor,
      realSource: undefined,
    } as const ];
    this._consequences= [ {
      type: 'other-effect',
      otherEffect: "teach-power",
      randomPower: false,
      id: card.system.skillId,
      source: card.accessor,
      owner: card.parent?.accessor,
      realSource: undefined,
      applyTo: "user",
    } satisfies SourcedConditionalEffect["consequences"][number]
    ];
  }

    static getModifierAmount(consequences: ConditionalEffectC["consequences"], targetMods: NonDeprecatedModifierTarget[] | NonDeprecatedModifierTarget) : (number | Sourced<ConsequenceAmountV2>)[] {
    targetMods = Array.isArray(targetMods) ? targetMods : [targetMods];
    return consequences
      .reduce( (acc,cons)=> {
        if ("modifiedFields" in cons
          && targetMods
          .some( f => cons.modifiedFields[f] == true)
        ) {
          const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
          acc.push(sourced);
          return acc;
        }
        if ("modifiedField" in cons && cons.modifiedField && targetMods.includes(cons.modifiedField)) {
          const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
          acc.push(sourced);
          return acc;
        }
        return acc;
      }, [] as (number |Sourced<ConsequenceAmountV2>)[]);
  }

}

type CondEffectObject = ConditionalEffect;

type ConditonalEffectHolderItem = ModifierContainer & (PersonaItem | PersonaAE) & Partial<{isDefensive : () => boolean, defaultConditionalEffectType: () => TypedConditionalEffect["conditionalType"]}> ;
