import { INSTANT_KILL_LEVELS } from "../combat/damage-calc.js";
import { DamageLevel, DamageType } from "../../config/damage-types.js";
import { PowerTag } from "../../config/power-tags.js";
import { STATUS_AILMENT_LIST, STATUS_EFFECT_LIST, StatusEffectId } from "../../config/status-effects.js";
import { InstantKillLevel } from "../combat/damage-calc.js";
import { PersonaItem} from "../item/persona-item.js";
import { CostCalculator } from "./cost-calculator.js";
import { EnergyCostBase } from "./energy-cost-base.js";
import {Persona} from "../persona-class.js";

export class EnergyClassCalculator extends CostCalculator {
     static MULTIATTACK_MULT = 17 as const;

	 static calcEnergyCost(pwr: Power, shadow: Persona) : {energyRequired: number, energyCost: number, cooldown: number} {
			const baseCost = this.calcBasePowerCost(pwr);
			if (baseCost == null) {
				 const emptyCost = { energyRequired:0, energyCost:0, cooldown: 0 };
				 return emptyCost;
			}
			return this.personalizedCostForShadow(baseCost, shadow, pwr);
	 }

	 private static calcBasePowerCost(pwr: Power)  {
			if (pwr.isPassive()) {return null;}
			if (pwr.isBasicPower()) {return null;}
			const baseCost = this.calcBaseEnergyCost(pwr);
			return baseCost;
	 }

	 static calcCooldown(pwr: Power, shadow: Shadow) : number {
			const baseCost = this.calcBasePowerCost(pwr);
			if (baseCost == null) {return 0;}
			const {energyRequired} = baseCost;
			const shadow_lvl = shadow.level;
			const effectiveER  = this.BASE_COST + energyRequired - shadow_lvl;
			const RawCD = Math.max(0, effectiveER - 30) / 30;
			const MinCD = pwr.system.defense == "ail" || pwr.system.defense == "kill" ? 1 : 0;
			const cooldown = Math.clamp( Math.round(RawCD), MinCD, 3);
			return Math.max(cooldown, pwr.system.cooldown ?? 0);
	 }

	static personalizedCostForShadow(basePowerLevel: EnergyCostBase, shadow: Persona, power: Power) : {energyRequired: number, energyCost: number, cooldown: number} {
		const shadow_lvl = shadow.level;
		let {energyRequired, energyCost} = basePowerLevel;

		const situation : Situation = {
			user: shadow.user.accessor,
      usedPower: power.accessor,
		};
		const modifiers = shadow.getBonuses("power-energy-cost").total(situation);
		const effectiveCost  = this.BASE_COST + energyCost + modifiers - shadow_lvl;
		const effectiveER  = this.BASE_COST + energyRequired + modifiers - shadow_lvl;
		energyCost  = Math.floor(Math.max(0, effectiveCost / 10));
		const minReq = Math.max(0, energyCost-5);
		energyRequired  = Math.floor(Math.clamp(effectiveER / 10, minReq, shadow.maxEnergy));
		 const cooldown = Math.clamp( effectiveER/10 - 50, 0, 3);
		if (energyCost <= 0) {
			return { energyRequired: 0, energyCost: 0, cooldown };
		}
		const ret = { energyRequired, energyCost, cooldown};
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
			this.#power_modifiers(pwr),
		];
		const eLevel =  items.reduce<EnergyCostBase>((acc, item) => acc.add(item), this.NULL_COST);
		return eLevel;
	}

	static #power_modifiers(pwr: Power) : EnergyCostBase {
		const situation : Situation  = {
			usedPower: pwr.accessor,
		};
		const energyRequired = pwr.getBonuses("power-energy-req").total(situation);
		const energyCost = pwr.getBonuses("power-energy-cost").total(situation);
		return new EnergyCostBase(energyRequired, energyCost);
	}

	static #targetsMod(power: Power) : EnergyCostBase {
		if (!power.isAoE()) {
			return this.NULL_COST;
		}
		if (power.targets() == "1-random-enemy") {
			return new EnergyCostBase(-15,-15);
		}
		return this.AOE_COST_INCREASE;
	}

	static #multiattack(power: Power) : EnergyCostBase {
		if (power.system.attacksMax <= 1) {return this.NULL_COST;}
		const cost = (power.system.attacksMax - 1) * this.MULTIATTACK_MULT
			+ (power.system.attacksMin - 1) * this.MULTIATTACK_MULT;
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
		const cost = base;
		return new EnergyCostBase(cost, cost);
	}

	static #energyLevel_ailment(pwr: Power) : EnergyCostBase {
		if (!pwr.hasTag("ailment", null) || pwr.isInstantDeathAttack()) {return this.NULL_COST;}
		const ailmentBase = pwr.ailmentsCaused().reduce( (acc, ail) => Math.max (acc, this.AILMENT_VALUE[ail as keyof typeof this.AILMENT_VALUE] ?? 0), 0);
		const ailMult = this.AILMENT_MULT_CHANCE[pwr.system.ailmentChance];
		return new EnergyCostBase(ailMult.energyCost * ailmentBase, ailMult.energyRequired * ailmentBase) ;
	}

	static #energyLevel_instantKill(pwr: Power) : EnergyCostBase {
		if (!pwr.isInstantDeathAttack()) {return this.NULL_COST;}
		if (!pwr.canDealDamage()) {
			const cost = this.INSTANT_KILL_LEVELS_ENERGY_COST[pwr.system.instantKillChance];
			return new EnergyCostBase(cost, cost);
		}
		switch (pwr.system.instantKillChance) {
			case "none": return this.NULL_COST;
			case "medium": return new EnergyCostBase(24,24);
			case "low": return new EnergyCostBase(10 ,10);
			case "high": return new EnergyCostBase(35 ,35);
			case "always": return new EnergyCostBase(55 ,55);
		}

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
				.find(x=> x.id == status.status)?.tags as U<string[]>)
				?.includes("beneficial"))
			.map (status => this.BENEFICIAL_STATUS_VALUES[status.status] ?? 0);
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

	static AOE_COST_INCREASE: Readonly<EnergyCostBase> = new EnergyCostBase(32, 32);

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
		severe: 88,
		colossal: 99,
	} as const;

	static NULL_COST :Readonly<EnergyCostBase>=  new EnergyCostBase(0, 0);

	static TAG_ENERGY_COST_MODS : Partial<Record<Exclude<PowerTag, Tag>, number>> = {
		"half-on-miss": 10,
		"high-crit": 14,
		"accurate": 7,
		"inaccurate": -22,
	};

	static BENEFICIAL_STATUS_VALUES : Partial<Record<StatusEffectId, number>> = {
		"magic-shield": 60,
		"phys-shield": 60,
		"protected": 60,
		"power-charge": 65,
		"magic-charge": 65,
	};
	static SHADOW_DAMAGE_TYPE_MODIFIER : Record<DamageType, number> = {
		none: 0,
		light: 0,
		fire: 0,
		wind: -5,
		dark: 0,
		physical: 0,
		gun: 0,
		healing: 0,
		cold: 0,
		lightning: 0,
		untyped: 6,
		"all-out": 0,
		"by-power": 0
	};

	static AILMENT_MULT_CHANCE : Record<keyof typeof INSTANT_KILL_LEVELS, EnergyCostBase> = {
		none: this.NULL_COST,
		low: new EnergyCostBase(5, 5),
		medium: new EnergyCostBase(12,12),
		high: new EnergyCostBase(20, 20),
		always: new EnergyCostBase(30, 30),
	};

	static AILMENT_VALUE : Record<typeof STATUS_AILMENT_LIST[number], number> = {
		dizzy: 0.75,
		fear: 1,
		sleep:1,
		poison: 0.5,
		rage: 0.75,
		blind: 1,
		mouse: 1.25,
		sealed: 1,
		despair: 1,
		charmed: 1,
		confused: 1,
	};

}

