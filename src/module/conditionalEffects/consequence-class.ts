import { Consequence, NonDeprecatedConsequence } from "../../config/consequence-types.js";
import {NonDeprecatedPrecondition} from "../../config/precondition-types.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaItem} from "../item/persona-item.js";
import {ConsequenceConverter} from "../migration/convertConsequence.js";
import {PreconditionConverter} from "../migration/convertPrecondition.js";
import {ConditionalEffectC} from "./conditional-effect-class.js";
import {ConditionalEffectManager} from "./conditional-effect-manager.js";

abstract class ConditionalEffectComponent {
  private static lastCreationId = 1;
  private static parentsCreationId = new Map<number, WeakRef<ConditionalEffectC>>();
  #creationId: number;

  constructor (parent: ConditionalEffectC) {
    this.#creationId = ConditionalEffectComponent.generateCreationId();
    ConditionalEffectComponent.parentsCreationId.set(this.#creationId, new WeakRef(parent));
  }

  static generateCreationId(): number {
    return this.lastCreationId++;
  }

  get parent(): U<ConditionalEffectC> {
    return ConditionalEffectComponent.parentsCreationId.get(this.#creationId)?.deref();
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

}

export class ConsequenceC extends ConditionalEffectComponent {
  private _cons: Readonly<NonDeprecatedConsequence>;

  constructor (cons: NonDeprecatedConsequence, parent: ConditionalEffectC) {
    super(parent);
    this._cons = cons;
  }

  static cleanCons(cons :Consequence, sourceItem: N<PersonaItem>) : NonDeprecatedConsequence {
    return ConsequenceConverter.convertDeprecated(cons, sourceItem instanceof Item ? sourceItem : null);
  }

  get cons(): NonDeprecatedConsequence {
    return this._cons;
  }

  static fromArrayLike(arr: ConditionalEffect["consequences"], parent: ConditionalEffectC) : ConsequenceC[] {
    const cons = ConditionalEffectManager.ArrayCorrector(arr);
    const realSource = parent.findRealSource();
    return cons.map( cons=> new ConsequenceC(ConsequenceC.cleanCons(cons, realSource instanceof PersonaItem ? realSource : null), parent));
  }

}

export class PreconditionC extends ConditionalEffectComponent {
  private _cond: Readonly<NonDeprecatedPrecondition>;

  constructor (cond: NonDeprecatedPrecondition, parent: ConditionalEffectC) {
    super(parent);
    this._cond = cond;
  }

  get cond(): Readonly<NonDeprecatedPrecondition> {
    return this._cond;
  }

  static cleanCond(cond : Precondition) : NonDeprecatedPrecondition {
    return PreconditionConverter.convertDeprecated(cond);
  }

  fromArrayLike(arr: ConditionalEffect["conditions"], parent: ConditionalEffectC) : PreconditionC[] {
    const cond = ConditionalEffectManager.ArrayCorrector(arr);
    return cond
      .map( cond=> new PreconditionC(
        PreconditionC.cleanCond(cond), parent)
      );
  }

}
