import { PC } from "./actor/persona-actor.js";
import { NonCombatTrigger } from "../config/triggers.js";
import { CombatTrigger } from "../config/triggers.js";
import { Trigger } from "../config/triggers.js";
import { CombatResult } from "./combat/combat-result.js";
import { Situation } from "./preconditions.js";
import { ValidAttackers } from "./combat/persona-combat.js";
import { ModifierContainer } from "./item/persona-item.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaCombat } from "./combat/persona-combat.js";

export class TriggeredEffect {

	static onTrigger(trigger: Trigger, actor ?: ValidAttackers, situation ?: Situation) : CombatResult {
		const result = new CombatResult();
		if (!situation) {
			const newSit: Situation = {
				trigger,
			};
			if (actor) {
				newSit.user = actor.accessor;
				newSit.target = actor.accessor;
				newSit.triggeringCharacter = actor.accessor;
			}
			situation = newSit;
		}
		situation = {
			...situation,
			trigger
		} ; //copy the object so it doesn't permanently change it
		let triggers : ModifierContainer[];
		if (actor) {
			triggers = actor.triggers;
		} else {
			const roomEffects= (game?.combat as PersonaCombat)?.getRoomEffects() ?? [];
			triggers = [
				...PersonaDB.getGlobalModifiers(), //testin only
				...roomEffects,
			];
		}
		for (const trig of triggers) {
			for (const eff of trig.getEffects(actor ?? null)) {
				if (!ModifierList.testPreconditions(eff.conditions, situation, trig)) { continue; }
				const cons = PersonaCombat.ProcessConsequences(trig, situation, eff.consequences, actor)
				result.escalationMod+= cons.escalationMod;
				for (const c of cons.consequences) {
					result.addEffect(null, actor, c.cons);
				}
			}
		}
		return result;
	}

	static async execNonCombatTrigger( trigger: NonCombatTrigger, actor: PC, situation ?: Situation, msg = "Triggered Effect") : Promise<void> {
		await this.onTrigger(trigger, actor, situation)
			.emptyCheck()
			?.toMessage(msg, actor);
	}

	static async execCombatTrigger(trigger: CombatTrigger, actor: ValidAttackers, situation?: Situation) : Promise<void> {
		const triggerResult = this.onTrigger(trigger, actor, situation)
		.emptyCheck();
		if (!triggerResult) return;
		const usePowers = triggerResult.findEffects("use-power");
		situation = situation ? situation : {
			attacker: actor.accessor,
			user: actor.accessor,
		};
		for (const usePower of usePowers) {
			//TODO BUG: Extra attacks keep the main inputted modifier
			const newAttacker = PersonaCombat.getPTokenFromActorAccessor(usePower.newAttacker);
			const execPower = PersonaDB.allPowers().find( x=> x.id == usePower.powerId);
			if (execPower && newAttacker) {
				const altTargets= PersonaCombat.getAltTargets(newAttacker, situation, usePower.target );
				const newTargets = await PersonaCombat.getTargets(newAttacker, execPower, altTargets)
				const extraPower = await PersonaCombat.usePowerOn(newAttacker, execPower, newTargets, "standard");
				triggerResult.merge(extraPower);

			}
		}
		await triggerResult?.toMessage("Triggered Effect", actor);
	}
}
