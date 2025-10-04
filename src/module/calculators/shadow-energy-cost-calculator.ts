import {DamageLevel} from "../../config/damage-types.js";
import {PowerTag} from "../../config/power-tags.js";
import {Shadow} from "../actor/persona-actor.js";
import {InstantKillLevel} from "../combat/damage-calc.js";
import {PersonaItem, Power, Tag} from "../item/persona-item.js";
import {CostCalculator} from "./cost-calculator.js";
import {EnergyCostBase} from "./energy-cost-base.js";

export class EnergyClassCalculator extends CostCalculator {
	static calcEnergyCost(pwr: Power, shadow: Shadow) : {energyRequired: number, energyCost: number} {
		const emptyCost = { energyRequired:0, energyCost:0 };
		if (pwr.isBasicPower()) {return emptyCost;}
		const baseCost = this.calcBaseEnergyCost(pwr);
		return this.personalizedCostForShadow(baseCost, shadow);
	}

	static personalizedCostForShadow(basePowerLevel: EnergyCostBase, shadow: Shadow) : {energyRequired: number, energyCost: number} {
		const shadow_lvl = shadow.level;
		let {energyRequired, energyCost} = basePowerLevel;

		const effectiveCost  = this.BASE_COST + energyCost - shadow_lvl;
		const effectiveER  = this.BASE_COST + energyRequired - shadow_lvl;
		energyRequired  = Math.floor(Math.max(0 , effectiveER) / 10);
		energyCost  = Math.floor(Math.max(0, effectiveCost) / 10);
		if (energyCost <= 0) {
			return { energyRequired: 0, energyCost: 0, };
		}
		const ret = { energyRequired, energyCost, };
		return ret;
	}

	static calcBaseEnergyCost(pwr: Power) : EnergyCostBase {
		const items : EnergyCostBase[] = [
			this.#energyLevel_ailment(pwr),
			this.#energyLevel_damage(pwr),
			this.#energyLevel_ailment(pwr),
			this.#energyLevel_instantKill(pwr),
			this.#energyLevel_buffOrDebuff(pwr),
			this.#energyLevel_statusRemoval(pwr),
			this.#targetsMod(pwr),
			this.#tags(pwr),
			this.#multiattack(pwr),
		];
		const eLevel =  items.reduce<EnergyCostBase>((acc, item) => acc.add(item), this.NULL_COST);
		return eLevel;
	}

	static #targetsMod(power: Power) : EnergyCostBase {
		if (!power.isAoE()) {
			return this.NULL_COST;
		}
		if (power.system.targets == "1-random-enemy") {
			return new EnergyCostBase(-15,-15);
		}
		return this.AOE_COST_INCREASE;
	}

	static #multiattack(power: Power) : EnergyCostBase {
		if (power.system.attacksMax <= 1) {return this.NULL_COST;}
		const cost = (power.system.attacksMax -1) * 10
			+ (power.system.attacksMin - 1) * 5;
		return new EnergyCostBase(cost, cost);
	}

	static #tags(power: Power) : EnergyCostBase {
		const cost = power.tagList(null).map(tag=> {
			tag = PersonaItem.resolveTag(tag);
			const tagName = tag instanceof PersonaItem ? tag.name : tag;
			if (tagName in this.TAG_ENERGY_COST_MODS) {
				return this.TAG_ENERGY_COST_MODS[tagName as keyof typeof this.TAG_ENERGY_COST_MODS];
			}
			return this.NULL_COST;
		})
		.reduce<EnergyCostBase>( (acc, item) => acc.add(item!), this.NULL_COST);
		return cost;
	}

	static #energyLevel_damage(pwr: Power) : EnergyCostBase {
		const base = this.DAMAGE_LEVEL_MULTIPLIERS_ENERGY[pwr.system.damageLevel] ?? 0;
		return new EnergyCostBase(base, base);
	}

	static #energyLevel_ailment(pwr: Power) : EnergyCostBase {
		if (!pwr.hasTag("ailment")) {return this.NULL_COST;}
		switch (pwr.system.ailmentChance) {
			case "none": return this.NULL_COST;
			case "medium": return new EnergyCostBase(25,25);
			case "low": return new EnergyCostBase(12 ,12);
			case "high": return new EnergyCostBase(30 ,30);
			case "always": return new EnergyCostBase(40 ,40);
		}
	}

	static #energyLevel_instantKill(pwr: Power) : EnergyCostBase {
		if (!pwr.isInstantDeathAttack()) {return this.NULL_COST;}
		const cost = this.INSTANT_KILL_LEVELS_ENERGY_COST[pwr.system.instantKillChance];
		return new EnergyCostBase(cost, cost);
	}

	static #energyLevel_buffOrDebuff(pwr: Power) : EnergyCostBase {
		const buffsAndDebuffs = pwr.buffsOrDebuffsAdded();
		if (buffsAndDebuffs == 0) {return this.NULL_COST;}
		const cost =  buffsAndDebuffs * 25;
		return new EnergyCostBase( 0, cost);
	}

	static #energyLevel_statusRemoval(pwr: Power) : EnergyCostBase {
		const statusesRemoved = pwr.statusesRemoved();
		const numStatuses = statusesRemoved.length;
		const cost = numStatuses * 5;
		return new EnergyCostBase(0, cost);
	}

	static AOE_COST_INCREASE: Readonly<EnergyCostBase> = new EnergyCostBase(25, 25);

	static BASE_COST = 30;
	static BASE_POWER_REQUIRED = 25;

	static INSTANT_KILL_LEVELS_ENERGY_COST : Record<InstantKillLevel, number> = {
		none: 0,
		medium: 60,
		always: 120,
		low: 30,
		high: 90,
	} as const;

	static DAMAGE_LEVEL_MULTIPLIERS_ENERGY : Record<DamageLevel, number>  = {
		none: 0,
		"-": 0,
		fixed: 0,
		miniscule: 0.25,
		basic: 0.5,
		light: 25,
		medium: 50,
		heavy: 75,
		severe: 100,
		colossal: 125,
	} as const;

	static NULL_COST :Readonly<EnergyCostBase>=  new EnergyCostBase(0, 0);

	static TAG_ENERGY_COST_MODS : Partial<Record<Exclude<PowerTag, Tag>, number>> = {
		"half-on-miss": 15,
		"pierce": 30,
		"high-crit": 10,
		"accurate": 10,
		"inaccurate": -10,
	};
}


// type EnergyCostModifier = {
// 	energyRequired: CostModifier;
// 	energyCost: CostModifier;
// };

