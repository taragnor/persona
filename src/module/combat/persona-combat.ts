import { PersonaItem } from "../item/persona-item.js";
import { CombatResult } from "./combat-result.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { Power } from "../item/persona-item.js";
import { ModifierList } from "./modifier-list.js";
import { Situation } from "./modifier-list.js";
import { AttackResult } from "./combat-result.js";

export class PersonaCombat {
	static async usePower(attacker: PToken, power: Power) : Promise<CombatResult> {
		const targets= await this.getTargets(attacker, power);
		return this.#usePowerOn(attacker, power, targets);
	}

	static async #usePowerOn(attacker: PToken, power: Power, targets: PToken[]) : Promise<CombatResult> {
		const attackbonus= this.getAttackBonus(attacker, power);
		const combat = this.ensureCombatExists();
		const escalationDie = 0; //placeholder
		let i = 0;
		const result = new CombatResult();

		for (const target of targets) {
			const roll = new Roll("1d20");
			await roll.roll();
			const atkResult = await this.processAttackRoll(roll, attacker, power, target, i==0);
			const this_result = await this.processEffects(atkResult);
			result.merge(this_result);
			i++;
		}
		return result;
	}

	static async processAttackRoll(roll: Roll, attacker: PToken, power: Power, target: PToken, isActivationRoll: boolean) : Promise<AttackResult> {
		const baseData = {
			attacker ,
			target,
			power
		} satisfies Pick<AttackResult, "attacker" | "target"  | "power">;
		const element = power.system.dmg_type;
		const resist = target.actor.elementalResist(element);
		const attackbonus= this.getAttackBonus(attacker, power);
		const combat = this.ensureCombatExists();
		const escalationDie = this.getEscalationDie(combat);
		const naturalAttackRoll = roll.total;
		switch (resist) {
			case "reflect": {
				return {
					result: "reflect",
					validAtkModifiers: [],
					validDefModifiers: [],
					situation: {
						naturalAttackRoll,
					},
					...baseData,
				};
			}
			case "block": {
				return {
					result: "block",
					validAtkModifiers: [],
					validDefModifiers: [],
					situation: {
						naturalAttackRoll,
					},
					...baseData,
				};
			}
			case "absorb" : {
				return {
					result: "absorb",
					validAtkModifiers: [],
					validDefModifiers: [],
					situation: {
						naturalAttackRoll,
					},
					...baseData,
				};
			}

		}
		const situation : Situation = {
			activeCombat: combat,
			escalationDie,
			activationRoll : isActivationRoll,
			naturalAttackRoll
		};
		const total = attackbonus.total(situation);
		const def = power.system.defense;
		const validAtkModifiers = attackbonus.list(situation);
		if (def == "none") {
			return {
				result: "hit",
				validAtkModifiers,
				validDefModifiers: [],
				situation,
				...baseData,
			};
		}
		const critBoostMod = attacker.actor.critBoost();
		if (resist == "weakness") {
			critBoostMod.add("weakness", 4);
		}
		if (target.actor.statuses.has("blocking")) {
			critBoostMod.add("defender blocking", -100);
		}
		const critBoost = critBoostMod.total(situation);
		const validDefModifiers= target.actor.getDefense(def).list(situation);
		if (total < target.actor.getDefense(def).total(situation))
		return {
			result: "miss",
			validAtkModifiers,
			validDefModifiers,
			situation,
			...baseData,
		};
		if (resist != "resist" && naturalAttackRoll + critBoost >= 20) {
			return {
				result: "crit",
				validAtkModifiers,
				validDefModifiers,
				situation,
				...baseData,
			};
		} else return {
			result: "hit",
			validAtkModifiers,
			validDefModifiers,
			situation,
			...baseData,
		}
	}

	static async processEffects(atkResult: AttackResult) : Promise<CombatResult> {
		const CombatRes= new CombatResult();
		const {result, validAtkModifiers, validDefModifiers, attacker, target, situation, power} = atkResult;
		CombatRes.merge(await this.processPowerEffectsOnTarget(atkResult));
		switch (result) {
			case "reflect":
				CombatRes.merge(await this.#usePowerOn(attacker, power, [attacker]));
				break;
			case "block":
				const blockRes = new CombatResult(atkResult);
				CombatRes.merge(blockRes);
				break;

		}

		return CombatRes;
	}

	static async processPowerEffectsOnTarget(atkResult: AttackResult) {
		const CombatRes= new CombatResult(atkResult);
		const {result, validAtkModifiers, validDefModifiers, attacker, target, situation, power} = atkResult;
		for (const {conditions, consequences} of power.system.effects) {
			if (conditions.every(
				cond => PersonaItem.testPrecondition(cond, situation))
			) {
				for (const cons of consequences) {
					let damageMult = 1;
					const absorb = result == "absorb" && !cons.applyToSelf;
					const block = result == "block" && !cons.applyToSelf;
					const consTarget = cons.applyToSelf ? attacker: target;
					const crit = result == "crit" && !cons.applyToSelf;
					damageMult *= block ? 0.5 : 1;
					damageMult *= crit ? 2 : 1;
					switch (cons.type) {
						case "dmg-high":
							CombatRes.addEffect(consTarget, {
								type: "dmg-high",
								amount: power.getDamage(attacker.actor, "high") * (absorb ? -1 : damageMult),
							});
							continue;
						case "dmg-low":
							CombatRes.addEffect(consTarget, {
								type: "dmg-low",
								amount: power.getDamage(attacker.actor, "low") * (absorb ? -1 : damageMult),
							});
							continue;
						case "extraAttack" :
							//TODO: handle later
							break;
						case "none":
							continue;
						case "addStatus": case "removeStatus":
							if (absorb || block) continue;
						default:
							break;
					}
					CombatRes.addEffect(consTarget, cons);
				}

			}


		}

		return CombatRes;
	}

	static getAttackBonus(attacker: PToken, power:Power): ModifierList {
		const actor = attacker.actor;
		if (power.system.subtype == "weapon")
			return actor.wpnAtkBonus();
		if (power.system.subtype == "magic")
			return actor.magAtkBonus();
		return new ModifierList();
	}


	static async getTargets(attacker: PToken, power: Power): Promise<PToken[]> {
		const selected = Array.from(game.user.targets) as PToken[];
		const attackerType = attacker.actor.system.type;
		switch (power.system.targets) {
			case "1-engaged":
				this.checkTargets(1,1);
				return selected;
			case "1-nearby":
				this.checkTargets(1,1);
				return selected;
			case "all-enemies": {
				const combat= this.ensureCombatExists();
				const targets= combat.combatants.filter( x => {
					const actor = x.actor;
					if (!actor)  return false;
					return (x.actor.system.type != attackerType)
				});
				return targets.map( x=> x.token._object as PToken);
			}
			case "all-allies": {
				const combat= this.ensureCombatExists();
				const targets= combat.combatants.filter( x => {
					const actor = x.actor;
					if (!actor)  return false;
					return (x.actor.system.type == attackerType)
				});
				return targets.map( x=> x.token._object as PToken);
			}
			case "self": {
				return [attacker];
			}
			default:
				throw new Error(`targets ${power.system.targets} Not yet implemented`);
		}
	}

	static checkTargets(min: number, max: number) {
		const selected = Array.from(game.user.targets);
		if (selected.length == 0)  {
			const error = "Requires Target to be selected";
			ui.notifications.warn(error);
			throw new Error(error);
		}
		if (selected.length < min) {
			const error = "Too few targets selected";
			ui.notifications.warn(error);
			throw new Error(error);
		}
		if (selected.length > max) {
			const error = "Too many targets selected";
			ui.notifications.warn(error);
			throw new Error(error);
		}
	}

	static ensureCombatExists() : Combat<PersonaActor> {
		const combat = game.combat;
		if (!combat) {
			const error = "No Combat";
			ui.notifications.warn(error);
			throw new Error(error);
		}
		return combat;

	}

	static getEscalationDie<T extends Combat<any>>(combat: T) : number {
		return 0;//placeholder
	}

}

type ValidAttackers = Subtype<PersonaActor, "pc"> | Subtype<PersonaActor, "shadow">;

export type PToken = Token<ValidAttackers>;



