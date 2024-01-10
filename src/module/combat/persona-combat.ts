import { STATUS_EFFECT_LIST } from "../../config/status-effects";
import { STATUS_EFFECT_DURATIONS_LIST } from "../../config/status-effects";
import { PersonaActor } from "../actor/persona-actor";
import { Power } from "../item/persona-item";
import { ModifierList } from "./modifier-list";
import { Situation } from "./modifier-list";


type AttackResult = {
	result: "hit" | "miss" | "crit" | "reflect" | "block" | "absorb",
	validAtkModifiers: [number, string][],
	validDefModifiers: [number, string][],
	naturalRoll: number,
};

export class PersonaCombat {
	static async usePower(attacker: PToken, power: Power) {
		const targets= await this.getTargets(attacker, power);
		return this.#usePowerOn(attacker, power, targets);
	}

	static async #usePowerOn(attacker: PToken, power: Power, targets: PToken[]) : Promise<CombatResult<PToken>> {
		const attackbonus= this.getAttackBonus(attacker, power);
		const combat = this.ensureCombatExists();
		const escalationDie = 0; //placeholder
		let i = 0;

		for (const target of targets) {
			const roll = new Roll("1d20");
			await roll.roll();
			const atkResult = await this.processAttackRoll(roll, attacker, power, target, i==0);
			i++;
		}
		return {
			tokens: [],
			escalationMod: 0,
		}; //Placeholder
	}

	static async processAttackRoll(roll: Roll, attacker: PToken, power: Power, target: PToken, isActivationRoll: boolean) : Promise<AttackResult> {
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
					naturalRoll : naturalAttackRoll,
				};
			}
			case "block": {
				return {
					result: "block",
					validAtkModifiers: [],
					validDefModifiers: [],
					naturalRoll : naturalAttackRoll,
				};
			}
			case "absorb" : {
				return {
					result: "absorb",
					validAtkModifiers: [],
					validDefModifiers: [],
					naturalRoll : naturalAttackRoll,
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
				naturalRoll : naturalAttackRoll,
			};
		}
		const critBoostMod = attacker.actor.critBoost();
		if (resist == "weakness") {
			critBoostMod.add("weakness", 4);
		}
		const critBoost = critBoostMod.total(situation);
		const validDefModifiers= target.actor.getDefense(def).list(situation);
		if (total < target.actor.getDefense(def).total(situation))
			return {
				result: "miss",
				validAtkModifiers,
				validDefModifiers,
				naturalRoll: naturalAttackRoll
			};
		if (naturalAttackRoll + critBoost >= 20) {
			return {
				result: "crit",
				validAtkModifiers,
				validDefModifiers,
				naturalRoll: naturalAttackRoll
			};
		} else return {
			result: "hit",
			validAtkModifiers,
			validDefModifiers,
			naturalRoll: naturalAttackRoll
		}
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

type PToken = Token<ValidAttackers>;


export interface CombatResult<T extends Token<any>> {
	tokens: TokenChange<T>[];
	escalationMod: number;
}

export interface TokenChange<T extends Token<any>> {
	token: T;
	hpchange: number;
	addStatus: {
		id: (typeof STATUS_EFFECT_LIST)[number]["id"],
		potency ?: number,
		duration : typeof STATUS_EFFECT_DURATIONS_LIST[number],
	}[];
	removeStatus: {
		id: (typeof STATUS_EFFECT_LIST)[number]["id"],
	}[];
}

