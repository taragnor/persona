import { Metaverse } from "./metaverse.js";
import { UniversalModifier } from "./item/persona-item.js";
import { PersonaError } from "./persona-error.js";
import { PC } from "./actor/persona-actor.js";
import { NonCombatTriggerTypes } from "../config/triggers.js";
import { CombatTriggerTypes } from "../config/triggers.js";
import { Trigger } from "../config/triggers.js";
import { CombatResult } from "./combat/combat-result.js";
import { ValidAttackers } from "./combat/persona-combat.js";
import { ModifierContainer } from "./item/persona-item.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaCombat } from "./combat/persona-combat.js";

export class TriggeredEffect {

	static onTrigger<T extends Trigger>(trigger: T, actor ?: ValidAttackers, situation ?: Situation ) : CombatResult {
		const result = new CombatResult();
		if (!situation) {
			switch (trigger) {
				case "on-damage":
				case "on-combat-start":
				case "start-turn":
				case "end-turn": {
					if (!actor) {
						PersonaError.softFail("NO Actor givent o trigger ${trigger}");
						return result;
					}
					const newSit = {
						trigger: trigger,
						triggeringUser: game.user,
						user : actor.accessor,
						target : actor.accessor,
						triggeringCharacter : actor.accessor,
					} satisfies Situation;
					situation = newSit;
					break;
				}
				case "on-kill-target": {
					//required its own thing for some reason since was giving TS errors
					if (!actor) {
						PersonaError.softFail("NO Actor givent o trigger ${trigger}");
						return result;
					}
					const newSit = {
						trigger: trigger,
						triggeringUser: game.user,
						user : actor.accessor,
						target : actor.accessor,
						triggeringCharacter : actor.accessor,
					} satisfies Situation;
					situation = newSit;
					break;
				}
				case "on-combat-end-global": {
					const newSit : Situation = {
						trigger: trigger,
						triggeringUser: game.user,
					}
					situation = newSit;
					break;
				}
				case "enter-metaverse":
				case "on-metaverse-turn":
				case "exit-metaverse":
				case "on-attain-tarot-perk":
				case "on-search-end":
					const newSit : Situation = {
						trigger: trigger,
						triggeringUser: game.user,
					};
					situation = newSit;
					break;
				case "on-inflict-status":
				case "on-enter-region":
				case "on-presence-check":
				case "on-clock-tick":
				case "on-clock-change":
				case "on-use-power":
				case "on-roll":
				case "on-combat-end": 
				case "on-open-door":
					PersonaError.softFail(`Must proivide a situation with this trigger:  ${trigger}`);
					return result;
				default:
					trigger satisfies never;
					PersonaError.softFail(`Bad TRigger ${trigger}`);
					return result;
			}
		}
		if (situation == undefined) {
			PersonaError.softFail(`Cant' resolve trigger, no situation for ${trigger}`);
			return result;
		}
		const situationCopy = { ...situation, trigger } as Situation; //copy the object so it doesn't permanently change it
		let triggers : ModifierContainer[];
		if (actor) {
			triggers = actor.triggers;
		} else {
			const roomEffects : UniversalModifier[] = [];
			if (game.combat) {
				roomEffects.push(...(game.combat as PersonaCombat)?.getRoomEffects());
			} else {
				const arr = Metaverse.getRegion()?.allRoomEffects ?? [];
				roomEffects.push(...arr)
			}
			triggers = [
				...PersonaDB.getGlobalModifiers(), //testin only
				...roomEffects,
			];
		}
		for (const trig of triggers) {
			for (const eff of trig.getEffects(actor ?? null)) {
				if (!ModifierList.testPreconditions(eff.conditions, situationCopy, trig)) { continue; }
				const res = PersonaCombat.consequencesToResult(eff.consequences ,trig, situationCopy, actor, actor, null);
				result.merge(res);
			}
		}
		return result;
	}

	static async execNonCombatTrigger( trigger: NonCombatTriggerTypes, actor: PC, situation ?: Situation, msg = "Triggered Effect") : Promise<void> {
		await this.onTrigger(trigger, actor, situation)
			.emptyCheck()
			?.toMessage(msg, actor);
	}

	static async execCombatTrigger(trigger: CombatTriggerTypes, actor: ValidAttackers, situation?: Situation) : Promise<void> {
		const triggerResult = this.onTrigger(trigger, actor, situation)
		.emptyCheck();
		if (!triggerResult) return;
		const usePowers = triggerResult.findEffects("use-power");
		if (situation == undefined) {
			situation = {
				attacker: actor.accessor,
				user: actor.accessor,
			} satisfies Situation;
		}
		for (const usePower of usePowers) {
			//TODO BUG: Extra attacks keep the main inputted modifier
			const newAttacker = PersonaCombat.getPTokenFromActorAccessor(usePower.newAttacker);
			const execPower = PersonaDB.allPowers().find( x=> x.id == usePower.powerId);
			if (execPower && newAttacker) {
				const altTargets= PersonaCombat.getAltTargets(newAttacker, situation, usePower.target );
				const newTargets = PersonaCombat.getTargets(newAttacker, execPower, altTargets)
				const extraPower = await PersonaCombat.usePowerOn(newAttacker, execPower, newTargets, "standard");
				triggerResult.merge(extraPower);

			}
		}
		await triggerResult?.finalize().toMessage("Triggered Effect", actor);
	}
}
