import {PersonaActor} from "../actor/persona-actor.js";
import {ConditionalEffectC, EffectOwnershipData} from "./conditional-effect-class.js";

export abstract class ConditionalEffectComponent {
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

  errorCheck() : string[] {
    return [];
  }

  static getParentBySourced(sourced: Sourced<object>) : U<ConditionalEffectC> {
    const id = sourced._id;
    if (id == undefined)  {return undefined;}
    return this.parentsCreationId.get(id)?.deref();
  }

}


