import { PersonaDB } from "../persona-db.js";
import { Power } from "../item/persona-item.js";
import { AttackResult } from "./combat-result.js";
import { PToken } from "./persona-combat.js";
import { Shadow } from "../actor/persona-actor.js";
import { PersonaCombat } from "./persona-combat.js";

export abstract class PersonaAI {
   actor: Shadow;
   token: PToken;
   combatant: Combatant<Shadow>;
   combat: PersonaCombat;

   constuctor(combatant: Combatant<Shadow>, combat: PersonaCombat) {
      if (!combatant.actor) {
         throw new Error("Persona AI requires a combatnat with a token");
      }
      this.combatant = combatant;
      this.actor = combatant.actor;
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
      const shadow= this.actor;
      const powers = this.actor.powers;
      const usablePowers = powers.filter( pwr => shadow.canUsePower(pwr));
      const chargeAblePowers = powers.filter (pwr => !shadow.canUsePower(pwr) && pwr.system.energy.required > shadow.system.combat.energy.value);
      const freePowers = usablePowers.filter( pwr=> pwr.system.energy.cost == 0)
      const tokenAcc = PersonaDB.getUniversalTokenAccessor(this.token);
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
