import {PersonaSettings} from "../config/persona-settings.js";
import {PersonaCombat} from "./combat/persona-combat.js";
import {ConditionalEffectC} from "./conditionalEffects/conditional-effect-class.js";
import {Persona} from "./persona-class.js";
import {PersonaDB} from "./persona-db.js";

export class PersonaAura {
  static activeAuras(affectedTarget: Persona) : ConditionalEffectC[] {
    if (!PersonaSettings.aurasEnabled())
      {return [];}
    if (PersonaCombat.combat) {
      return this.getCombatAuras(PersonaCombat.combat);
    }
    if (affectedTarget.user.isPC() || affectedTarget.user.isNPCAlly()) {
      return PersonaDB.PCParty().flatMap( actor => actor.activeAuras());
    }
    return affectedTarget.myAuraEffects();
  }


  static getCombatAuras(combat: PersonaCombat) :ConditionalEffectC[] {
    return combat.combatants.contents.flatMap(
      comb => comb.actor ? comb.actor.activeAuras() : []);
  }

}

