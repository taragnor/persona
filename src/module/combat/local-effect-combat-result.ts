import {LocalEffect} from "../../config/consequence-types.js";
import {PersonaActor} from "../actor/persona-actor.js";

export class LocalEffectCombatResult {

  localActorChanges: LocalActorChange<PersonaActor>[]= [];
  globalLocalEffects : LocalEffect[] = [];

  constructor (localEffects: LocalEffect[], actorPairs: [PersonaActor, LocalEffect[]][]) {
    this.globalLocalEffects = localEffects;
    this.localActorChanges = actorPairs
      .map (([actor, LEs]) => new LocalActorChange(actor, LEs));
  }


}

class LocalActorChange<ActorType extends PersonaActor> {
  actor: ActorType;
  localEffects: LocalEffect[];

  constructor (actor: ActorType, effects: LocalEffect[]) {
    this.actor = actor;
    this.localEffects = effects;
  }

}
