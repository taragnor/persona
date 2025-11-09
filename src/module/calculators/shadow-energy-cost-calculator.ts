import {DamageLevel, DamageType} from "../../config/damage-types.js";
import {PowerTag} from "../../config/power-tags.js";
import {STATUS_EFFECT_LIST, StatusEffectId} from "../../config/status-effects.js";
import {Shadow} from "../actor/persona-actor.js";
import {InstantKillLevel} from "../combat/damage-calc.js";
import {PersonaItem, Power, Tag} from "../item/persona-item.js";
import {CostCalculator} from "./cost-calculator.js";
import {EnergyCostBase} from "./energy-cost-base.js";

export class EnergyClassCalculator extends CostCalculator {
	static calcEnergyCost(pwr: Power, shadow: Shadow) : {energyRequired: number, energyCost: number} {
		const emptyCost = { energyRequired:0, energyCost:0 };
		if (pwr.isPassive()) {return emptyCost;}
		if (pwr.isBasicPower()) {return emptyCost;}
		const baseCost = this.calcBaseEnergyCost(pwr);
		return this.personalizedCostForShadow(baseCost, shadow);
	}

	static personalizedCostForShadow(basePowerLevel: EnergyCostBase, shadow: Shadow) : {energyRequired: number, energyCost: number} {
		const shadow_lvl = shadow.level;
		let {energyRequired, energyCost} = basePowerLevel;

		const situation = {
			user: shadow.accessor,
		};
		const modifiers = shadow.persona().getBonuses("power-energy-cost").total(situation);
		const effectiveCost  = this.BASE_COST + energyCost - shadow_lvl + modifiers;
		const effectiveER  = this.BASE_COST + energyRequired - shadow_lvl + modifiers;
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
			this.#energyLevel_statusAdd(pwr),
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
		const cost = (power.system.attacksMax -1) * 24
			+ (power.system.attacksMin - 1) * 24;
		return new EnergyCostBase(cost, cost);
	}

	static #tags(power: Power) : EnergyCostBase {
		const cost = power.tagList(null).map(tag=> {
			tag = PersonaItem.resolveTag(tag);
			const tagName = tag instanceof PersonaItem ? tag.system.linkedInternalTag  || tag.name : tag;
			const AoEMult = power.isAoE() ? 1.5 : 1;
			if (tagName in this.TAG_ENERGY_COST_MODS) {
				return (this.TAG_ENERGY_COST_MODS[tagName as keyof typeof this.TAG_ENERGY_COST_MODS] ?? 0) * AoEMult;
			}
			return this.NULL_COST;
		})
		.reduce<EnergyCostBase>( (acc, item) => acc.add(item), this.NULL_COST);
		return cost;
	}

	static #energyLevel_damage(pwr: Power) : EnergyCostBase {
		const base = this.DAMAGE_LEVEL_BASE_ENERGY[pwr.system.damageLevel] ?? 0;
		const modifier = this.SHADOW_DAMAGE_TYPE_MODIFIER[pwr.system.dmg_type] ?? 0;
		const cost = base + modifier;
		return new EnergyCostBase(cost, cost);
	}

	static #energyLevel_ailment(pwr: Power) : EnergyCostBase {
		if (!pwr.hasTag("ailment") || pwr.isInstantDeathAttack()) {return this.NULL_COST;}
		switch (pwr.system.ailmentChance) {
			case "none": return this.NULL_COST;
			case "medium": return new EnergyCostBase(12,12);
			case "low": return new EnergyCostBase(5 ,5);
			case "high": return new EnergyCostBase(20 ,20);
			case "always": return new EnergyCostBase(30 ,30);
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

	static #energyLevel_statusAdd(pwr: Power) : EnergyCostBase {
		const statusesAdded = pwr.statusesAdded()
			.filter( status => (STATUS_EFFECT_LIST
				.find(x=> x.id == status)?.tags as U<string[]>)
				?.includes("beneficial"))
		.map (status => this.BENEFICIAL_STATUS_VALUES[status] ?? 0);
		// const numStatuses = statusesAdded.length;
		// const cost = numStatuses * 35;
		const cost = statusesAdded
			.reduce( (acc, st) => acc + st, 0);
		return new EnergyCostBase(0, cost);
	}

	static #energyLevel_statusRemoval(pwr: Power) : EnergyCostBase {
		const statusesRemoved = pwr.statusesRemoved()
		.filter( status => (STATUS_EFFECT_LIST
			.find(x=> x.id == status)?.tags as U<string[]>)
			?.includes("baneful"));
		const numStatuses = statusesRemoved.length;
		let cost = 0;
		for (let amt = 7 ; amt < numStatuses && amt > 0; amt --) {
			cost += amt;
		}
		return new EnergyCostBase(0, cost);
	}

	static AOE_COST_INCREASE: Readonly<EnergyCostBase> = new EnergyCostBase(25, 25);

	static BASE_COST = 30;
	static BASE_POWER_REQUIRED = 25;

	static INSTANT_KILL_LEVELS_ENERGY_COST : Record<InstantKillLevel, number> = {
		none: 0,
		medium: 90,
		always: 150,
		low: 45,
		high: 125,
	} as const;

	static DAMAGE_LEVEL_BASE_ENERGY : Record<DamageLevel, number>  = {
		none: 0,
		"-": 0,
		fixed: 0,
		miniscule: 5,
		basic: 10,
		light: 25,
		medium: 50,
		heavy: 75,
		severe: 100,
		colossal: 125,
	} as const;

	static NULL_COST :Readonly<EnergyCostBase>=  new EnergyCostBase(0, 0);

	static TAG_ENERGY_COST_MODS : Partial<Record<Exclude<PowerTag, Tag>, number>> = {
		"half-on-miss": 10,
		"pierce": 25,
		"high-crit": 15,
		"accurate": 15,
		"inaccurate": -20,
	};

	static BENEFICIAL_STATUS_VALUES : Partial<Record<StatusEffectId, number>> = {
		"magic-shield": 60,
		"phys-shield": 60,
		"protected": 60,
		"power-charge": 55,
		"magic-charge": 55,
	};
	static SHADOW_DAMAGE_TYPE_MODIFIER : Record<DamageType, number> = {
		none: 0,
		light: 0,
		fire: 0,
		wind: -5,
		dark: 0,
		physical: 0,
		gun: 0,
		healing: 10,
		cold: 0,
		lightning: 0,
		untyped: 15,
		"all-out": 0,
		"by-power": 0
	}
}


// type EnergyCostModifier = {
// 	energyRequired: CostModifier;
// 	energyCost: CostModifier;
// };

