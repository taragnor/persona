import { Consequence, ConsequenceAmountV2, NonDeprecatedConsequence } from "../../config/consequence-types.js";
import {NonDeprecatedModifierTarget} from "../../config/item-modifiers.js";
import {PersonaItem} from "../item/persona-item.js";
import {ConsequenceConverter} from "../migration/convertConsequence.js";
import {PersonaError} from "../persona-error.js";
import {ConditionalEffectComponent} from "./conditional-component.js";
import {ConditionalEffectC} from "./conditional-effect-class.js";
import {ConditionalEffectManager} from "./conditional-effect-manager.js";
import {ConsequenceAmountResolver} from "./consequence-amount.js";


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

const sourceCache = new WeakMap<ConditionalEffectComponent, Sourced<object>> ();
