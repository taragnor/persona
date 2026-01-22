import {OtherEffect} from "../../config/consequence-types.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {TreasureSystem} from "../exploration/treasure-system.js";
import {Metaverse} from "../metaverse.js";
import {NavigatorVoiceLines} from "../navigator/nav-voice-lines.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSounds} from "../persona-sounds.js";
import {PersonaVariables} from "../persona-variables.js";
import {TriggeredEffect} from "../triggered-effect.js";
import {EvaluatedDamage} from "./damage-calc.js";
import {FinalizedCombatResult, ResolvedActorChange} from "./finalized-combat-result.js";
import {PersonaCombat, PToken} from "./persona-combat.js";
import {PersonaSFX} from "./persona-sfx.js";

export class ConsequenceApplier {

	static async applyActorChange (change: ResolvedActorChange<ValidAttackers>, power: U<UsableAndCard>, attacker ?: UniversalTokenAccessor<PToken>) : Promise<FinalizedCombatResult[]> {
		if (!game.user.isGM) {
			throw new PersonaError(`Non-GM ${game.user.name} trying to access the consequence applier`);
		}
		const chained : FinalizedCombatResult[] = [];
		const actor = PersonaDB.findActor(change.actor);
		const token  = change.actor.token ? PersonaDB.findToken(change.actor.token) as PToken: undefined;
		for (const status of change.addStatus) {
			const statusAdd = await actor.addStatus(status);
			if (statusAdd && attacker) {
				const attackerActor = PersonaDB.findToken(attacker)?.actor;
				if (attackerActor) {
					const sitPartial ={
						target: actor.accessor,
						triggeringCharacter: attackerActor.accessor,
						attacker: attackerActor.accessor,
						trigger : "on-inflict-status",
						usedPower: power?.accessor,
						statusEffect: status.id,
						triggeringUser: game.user,
					} as const;
					for (const user of [actor, attackerActor]) {
						const situation : Situation =  {
							...sitPartial,
							user: user.accessor,
						};
						const eff = (await TriggeredEffect.onTrigger("on-inflict-status", user, situation))
							.finalize()
							.emptyCheck() ;
						if (eff) {
							chained.push(eff);
						}
					}
				}
			}
			if (statusAdd && token) {
				Hooks.callAll("onAddStatus", token, status);
			}
		}
		for (const dmg of change.damage)  {
			try {
				chained.push(...await this._applyDamage(actor, token, dmg, power, attacker));
			} catch (e) {
				PersonaError.softFail(`Error applying Damage to ${actor.name}`, e);
			}
		}
		for (const status of change.removeStatus) {
			await actor.removeStatus(status);
		}
		const mpmult = 1;
		const mutableState =  {
			mpCost: 0,
			theurgy: 0,
		} satisfies MutableActorState;
		for (const otherEffect of change.otherEffects) {
			try {
				await this._applyOtherEffect(actor, token, otherEffect, mutableState);
			} catch (e) {
				PersonaError.softFail(`Error trying to execute ${otherEffect.type} on ${actor.name}`, e);
			}
		}
		if (mutableState.theurgy != 0 && !actor.isShadow()) {
			console.log(`Modify Theurgy: ${mutableState.theurgy}`);
			await actor.modifyTheurgy(mutableState.theurgy);
		}
		if (mutableState.mpCost != 0 && !actor.isShadow()) {
			mutableState.mpCost *= mpmult;
			await (actor as PC).modifyMP(mutableState.mpCost);
		}
		return chained;
	}

	private static async _applyDamage(actor: ValidAttackers, token: PToken | undefined, dmg: EvaluatedDamage, power: U<UsableAndCard>, attackerTokenAcc ?: UniversalTokenAccessor<PToken>) : Promise<FinalizedCombatResult[]> {
		const ret : FinalizedCombatResult[] = [];
		if (Number.isNaN(dmg.hpChange)) {
			PersonaError.softFail("NaN damage!");
			return [];
		}
		const attackerToken = PersonaDB.findToken(attackerTokenAcc);
		if (dmg.hpChange == 0) {return [];}
		if (dmg.hpChange < 0) {
			const attacker = attackerToken ? attackerToken.actor.accessor : undefined;
			const actorAcc = actor.accessor;
			const situation : Situation =  {
				user: actorAcc,
				usedPower: power?.accessor,
				triggeringCharacter: actorAcc,
				target: actorAcc,
				attacker,
				amt: -dmg.hpChange,
				damageType: dmg.damageType,
				triggeringUser: game.user,
			};
			const preCR = (await TriggeredEffect.onTrigger("pre-take-damage", actor, situation)).finalize();
			if (preCR.hasCancelRequest()) {
				ret.push(preCR);
				return ret;
			}
			const CR = (await TriggeredEffect
				.autoTriggerToCR("on-damage", actor, situation))
				?.finalize();
			if (CR) { ret.push(CR);}
		}
		if (power) {
			PersonaSFX.onDamage(token, dmg.hpChange, dmg.damageType, power);
		}
		if (token) {
			if (power && !power.isAoE()) {
				await PersonaSFX.onSingleTargetDamage(token, dmg.hpChange, dmg.damageType, power);
			}
			Hooks.callAll("onTakeDamage", token, dmg.hpChange, dmg.damageType);
		}
		await actor.modifyHP(dmg.hpChange);
		if (actor.hp <= 0 && token) {
			await this.#onDefeatOpponent(token, attackerToken);
		}
		return ret;
	}

	private static async _applyOtherEffect(actor: ValidAttackers, token: PToken | undefined, otherEffect: OtherEffect, mutableState: MutableActorState): Promise<void> {
		switch (otherEffect.type) {
			case "expend-item":
				if (otherEffect.itemAcc) {
					const item = PersonaDB.findItem(otherEffect.itemAcc);
					if (!item) {
						PersonaError.softFail(`Couldn't find personal Item to expend ${JSON.stringify(otherEffect.itemAcc)}`);
						return;
					}
					if ( item.parent) {
						await item.parent.expendConsumable(item);
					}
					return;
				}
				break;
			case "save-slot":
				break;
			case "half-hp-cost":
				break;
			case "extraTurn":
				break;
			case "set-flag":
				await actor.setEffectFlag(otherEffect);
				break;
			case "teach-power": {
				if (!actor.isPC() && !actor.isNPCAlly()) {
					break;
				}
				const persona = actor.persona();
				if (otherEffect.randomPower == false) {
					const power = PersonaDB.allPowers().get(otherEffect.id);
					if (power) {
						await persona.learnPower(power);
					}
				} else {
					const highest = persona.highestPowerSlotUsable();
					let safetyBreak = 0;
					while (true) {
						const power = TreasureSystem.randomPower(highest);
						if (!power) {break;}
						if (!persona.knowsPowerInnately(power)) {
							await persona.learnPower(power);
							break;
						}
						if (++safetyBreak > 100) {
							PersonaError.softFail("Error trying to add random Power, couldn't find candidate");
							break;
						}
					}
				}
				break;
			}
			case "lower-resistance":
			case "raise-resistance":
			case "add-power-to-list":
			case "display-message":
				break;
			case "inspiration-cost":
				if (actor.system.type == "pc") {
					await (actor as PC).spendInspiration(otherEffect.linkId, otherEffect.amount);
				}
				break;
			case "hp-loss":
				await actor.modifyHP(-otherEffect.amount);
				break;
			case "extra-attack":
				break;
			case "use-power":
				break;
			case "scan":
				if (actor.isShadow()) {
					if (otherEffect.downgrade == false) {
						await actor.increaseScanLevel(otherEffect.level);
						void PersonaSFX.onScan(token, otherEffect.level);
					} else {
						await actor.decreaseScanLevel(otherEffect.level ?? 0);
					}
				}
				break; // done elsewhere for local player
			case "social-card-action":
				break;
			case "dungeon-action":
				await Metaverse.executeDungeonAction(otherEffect);
				break;
			case "alter-energy":
				if (actor.isShadow()) {
					await actor.alterEnergy(otherEffect.amount);
				}
				break;
			case "alter-mp":
				switch (otherEffect.subtype) {
					case "direct":
						mutableState.mpCost += otherEffect.amount;
						break;
					case "percent-of-total":
						mutableState.mpCost += actor.mmp * (otherEffect.amount / 100);
						break;
					default:
						otherEffect satisfies never;
						// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
						PersonaError.softFail(`Bad subtype for Alter MP effect : ${otherEffect["subtype"]}`);
				}
				break;
			case "alter-theurgy":
				switch (otherEffect.subtype) {
					case "direct":
						mutableState.theurgy += otherEffect.amount;
						break;
					case "percent-of-total":
						mutableState.theurgy += actor.mmp * (otherEffect.amount / 100);
						break;
					default:
						otherEffect satisfies never;
						// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
						PersonaError.softFail(`Bad subtype for Alter Theurgy effect : ${otherEffect["subtype"]}`);
				}
				break;
			case "combat-effect":
				if (PersonaCombat.combat && otherEffect.combatEffect == "auto-end-turn" && actor == game.combat?.combatant?.actor) {
					await PersonaCombat.combat.setForceEndTurn(true);
				}
				break;
			case "alter-fatigue-lvl":
				await actor.alterFatigueLevel(otherEffect.amount);
				break;
			case "alter-variable": {
				const varCons = otherEffect;
				switch (varCons.varType) {
					case "actor": {
						await PersonaVariables.alterVariable(varCons, varCons.situation);
						break;
					}
					case "global":
					case "scene":
					case "social-temp": {
						await PersonaVariables.alterVariable(varCons, varCons.situation);
						break;
					}
				}
				break;
			}
			case "perma-buff":
				await actor.addPermaBuff(otherEffect.buffType, otherEffect.value ?? 0);
				break;
			case "play-sound":
					await PersonaSounds.playFile(otherEffect.soundSrc);
				break;
			case "gain-levels": {
				const {gainTarget, value}=  otherEffect;
				if (!value) {break;}
				if (gainTarget == "persona" || gainTarget == "both") {
					await actor.persona().gainLevel(value);
				}
				if (gainTarget == "actor" || gainTarget == "both") {
					await actor.gainLevel(value);
				}
				void PersonaSFX.onLevelUp();
				break;
			}
			case "cancel":
			case "set-roll-result":
				break;
			case "set-hp": {
				let newhp : number;
				switch (otherEffect.subtype) {
					case "set-to-const":
						newhp = otherEffect.value;
						break;
					case "set-to-percent":
						newhp = otherEffect.value * actor.mhp;
						break;
				}
				await actor.setHP(newhp);
				break;
			}
			case "inventory-action":
				await this.resolveInventoryAction(actor, otherEffect);
				break;
			case "apply-recovery" :
				await actor.spendRecovery(null);
				break;
			default:
				otherEffect satisfies never;
		}
	}

	private static async resolveInventoryAction( actor: PersonaActor,  otherEffect: OtherEffect & {type: "inventory-action"}) : Promise<void> {
		const amount = typeof otherEffect.amount == "number" ? otherEffect.amount ?? 1 : 1;
		switch (otherEffect.invAction) {
			case "add-item": {
				const item = PersonaDB.getItemById(otherEffect.itemId);
				if (!item) {
					PersonaError.softFail(`Can't find Item for add-item: ${otherEffect.itemId}`);
					break;
				}
				if (item.isCarryableType()) {
					await actor.addItem(item, amount);
				}
			}
				break;
			case "add-treasure": {
				const treasureLevel = typeof otherEffect.treasureLevel == "number" ? otherEffect.treasureLevel ?? 0 : 0;
				const treasures = TreasureSystem.generate(treasureLevel, otherEffect.treasureModifier ?? 0, otherEffect.minLevel ?? 0);
				for (const treasure of treasures) {
					await actor.addTreasureItem(treasure);
				}
				break;
			}
			case "remove-item": {
				const item = PersonaDB.getItemById(otherEffect.itemId);
				if (!item) {
					PersonaError.softFail(`Can't find Item for add-item: ${otherEffect.itemId}`);
					break;
				}
				if (!item.isCarryableType()) {
					PersonaError.softFail(`Can't remove non-carryable type: ${item.name}`);
					break;
				}
				await actor.expendConsumable(item,amount);
				break;
			}
			case "add-card-item":
				await actor.addTreasureItem(otherEffect.treasureItem);
				break;
			default:
				otherEffect satisfies never;
				break;
		}
	}

	static async applyGlobalEffect (eff: OtherEffect) {
		switch (eff.type) {
			case "dungeon-action":
				await Metaverse.executeDungeonAction(eff);
				break;
			case "play-sound": {
				const promise  = PersonaSounds.playFile(eff.soundSrc, eff.volume ?? 1.0);
				if (eff.waitUntilFinished) {
					await promise;
				}
				break;
			}
			case "display-message": {
				if (!eff.newChatMsg) {break;}
				const html = eff.msg;
				const speaker : Foundry.ChatSpeakerObject = {
					alias: "System"
				};
				await ChatMessage.create( {
					speaker,
					content: html,
					style: CONST?.CHAT_MESSAGE_STYLES.OTHER,
				});
				break;
			}
		}
	}

	static async #onDefeatOpponent(target: PToken, attacker ?: U<PToken>) : Promise<FinalizedCombatResult[]> {
		const combat = PersonaCombat.combat;
		if (!combat) {return [];}
		if (!await combat?.markTokenDefeated(target)) {
			return []; // the token is already defeated
		}
		const attackerActor = attacker?.actor;
		const ret : FinalizedCombatResult[] = [];
		if (attackerActor) {
			const situation: Situation = {
				trigger: "on-kill-target",
				triggeringCharacter: attackerActor.accessor,
				attacker: attacker.actor.accessor,
				target: target.actor.accessor,
				user: attackerActor.accessor,
				triggeringUser: game.user,
			};
			for (const comb of combat.combatants) {
				if (!comb.actor) {continue;}
				situation.user = comb.actor.accessor;
				ret.push((await TriggeredEffect.onTrigger("on-kill-target", comb.actor, situation)).finalize());
				// this.addChained((await TriggeredEffect.onTrigger("on-kill-target", comb.actor, situation)).finalize());
			}
		}
		void NavigatorVoiceLines.onTargetKilled(target.actor, combat);
		return ret;
	}

} //end of class

type MutableActorState = {
	mpCost: number,
	theurgy: number,
};
