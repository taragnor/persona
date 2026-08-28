import {NonDeprecatedPrecondition} from "../../config/precondition-types.js";
import {PreconditionConverter} from "../migration/convertPrecondition.js";
import {ConditionalEffectComponent} from "./conditional-component.js";
import {ConditionalEffectC} from "./conditional-effect-class.js";
import {ConditionalEffectManager} from "./conditional-effect-manager.js";

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

