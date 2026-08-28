import { Consequence, ConsequenceAmountV2, NonDeprecatedConsequence } from "../../config/consequence-types.js";
import {NonDeprecatedModifierTarget} from "../../config/item-modifiers.js";
import {NonDeprecatedPrecondition} from "../../config/precondition-types.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaItem} from "../item/persona-item.js";
import {ConsequenceConverter} from "../migration/convertConsequence.js";
import {PreconditionConverter} from "../migration/convertPrecondition.js";
import {PersonaError} from "../persona-error.js";
import {ConditionalEffectC, EffectOwnershipData} from "./conditional-effect-class.js";
import {ConditionalEffectManager} from "./conditional-effect-manager.js";
import {ConsequenceAmountResolver} from "./consequence-amount.js";

abstract class ConditionalEffectComponent {
  private static lastCreationId = 1;
  private static parentsCreationId = new Map<number, WeakRef<ConditionalEffectC>>();
  protected _creationId: number;
  protected _parentId: number;

  constructor (parent: ConditionalEffectC) {
    this._creationId = ConditionalEffectComponent.generateCreationId();
    this._parentId = parent.ownershipInfo.creationId;
    ConditionalEffectComponent.parentsCreationId.set(this._parentId, new WeakRef(parent));
  }

  static generateCreationId(): number {
    return this.lastCreationId++;
  }

  get parent(): U<ConditionalEffectC> {
    return ConditionalEffectComponent.parentsCreationId.get(this._parentId)?.deref();
  }


  get owner():  U<UniversalActorAccessor<PersonaActor>> {
    return this.parent?.owner;
  }
  get realSource() {
    return this.parent?.realSource;
  }

  get source() {
    return this.parent?.source;
  }

  findSource() { return this.parent?.findSource();}
  findRealSource() { return this.parent?.findRealSource();}
  findOwner() { return this.parent?.findOwner();}

  get ownershipInfo(): EffectOwnershipData {
    return this.parent?.ownershipInfo ?? {
      owner: undefined,
      source: undefined,
      realSource: undefined,
      creationId: this._creationId,
      _id: this._creationId,
    };
  }

  static getParentBySourced(sourced: Sourced<object>) : U<ConditionalEffectC> {
    const id = sourced._id;
    if (id == undefined)  {return undefined;}
    return this.parentsCreationId.get(id)?.deref();
  }

}

export class ConsequenceC<C extends NonDeprecatedConsequence = NonDeprecatedConsequence> extends ConditionalEffectComponent {
  private _cons: Readonly<C>;

  constructor (cons: C, parent: ConditionalEffectC) {
    super(parent);
    this._cons = cons;
  }

  static cleanCons(cons :Consequence, sourceItem: N<PersonaItem>) : NonDeprecatedConsequence {
    return ConsequenceConverter.convertDeprecated(cons, sourceItem instanceof Item ? sourceItem : null);
  }

  get cons(): Readonly<C> {
    return this._cons;
  }

  static fromArrayLike(arr: ConditionalEffect["consequences"], parent: ConditionalEffectC) : ConsequenceC[] {
    const cons = ConditionalEffectManager.ArrayCorrector(arr);
    const realSource = parent.findRealSource();
    return cons.map( cons=> new ConsequenceC(ConsequenceC.cleanCons(cons, realSource instanceof PersonaItem ? realSource : null), parent));
  }

  canAllowOpenersForPowers() : boolean {
    const cons = this.cons as NonDeprecatedConsequence;
    return  cons.type == "trigger-event-cons"
      && cons.eventMod == "allow-as-opener";
  }

  static getModifierAmount(cons: Sourced<NonDeprecatedConsequence>, targetMods: NonDeprecatedModifierTarget[]) : N<number | Sourced<ConsequenceAmountV2>> {
    if ("modifiedFields" in cons
      && targetMods.some( f => cons.modifiedFields[f] == true)
    ) {
      const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
      // acc.push(sourced);
      return sourced;
    }
    if ("modifiedField" in cons && cons.modifiedField && targetMods.includes(cons.modifiedField)) {
      const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
      // acc.push(sourced);
      return sourced;
    }
    return null;
  }

  toSourced(): Sourced<C> {
    const obj = sourceCache.get(this);
    if (obj) {return obj as Sourced<C>;}
    const parent = this.parent;
    if (!parent) {
      PersonaError.softFail("Can't find parent for CE");
      Debug(this);
      return {
        ...this.cons,
        ...ConditionalEffectC.NULL_OWNERSHIP,
      };
    }
    const sourced =  {
      ...this.cons,
      ...parent.ownershipInfo
      // source: parent?.source,
      // realSource: parent?.realSource,
      // owner: parent?.owner,
    };
    sourceCache.set(this, sourced);
    return sourced;
  }

}

export class PreconditionC<C extends NonDeprecatedPrecondition = NonDeprecatedPrecondition> extends ConditionalEffectComponent {
  private _cond: Readonly<C>;

  constructor (cond: C, parent: ConditionalEffectC) {
    super(parent);
    this._cond = cond;
  }

  get cond(): Readonly<C> {
    return this._cond;
  }


  static cleanCond(cond : Precondition) : NonDeprecatedPrecondition {
    return PreconditionConverter.convertDeprecated(cond);
  }

  static fromArrayLike(arr: ConditionalEffect["conditions"], parent: ConditionalEffectC) : PreconditionC[] {
    const cond = ConditionalEffectManager.ArrayCorrector(arr);
    return cond
      .map( cond=> new PreconditionC(
        PreconditionC.cleanCond(cond), parent)
      );
  }

  toSourced(): Sourced<C> {
    const obj = sourceCache.get(this);
    if (obj) {return obj as Sourced<C>;}
    const sourced =  {
      ...this.cond,
      ...this.ownershipInfo,
    } satisfies Sourced<C>;
    sourceCache.set(this, sourced);
    return sourced;
  }

}

const sourceCache = new WeakMap<ConditionalEffectComponent, Sourced<object>> ();
