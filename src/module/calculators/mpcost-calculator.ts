import {DamageLevel} from "../../config/damage-types.js";
import {PowerTag} from "../../config/power-tags.js";
import {Power, Tag} from "../item/persona-item.js";
import {CostCalculator, CostModifier} from "./cost-calculator.js";

export class MPCostCalculator extends CostCalculator {

	static calcMPCost(pwr: Power) : number {
		const mods =  [
			this.mpCost_damagePower(pwr),
			this.mpCost_instantKill(pwr),
			this.mpCost_buffOrDebuff(pwr),
			this.mpCost_ailment(pwr),
			this.mpCost_dekaja(pwr),
			// this.statusRemoval(pwr),
			this.#mpCost_tags(pwr),
			this.mpCost_multiattack(pwr),
		];
		return Math.round(this.combineModifiers(mods));
	}

	static mpCost_damagePower(pwr : Power) : CostModifier {
		const baselevel = pwr.system.damageLevel;
		if (baselevel == "none") {return this.i(0);}
		const baseCost = this.BASE_MP_COSTS["directDamage"];
		const levelMult = this.DAMAGE_LEVEL_MULTIPLIERS_MP[baselevel];
		const dmgType = pwr.system.dmg_type;
		let cost = baseCost * levelMult;
		{
			const {mult, add} = this.DAMAGE_TYPE_MODIFIER[dmgType];
			cost = cost * mult + add;
		}
		if (pwr.isAoE()) {
			cost *= 1.5;
			cost += 4;
		}
		return this.i(cost);
	}

	static mpCost_dekaja(pwr: Power) : CostModifier {
		const buffsRemoved = pwr.removesStatus(["attack-nerf", "damage-nerf", "defense-nerf"]);
		if (buffsRemoved >= 3) {
			return this.i(10);
		}
		return this.i(0);
	}

	static mpCost_ailment(pwr: Power) : CostModifier {
		if (!pwr.causesAilment()) {return this.i(0);}
		let mult = 1;
		let add = 0;
		switch (pwr.system.ailmentChance) {
			case "low":
				mult *= 1.1;
				add += 1;
				break;
			case "medium":
				mult *= 1.3333;
				add += 2;
				break;
			case "high":
				mult *= 1.6666;
				add += 3;
				break;
			case "always":
				mult *= 2.0;
				add += 3;
				break;
			case "none":
				return this.i(0);
			default:
				pwr.system.ailmentChance satisfies never;
				return this.i(0);
		}
		if (pwr.isAoE()) {
			add += 6;
		}
		return {add, mult};
	}

	static mpCost_buffOrDebuff(pwr: Power) : CostModifier {
		const buffsGranted=  pwr.addsStatus(["attack-boost", "damage-boost", "defense-boost", "attack-nerf", "damage-nerf", "defense-nerf"]);
		let baseCost = buffsGranted * 8;
		if (buffsGranted >= 3) {baseCost += 6;}
		if (pwr.isAoE()) {
			baseCost *= 3;
		}
		return this.i(baseCost);
	}

	static mpCost_instantKill(pwr: Power): CostModifier {
		if (!pwr.canInstantKill()) {return this.i(0);}
		const mult = this.INSTANT_KILL_LEVELS_MULT[pwr.system.instantKillChance];
		const INSTANT_KILL_BASE_COST = 8;
		let cost =  mult * INSTANT_KILL_BASE_COST;
		if (pwr.isAoE()) {
			cost *= 2.25;
			cost += 0;
		}
		return this.i(cost);
	}

  static mpCost_multiattack(pwr: Power) :CostModifier {
    if (pwr.system.attacksMax == 1) {return this.i(0);}
    const min = pwr.system.attacksMin;
    const max = pwr.system.attacksMax;
    const maxAdd =  0.666 * (max -1);
    const minAdd = 0.666 * (min -1);
    const costMod : CostModifier = {
      mult: 1 + maxAdd + minAdd,
      add: 1 + Math.round(maxAdd + minAdd),
    };
    return costMod;
  }

	static #mpCost_tags(pwr: Power) : CostModifier {
		let mult = 1;
		const tags = pwr.tagList();
		for (const x of tags) {
			const tagName = (typeof x == "string" ? x : x.system.linkedInternalTag);
			const modMult = this.TAG_ADJUST_MP_MULT[tagName as keyof typeof this.TAG_ADJUST_MP_MULT];
			if (modMult == undefined) {continue;}
			mult *= modMult;
		}
		return {
			add: 0,
			mult
		};
	}

	static TAG_ADJUST_MP_MULT : Partial<Record<Exclude<PowerTag, Tag>, number>> = {
		"half-on-miss": 1.1,
		"pierce": 1.5,
		"high-crit":1.25,
		"accurate": 1.10,
		"inaccurate": 0.90,
	};

	static DAMAGE_LEVEL_MULTIPLIERS_MP : Record<DamageLevel, number>  = {
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

	static BASE_MP_COSTS = {
		"directDamage": 4,
	} as const;

}


