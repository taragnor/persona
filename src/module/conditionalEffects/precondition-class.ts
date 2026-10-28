import {NonDeprecatedPrecondition} from "../../config/precondition-types.js";
import {PreconditionConverter} from "../migration/convertPrecondition.js";
import {ConditionalEffectComponent} from "./conditional-component.js";
import {ConditionalEffectC} from "./conditional-effect-class.js";
import {ConditionalEffectManager} from "./conditional-effect-manager.js";
import { Trigger } from "../../config/triggers.js";

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

  override errorCheck() : string[]{
    return [
      ...super.errorCheck(),
      ...this._checkTriggered(),
    ];
  }

  private _checkTriggered() : string[] {
    const cond = this.cond as NonDeprecatedPrecondition;
    if (
      cond.type == "boolean"
      && cond.boolComparisonTarget == "actor-property"
      && cond.actorProperty == "target-owner-comparison"
      && cond.booleanState == true
    ) {
      const arr = [cond.conditionTarget, cond.conditionTarget2];
      if (arr.includes("owner")
        && arr.includes("target")
        && this.parent?.conditionalType == "triggered") {
        return ["may require change to defensive trigger"];
      }
    }
    if (this.isTriggeredCondition("check-social-powers")) {
      const checks = this._limitedLoopChecks(cond);
      if (checks.length > 0) {return checks;}
    }
    return [];
  }

  private _limitedLoopChecks(cond: NonDeprecatedPrecondition) : string[] {
    if (cond.type == "boolean") {
      if (cond.boolComparisonTarget == "has-tag") {
        return ["Can't check tags in limited context"];
      }
    }
    return [];
  }

  isTriggeredCondition(triggerType ?: Trigger) : boolean{
    return PreconditionC.isTriggeredCondition(this.cond as  NonDeprecatedPrecondition, triggerType);
  }

  static isTriggeredCondition(cond: ConditionalEffect["conditions"][number], triggerType ?: Trigger): boolean {
    if (cond.type != "on-trigger" ) {return false;}
    if (!triggerType) {return true;}
    return triggerType == cond.trigger;
  }



}

const sourceCache = new WeakMap<ConditionalEffectComponent, Sourced<object>> ();

