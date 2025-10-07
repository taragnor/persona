import { PersonaDB } from "../persona-db.js";
import { Power } from "../item/persona-item.js";
import { AttackResult } from "./combat-result.js";
import { PToken } from "./persona-combat.js";
import { Shadow } from "../actor/persona-actor.js";
import { PersonaCombat } from "./persona-combat.js";
import {Persona} from "../persona-class.js";

export abstract class PersonaAI {
   persona: Persona;
   token: PToken;
   combatant: Combatant<Shadow>;
   combat: PersonaCombat;

   constuctor(combatant: Combatant<Shadow>, combat: PersonaCombat) {
      if (!combatant.actor) {
         throw new Error("Persona AI requires a combatnat with a token");
      }
      this.combatant = combatant;
      this.persona = combatant.actor.persona();
      this.token = combatant.token as PToken;
      this.combat= combat;
   }

   abstract recordCombatResult(atkResult : AttackResult) : void;
   abstract getAction() : AIAction | null;
}

export class NullAI extends PersonaAI {
   override recordCombatResult(_atkResult: AttackResult): void {
   }

   override getAction(): AIAction  | null{
      return null;
   }

}

export class RandomAI extends PersonaAI {
   override recordCombatResult(atkResult: AttackResult): void {
   }

   override getAction(): AIAction | null {
      const {persona, token} = this;
      const tokenAcc = PersonaDB.getUniversalTokenAccessor(token);
      const powers = this.persona.powers;
      const usablePowers = powers.filter( pwr => persona.canUsePower(pwr));
      const chargeAblePowers = powers.filter (pwr => pwr.energyRequired(persona) > persona.user.energy);
      // const freePowers = usablePowers.filter( pwr=> pwr.energyCost(persona) == 0);
      const engaged = this.combat.isEngagedByAnyFoe(tokenAcc);
      if (!chargeAblePowers)  {

      }
      return null;
   }

}

export type AIAction = {
   power: Power,
   targets: PToken[],



}
