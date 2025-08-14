import { PowerTag } from "../config/power-tags.js";
import { DamageType } from "../config/damage-types.js";
import { DamageLevel } from "../config/damage-types.js";
import { Power } from "./item/persona-item.js";
import { InstantKillLevel } from "../config/damage-types.js";

export class PowerCostCalculator {

	static calcHPPercentCost(pwr: Power) : number {
		if (pwr.isBasicPower()) return 0;
		const val = [
			this.hpCost_damage(pwr),
			this.tagAdjust(pwr),
			this.hpCost_instantKill(pwr),
			this.hpCost_ailment(pwr),
		].reduce ( (acc, x) => acc * x.mult + x.add, 0);
		return Math.round(val);
	}

	static tagAdjust(pwr: Power) : CostModifier {
		let total = 0;
		for (const tag of pwr.tagList(null)) {
			total += TAG_ADJUST_HP[tag as PowerTag] ?? 0;
		}
		return i(total);
	}

	static hpCost_ailment(pwr: Power) : CostModifier {
		switch (pwr.system.ailmentChance) {
			case "none":
				return i(0);
			case "low":
				return i(2);
			case "medium":
				return i(4);
			case "high":
				return i(6);
		}
	}

	static hpCost_damage(pwr: Power) : CostModifier { 
		const baselevel = pwr.system.damageLevel;
		if (baselevel == "none") return i(0);
		const baseLevel = 1;
		const levelMult = DAMAGE_LEVEL_MULTIPLIERS_HP[baselevel];
		let cost = baseLevel + (4 * levelMult);
		if (pwr.isAoE()) {
			cost = cost * 1.5;
		}
		return i(cost);
	}

	static hpCost_instantKill(pwr: Power) : CostModifier {
		if (pwr.system.instantKillChance == "none") return i(0);
		switch (pwr.system.instantKillChance) {
			case "low":
				return {mult: 1.1, add: 2};
			case "medium":
				return {mult: 1.5, add: 3};
			case "high":
				return {mult: 2, add: 5};
		}
	}

	static calcMPCost(pwr: Power) : number {
		const val =  [
			this.mpCost_damagePower(pwr),
			this.mpCost_instantKill(pwr),
			this.mpCost_buffOrDebuff(pwr),
			this.mpCost_ailment(pwr),
			this.mpCost_dekaja(pwr),
			// this.statusRemoval(pwr),
		].reduce ( (acc, x) => acc * x.mult + x.add, 0);
		return Math.round(val);
	}

	static mpCost_damagePower(pwr : Power) : CostModifier {
		const baselevel = pwr.system.damageLevel;
		if (baselevel == "none") return i(0);
		const baseCost = BASE_MP_COSTS["directDamage"];
		const levelMult = DAMAGE_LEVEL_MULTIPLIERS_MP[baselevel];
		const dmgType = pwr.system.dmg_type;
		let cost = baseCost * levelMult;
		{
		const {mult, add} = DAMAGE_TYPE_MODIFIER[dmgType];
			cost = cost * mult + add;
		}
		if (pwr.isAoE()) {
			cost *= 1.5;
			cost += 4;
		}
		return i(cost);
	}

	static mpCost_dekaja(pwr: Power) : CostModifier {
		const buffsRemoved = pwr.removesStatus(["attack-nerf", "damage-nerf", "defense-nerf"]);
		if (buffsRemoved >= 3) {
			return i(10);
		}
		return i(0);
	}

	static mpCost_ailment(pwr: Power) : CostModifier {
		if (!pwr.causesAilment()) return i(0);
		let mult = 1;
		let add = 0;
		switch (pwr.system.ailmentChance) {
			case "low":
				mult *= 1.1;
				add += 2;
				break;
			case "medium":
				mult *= 1.5;
				add += 2;
				break;
			case "high":
				mult *= 2.0;
				add += 3;
				break;
			case "none":
				mult *= 2.0;
				add += 3;
				break;
		}
		if (pwr.isAoE()) {
			add += 6;
		}
		return {add, mult};
	}

	static mpCost_buffOrDebuff(pwr: Power) : CostModifier {
		const buffsGranted=  pwr.addsStatus(["attack-boost", "damage-boost", "defense-boost", "attack-nerf", "damage-nerf", "defense-nerf"]);
		let baseCost = buffsGranted * 8;
		if (buffsGranted >= 3) baseCost += 6;
		if (pwr.isAoE()) {
			baseCost *= 3;
		}
		return i(baseCost);
	}

	static mpCost_instantKill(pwr: Power): CostModifier {
		if (!pwr.canInstantKill()) return i(0);
		const mult = INSTANT_KILL_LEVELS_MULT[pwr.system.instantKillChance];
		const INSTANT_KILL_BASE_COST = 8;
		let cost =  mult * INSTANT_KILL_BASE_COST;
		if (pwr.isAoE()) {
			cost *= 2.25;
			cost += 0;
		}
		return i(cost);
	}

}

const BASE_MP_COSTS = {
	"directDamage": 4,

}as const;

const INSTANT_KILL_LEVELS_MULT : Record<InstantKillLevel, number> = {
	none: 0,
	low: 1,
	medium: 1.875,
	high: 2.5,
}

const DAMAGE_TYPE_MODIFIER : Record<DamageType, CostModifier> = {
	none: s(0),
	fire: s(1),
	wind: s(0.75),
	light: s(1),
	dark: s(1),
	physical: s(1),
	gun: s(1),
	healing: s(1),
	cold: s(1),
	lightning: s(1),
	untyped: {mult: 1, add: 0},
	"all-out": s(0),
	"by-power": s(1),
};

function s(mult: number) : CostModifier {
	return {mult, add:0};
}

function i(add: number) : CostModifier {
	return {mult: 1, add};
}

type CostModifier = {mult: number, add:number};

const DAMAGE_LEVEL_MULTIPLIERS_HP : Record<DamageLevel, number>  = {
	none: 0,
	light: 1,
	"-": 0,
	fixed: 0,
	miniscule: 1,
	basic: 0.5,
	medium: 2,
	heavy: 3,
	severe: 4,
	colossal: 5
};

const DAMAGE_LEVEL_MULTIPLIERS_MP : Record<DamageLevel, number>  = {
	none: 1,
	"-": 0,
	fixed: 1,
	miniscule: 0.5,
	basic: 0.25,
	light: 1,
	medium: 2,
	heavy: 3,
	severe: 9,
	colossal: 24,
};


const TAG_ADJUST_HP : Partial<Record<PowerTag, number>> = {
	inaccurate: -3,
	accurate: 3,
	"high-crit": 3,
	"high-cost": 4,
	"price-lower-for-shadow": 0,
	mobile: 5
}

type PowerCost = {
	mp: number,
	energyReq: number,
	eneryMin: number,
}

