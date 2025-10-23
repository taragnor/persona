import { removeDuplicates } from "./utility/array-tools.js";
import { Metaverse } from "./metaverse.js";
import { PersonaError } from "./persona-error.js";
import { PC } from "./actor/persona-actor.js";
import { NonCombatTriggerTypes } from "../config/triggers.js";
import { CombatTriggerTypes } from "../config/triggers.js";
import { Trigger } from "../config/triggers.js";
import { CombatResult } from "./combat/combat-result.js";
import { ValidAttackers } from "./combat/persona-combat.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import {getActiveConsequences} from "./preconditions.js";

export class TriggeredEffect {

	static async onTrigger<T extends Trigger>(trigger: T, actor ?: ValidAttackers, situation ?: Situation ) : Promise<CombatResult> {
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
					};
					situation = newSit;
					break;
				}
				case "enter-metaverse":
				case "on-metaverse-turn":
				case "exit-metaverse":
				case "on-attain-tarot-perk":
				case "on-search-end":
				case "on-active-scene-change": {
					const newSit : Situation = {
						trigger: trigger,
						triggeringUser: game.user,
					};
					situation = newSit;
					break;
				}
				case "on-combat-start-global": {
					const newSit : Situation = {
						trigger: trigger,
						triggeringUser: game.user,
					};
					situation = newSit;
					break;
				}
				case "pre-inflict-status":
				case "on-inflict-status":
				case "on-enter-region":
				case "on-presence-check":
				case "on-clock-tick":
				case "on-clock-change":
				case "on-use-power":
				case "on-roll":
				case "on-combat-end":
				case "on-open-door":
				case "pre-take-damage":
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
		let triggers : SourcedConditionalEffect[] = PersonaDB.getGlobalModifiers().flatMap( x=> x.getEffects(null));
		if (actor) {
			// triggers = actor.triggers;
			triggers = actor.triggersOn(trigger);
		}
		if (game.combat) {
			const roomEffects = (game.combat as PersonaCombat)?.getRoomEffects() ?? [];
			triggers.push(
				...roomEffects.flatMap (RE=> RE.getEffects(null))
			);
		} else {
			const arr = Metaverse.getRegion()?.allRoomEffects ?? [];
			triggers.push(
				...arr.flatMap (RE=> RE.getEffects(null))
			);
			const PCTriggers = PersonaDB.PCs().flatMap( x=> x.triggersOn(trigger));
			triggers.push(...PCTriggers);
		}
		triggers = removeDuplicates(triggers
			.filter ( x=> x.conditionalType == "triggered")
		);
		for (const eff of triggers) {
			try {
				const validCons = getActiveConsequences(eff, situationCopy);
				// if (!testPreconditions(eff.conditions, situationCopy, trig)) { continue; }
				// const res = await PersonaCombat.consequencesToResult(eff.consequences ,trig, situationCopy, actor, actor, null);
				const res = await PersonaCombat.consequencesToResult(validCons ,undefined, situationCopy, actor, actor, null);
				// const res = await PersonaCombat.consequencesToResult(eff.consequences ,trig, situationCopy, actor, actor, null);
				result.merge(res);
			} catch (e) {
				PersonaError.softFail(`Problem with triggered effects ${eff.source?.name ?? "Unknown source"} running on actor ${actor?.name ?? "none"}`, e);
				continue;
			}
		}
	return result;
}

	static async autoApplyTrigger(...args : Parameters<typeof TriggeredEffect["onTrigger"]>) : Promise<void> {
		const CR = await this.autoTriggerToCR(...args);
		await CR?.autoApplyResult();
	}

	static async autoTriggerToCR(...args : Parameters<typeof TriggeredEffect["onTrigger"]>) : Promise<U<CombatResult>> {
		const CR = await this.onTrigger(...args);
		return CR.emptyCheck();
	}

	static async execNonCombatTrigger( trigger: NonCombatTriggerTypes, actor: PC, situation ?: Situation, msg = "Triggered Effect") : Promise<void> {
		await (await this.onTrigger(trigger, actor, situation))
		.emptyCheck()
		?.toMessage(msg, actor);
	}

	static async execCombatTrigger(trigger: CombatTriggerTypes, actor: ValidAttackers, situation?: Situation) : Promise<void> {
		const triggerResult = (await this.onTrigger(trigger, actor, situation))
		.emptyCheck();
		if (!triggerResult) {return;}
		const usePowers = triggerResult.findEffects("use-power");
		if (situation == undefined) {
			situation = {
				attacker: actor.accessor,
				user: actor.accessor,
			} satisfies Situation;
		}
		for (const usePower of usePowers) {
			//TODO BUG: Extra attacks keep the main inputted modifier
			try {
				const newAttacker = PersonaCombat.getPTokenFromActorAccessor(usePower.newAttacker);
				const execPower = PersonaDB.allPowers().get( usePower.powerId);
				if (execPower && newAttacker) {
					const altTargets= PersonaCombat.getAltTargets(newAttacker, situation, usePower.target );
					const newTargets = PersonaCombat.getTargets(newAttacker, execPower, altTargets);
					const extraPower = await PersonaCombat.usePowerOn(newAttacker, execPower, newTargets, "standard");
					triggerResult.merge(extraPower);
				}
			} catch (e) {
				PersonaError.softFail(`Error on Use Power in execCombat Trigger for Power ${usePower?.powerId}`, e);
				continue;
			}
		}
		await triggerResult?.finalize().toMessage("Triggered Effect", actor);
	}
}
