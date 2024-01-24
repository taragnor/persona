import { PersonaItem } from "../item/persona-item.js";
import { CombatResult } from "./combat-result.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { ModifierList } from "./modifier-list.js";
import { Situation } from "./modifier-list.js";
import { AttackResult } from "./combat-result.js";
import { Usable } from "../item/persona-item.js";
import { ArrayCorrector } from "../item/persona-item.js"
import { PersonaDB } from "../persona-db.js";
import { PersonaRoll } from "../persona-roll.js";


export class PersonaCombat {
	static async usePower(attacker: PToken, power: Usable) : Promise<CombatResult> {
		const targets= await this.getTargets(attacker, power);
		const result = await  this.#usePowerOn(attacker, power, targets);
		await result.print();
		await result.apply();
		return result;
	}

	static async #usePowerOn(attacker: PToken, power: Usable, targets: PToken[]) : Promise<CombatResult> {
		let i = 0;
		const result = new CombatResult();

		for (const target of targets) {
			const atkResult = await this.processAttackRoll( attacker, power, target, i==0);
			const this_result = await this.processEffects(atkResult);
			result.merge(this_result);
			i++;
		}
		await result.toMessage(attacker, power);
		const costs = await this.#processCosts(attacker, power);
		result.merge(costs);
		return result;
	}

	static async processAttackRoll( attacker: PToken, power: Usable, target: PToken, isActivationRoll: boolean) : Promise<AttackResult> {

		const situation : Situation = {
			usedPower: PersonaDB.getUniversalItemAccessor(power),
			user: PersonaDB.getUniversalActorAccessor(attacker.actor),
			userToken: PersonaDB.getUniversalTokenAccessor(attacker),
		};
		const element = power.system.dmg_type;
		const resist = target.actor.elementalResist(element);
		const attackbonus= this.getAttackBonus(attacker, power);
		const combat = this.ensureCombatExists();
		const escalationDie = this.getEscalationDie(combat);
		attackbonus.add("Escalation Die", escalationDie);
		const roll = new PersonaRoll("1d20", attackbonus, situation, `${target.document.name}`);
		await roll.roll();
		const naturalAttackRoll = roll.dice[0].total;
		const baseData = {
			roll,
			attacker ,
			target,
			power
		} satisfies Pick<AttackResult, "attacker" | "target"  | "power" | "roll">;

		switch (resist) {
			case "reflect": {
				return {
					result: "reflect",
					printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					situation: {
						usedPower: PersonaDB.getUniversalItemAccessor(power),
						user: PersonaDB.getUniversalActorAccessor(attacker.actor),
						userToken: PersonaDB.getUniversalTokenAccessor(attacker),
						naturalAttackRoll,
						escalationDie,
					},
					...baseData,
				};
			}
			case "block": {
				return {
					result: "block",
					printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					situation: {
						usedPower: PersonaDB.getUniversalItemAccessor(power),
						user: PersonaDB.getUniversalActorAccessor(attacker.actor),
						userToken: PersonaDB.getUniversalTokenAccessor(attacker),
						naturalAttackRoll,
						escalationDie,
					},
					...baseData,
				};
			}
			case "absorb" : {
				return {
					result: "absorb",
					printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					situation: {
						usedPower: PersonaDB.getUniversalItemAccessor(power),
						user: PersonaDB.getUniversalActorAccessor(attacker.actor),
						userToken: PersonaDB.getUniversalTokenAccessor(attacker),
						naturalAttackRoll,
						escalationDie,
						hit: true,
						criticalHit: false,
						isAbsorbed: true,
					},
					...baseData,
				};
			}

		}
		situation.user= PersonaDB.getUniversalActorAccessor(attacker.actor);
		situation.userToken= PersonaDB.getUniversalTokenAccessor(attacker);
		situation.activeCombat= combat;
		situation.escalationDie= escalationDie;
		situation.activationRoll = isActivationRoll;
		situation.naturalAttackRoll = naturalAttackRoll;
		const total = roll.total;
		const def = power.system.defense;
		const validAtkModifiers = attackbonus.list(situation);
		const printableModifiers = attackbonus.printable(situation);
		if (def == "none") {
			situation.hit = true;
			return {
				result: "hit",
				printableModifiers,
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
		situation.resisted = resist == "resist";
		situation.struckWeakness = resist == "weakness";

		if (total < target.actor.getDefense(def).total(situation)) {
			situation.hit = false;
			situation.criticalHit = false;
			return {
				result: "miss",
				printableModifiers,
				validAtkModifiers,
				validDefModifiers,
				situation,
				...baseData,
			};
		}
		if (resist != "resist" && naturalAttackRoll + critBoost >= 20) {
			situation.hit = true;
			situation.criticalHit  = true;
			return {
				result: "crit",
				validAtkModifiers,
				validDefModifiers,
				printableModifiers,
				situation,
				...baseData,
			};
		} else {
			situation.hit = true;
			situation.criticalHit = false;
			return {
				result: "hit",
				validAtkModifiers,
				validDefModifiers,
				printableModifiers,
				situation,
				...baseData,
			}
		}
	}

	static async processEffects(atkResult: AttackResult) : Promise<CombatResult> {
		const CombatRes= new CombatResult();
		const {result, validAtkModifiers, validDefModifiers, attacker, target, situation, power} = atkResult;
		switch (result) {
			case "reflect":
				CombatRes.merge(await this.#usePowerOn(attacker, power, [attacker]));
				break;
			case "block":
				const blockRes = new CombatResult(atkResult);
				CombatRes.merge(blockRes);
				break;

		}
		CombatRes.merge(await this.processPowerEffectsOnTarget(atkResult));

		return CombatRes;
	}

	static async processPowerEffectsOnTarget(atkResult: AttackResult) : Promise<CombatResult> {
		const CombatRes= new CombatResult(atkResult);
		const {result, validAtkModifiers, validDefModifiers, attacker, target, situation, power} = atkResult;
		for (let {conditions, consequences} of power.system.effects) {
			conditions = ArrayCorrector(conditions);
			consequences  = ArrayCorrector(consequences);

			if (conditions.every(
				cond => ModifierList.testPrecondition(cond, situation, power))
			) {
				for (const cons of consequences) {
					let damageMult = 1;
					const absorb = situation.isAbsorbed && !cons.applyToSelf;
					const block = result == "block" && !cons.applyToSelf;
					const consTarget = cons.applyToSelf ? attacker: target;
					const crit = result == "crit" && !cons.applyToSelf;
					damageMult *= situation.resisted ? 0.5 : 1;
					damageMult *= crit ? 2 : 1;
					switch (cons.type) {
						case "dmg-high":
							CombatRes.addEffect(atkResult, consTarget, {
								type: "dmg-high",
								amount: power.getDamage(attacker.actor, "high") * (absorb ? -1 : damageMult),
							});
							continue;
						case "dmg-low":
							CombatRes.addEffect(atkResult, consTarget, {
								type: "dmg-low",
								amount: power.getDamage(attacker.actor, "low") * (absorb ? -1 : damageMult),
							});
							continue;
						case "extraAttack" :
							//TODO: handle later
							continue;
						case "none":
							continue;
						case "addStatus": case "removeStatus":
							if (absorb || block) continue;
							CombatRes.addEffect(atkResult, consTarget, cons);
						case "dmg-mult":
							CombatRes.addEffect(atkResult, consTarget, cons);
							break;
						case "escalationManipulation":
							CombatRes.escalationMod += (cons.amount ?? 0);
							continue;
						case "modifier":
								continue;
						case "hp-loss":
								CombatRes.addEffect(atkResult, consTarget, {
									type: "hp-loss",
									amount: cons.amount ?? 0,
								});
							continue;
						default:
								CombatRes.addEffect(atkResult, consTarget, cons);
							break;
					}
				}

			}
		}
		return CombatRes;
	}

	static async #processCosts(attacker: PToken , power: Usable) : Promise<CombatResult>
		{
			const res = new CombatResult();
			if (power.system.type == "power") {
				if (attacker.actor.system.type == "pc" && power.system.hpcost) {
					res.addEffect(null, attacker, {
						type: "hp-loss",
						amount: power.system.hpcost
					});
				}
				if (attacker.actor.system.type == "pc" && power.system.subtype == "magic" && power.system.slot){
					res.addEffect(null, attacker, {
						type: "expend-slot",
						amount: power.system.slot,
					});
				}
			}
			return res;
		}
	static getAttackBonus(attacker: PToken, power:Usable): ModifierList {
		const actor = attacker.actor;
		if (power.system.type == "consumable") {
			const l = new ModifierList();
			l.add("Item Base Bonus", power.system.atk_bonus);
			return l;
		}
		if (power.system.subtype == "weapon") {
			const mod = actor.wpnAtkBonus();
			return mod.concat(new ModifierList(power.getModifier("wpnAtk")));
		}
		if (power.system.subtype == "magic") {
			const mod = actor.magAtkBonus();
			return mod.concat(new ModifierList(power.getModifier("magAtk")));
		}
		return new ModifierList();
	}


	static async getTargets(attacker: PToken, power: Usable): Promise<PToken[]> {
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


