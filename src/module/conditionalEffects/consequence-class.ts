import { Consequence, ConsequenceAmountV2, NonDeprecatedConsequence } from "../../config/consequence-types.js";
import {CreatureTag} from "../../config/creature-tags.js";
import {NonDeprecatedModifierTarget} from "../../config/item-modifiers.js";
import {StatusEffectId} from "../../config/status-effects.js";
import {PersonaItem} from "../item/persona-item.js";
import {ConsequenceConverter} from "../migration/convertConsequence.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {ConditionalEffectComponent} from "./conditional-component.js";
import {ConditionalEffectC} from "./conditional-effect-class.js";
import {ConditionalEffectManager} from "./conditional-effect-manager.js";
import {ConsequenceAmountResolver} from "./consequence-amount.js";
import {multiCheckToArray} from "./preconditions.js";


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

  getModifierAmount(targetMods: NonDeprecatedModifierTarget[]) : N<number | Sourced<ConsequenceAmountV2>> {
    const cons = this.toSourced();
    if ("modifiedFields" in cons
      && targetMods.some( f => cons.modifiedFields[f] == true)
    ) {
      const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
      return sourced;
    }
    if ("modifiedField" in cons && cons.modifiedField && targetMods.includes(cons.modifiedField)) {
      const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
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
    };
    sourceCache.set(this, sourced);
    return sourced;
  }

  canElevateToOpener(roll?: number) : boolean{
    const cons = this.cons as NonDeprecatedConsequence;
    if (cons.type != "trigger-event-cons" || cons.eventMod != "allow-as-opener") {return false;}
    if (roll == undefined) {return true;}
    return roll >= cons.low && roll <= cons.high;
  }

  get grantedPower(): U<Power> {
    const cons = this.cons as NonDeprecatedConsequence;
      if (cons.type != "other-effect" || cons.otherEffect != 'add-power-to-list') {return undefined;}
    const powerId = cons.id;
    return PersonaDB.allPowers().get(powerId);
  }


  get grantedTalent(): U<Talent> {
    const cons = this.cons as NonDeprecatedConsequence;
    if (cons.type != "other-effect" ||
      cons.otherEffect != 'add-talent-to-list') {return undefined;}
    return PersonaDB.allTalents().find(x=> x.id == cons.id);
  }

  get addedCreatureTags() : U<CreatureTag> {
    const cons = this.cons as NonDeprecatedConsequence;
    if (cons.type != "other-effect" || cons.otherEffect != 'add-creature-tag') {return undefined;}
    const tag = PersonaItem.resolveTag(cons.creatureTag);
    return tag;
  }

  canDealDamage(): boolean {
    const cons = this.cons as NonDeprecatedConsequence;
    return cons.type == "combat-effect" &&
      cons.combatEffect == "damage";
  }

  statusesAdded() : U<{status: StatusEffectId, potency: number}> {
    const cons = this.cons as NonDeprecatedConsequence;
    if (cons.type != "combat-effect" || cons.combatEffect != 'addStatus') {return undefined;}
    return {
      status: cons.statusName, potency: cons.potency ?? 1
    } ;
  }

  statusesRemoved() : StatusEffectId[] {
    const cons = this.cons as NonDeprecatedConsequence;
    if (cons.type != "combat-effect" || cons.combatEffect != 'removeStatus') {return [];}
    return multiCheckToArray(cons.statusName);
  }

}

const sourceCache = new WeakMap<ConditionalEffectComponent, Sourced<object>> ();
