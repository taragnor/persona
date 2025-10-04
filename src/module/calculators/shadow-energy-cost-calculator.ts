import {DamageLevel} from "../../config/damage-types.js";
import {Shadow} from "../actor/persona-actor.js";
import {Power} from "../item/persona-item.js";
import {CostCalculator, CostModifier} from "./cost-calculator.js";

export class EnergyClassCalculator extends CostCalculator {
	static calcEnergyCost(pwr: Power, shadow: Shadow) : {energyRequired: number, energyCost: number} {
		const emptyCost = { energyRequired:0, energyCost:0 };
		if (pwr.isBasicPower()) {return emptyCost;}
		const shadowCost = [
			this.energyCost_damage(pwr, shadow)
		].reduce ( (acc, x) => ({
			energyRequired: acc.energyRequired * x.energyRequired.mult + x.energyRequired.add,
			energyCost: acc.energyCost * x.energyCost.mult + x.energyCost.add
		}) , emptyCost);
		if (pwr.isBuffOrDebuff())
		{
			shadowCost.energyCost = Math.max(0, shadowCost.energyCost);
			shadowCost.energyRequired = Math.max(0, shadowCost.energyRequired);
		}
		return shadowCost;
	}

	static energyCost_damage(pwr: Power, shadow: Shadow) :EnergyCostModifier {
		const energyRequired= { mult: 1, add: 0 };
		const energyCost= { mult: 1, add: 0 };
		const ecost : EnergyCostModifier = { energyRequired ,energyCost };
		if (pwr.isDamagePower()) {
			const eLevel = this.energyLevel_power(pwr) ;
			const shadowAdjustedCost = eLevel / shadow.level;
			energyRequired.add += shadowAdjustedCost;
			energyCost.add += shadowAdjustedCost;
		}
		return ecost;
	}

	static energyLevel_power(pwr: Power) : number {
		const items = [
			this.#energyLevel_ailment(pwr),
			this.#energyLevel_damage(pwr),
			this.#energyLevel_ailment(pwr),
			this.#energyLevel_instantKill(pwr),
			this.#energyLevel_buffOrDebuff(pwr),
			this.#energyLevel_statusRemoval(pwr),
		];
		let eLevel =  items.reduce ((acc, item) => acc + item, 0);
		if (pwr.isAoE()) {
			eLevel += 3;
		}
		return eLevel;
	}

	static #energyLevel_damage(pwr: Power) : number {
		const base = this.DAMAGE_LEVEL_MULTIPLIERS_ENERGY[pwr.system.damageLevel] ?? 0;
		const energyLevel = base;
		return energyLevel;
	}

	static #energyLevel_ailment(pwr: Power) : number {
		if (!pwr.hasTag("ailment")) {return 0;}
		const cost = 3;
		return cost;
	}

	static #energyLevel_instantKill(pwr: Power) : number {
		if (!pwr.isInstantDeathAttack()) {return 0;}
		let cost = 0;
		switch (pwr.system.instantKillChance) {
			case "low":
				cost= 2;
				break;
			case "medium":
				cost= 3;
				break;
			case "high":
				cost= 4;
				break;
			default:
				break;
		}
		return cost;
	}

	static #energyLevel_buffOrDebuff(pwr: Power) : number {
		const buffsAndDebuffs = pwr.buffsOrDebuffsAdded();
		if (buffsAndDebuffs == 0) {return 0;}
		return buffsAndDebuffs * 3;
	}

	static #energyLevel_statusRemoval(pwr: Power) : number {
		const statusesRemoved = pwr.statusesRemoved();
		const numStatuses = statusesRemoved.length;
		switch (true) {
			case numStatuses <= 0: return 0;
			case numStatuses == 1: return 3;
			case numStatuses == 2: return 3;
			case numStatuses >= 3: return 4;
			default: return 2;
		}
	}


	static DAMAGE_LEVEL_MULTIPLIERS_ENERGY : Record<DamageLevel, number>  = {
		none: 0,
		"-": 0,
		fixed: 0,
		miniscule: 0.25,
		basic: 0.5,
		light: 1,
		medium: 2,
		heavy: 3,
		severe: 4,
		colossal: 5
	};


}
	type EnergyCostModifier = {
		energyRequired: CostModifier;
		energyCost: CostModifier;
	};

