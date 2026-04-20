import {LocalEffect} from "../../config/consequence-types.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {ConsequenceApplier} from "./consequence-applier.js";

export class LocalEffectCombatResult {

  localActorChanges: LocalActorChange<PersonaActor>[]= [];
  globalLocalEffects : Sourced<LocalEffect>[] = [];

  constructor (localEffects: Sourced<LocalEffect>[], actorPairs: [PersonaActor["accessor"], Sourced<LocalEffect>[]][]) {
    this.globalLocalEffects = localEffects;
    this.localActorChanges = actorPairs
      .map (([actorAcc, LEs]) => new LocalActorChange(actorAcc, LEs));
  }

  async execute() : Promise<void> {
    for (const effect of this.globalLocalEffects) {
      await ConsequenceApplier.applyLocalEffect(effect, null);
    }
    for (const change of this.localActorChanges) {
      for (const effect of change.localEffects) {
      await ConsequenceApplier.applyLocalEffect(effect, change.actor);
      }
    }
  }
}

class LocalActorChange<ActorType extends PersonaActor> {
  actor: ActorType;
  localEffects: Sourced<LocalEffect>[];

  constructor (actor: ActorType | UniversalActorAccessor<ActorType>, effects: Sourced<LocalEffect>[]) {
    if (!(actor instanceof PersonaActor)) {
      actor = PersonaDB.findActor(actor);
    }
    this.actor = actor;
    this.localEffects = effects;
  }

}

