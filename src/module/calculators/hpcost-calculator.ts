import {DamageLevel} from "../../config/damage-types.js";
import {PowerTag} from "../../config/power-tags.js";
import {CostCalculator, CostModifier} from "./cost-calculator.js";

export class HPCostCalculator extends CostCalculator {

	static calcHPPercentCost(pwr: Power) : number {
		if (pwr.isBasicPower()) {return 0;}
		const mods : CostModifier[] = [
			this.hpCost_damage(pwr),
			this.tagAdjust(pwr),
			this.hpCost_instantKill(pwr),
			this.hpCost_ailment(pwr),
			this.hpCost_multiattack(pwr),
			this.hpCost_buffOrDebuff(pwr),
			this.#modifiers(pwr),
		];
		return Math.round(this.combineModifiers(mods));
	}

  static tagAdjust(pwr: Power) : CostModifier {
    let total = 0;
    for (const tag of pwr.tagList(null)) {
		 const tagName = (typeof tag == "string" ? tag : tag.system.linkedInternalTag);
      total += TAG_ADJUST_HP[tagName as keyof typeof TAG_ADJUST_HP] ?? 0;
    }
    return this.i(total);
  }

	static #modifiers(pwr: Power) : CostModifier {
		const situation: Situation = {
			usedPower: pwr.accessor,
		};
		const mod = pwr.getBonuses("power-hp-cost").total(situation);
		return this.i(mod);
	}

  static hpCost_multiattack(pwr: Power) :CostModifier {
    if (pwr.system.attacksMax == 1) {return this.i(0);}
    const min = pwr.system.attacksMin;
    const max = pwr.system.attacksMax;
    const maxAdd =  3 * (max -1);
    const minAdd = 3 * (min -1);
    const costMod : CostModifier = {
      mult: 1,
      add: 1 + Math.round(maxAdd + minAdd),
    };
    return costMod;
  }

  static hpCost_ailment(pwr: Power) : CostModifier {
    switch (pwr.system.ailmentChance) {
      case "none":
        return this.i(0);
      case "low":
        return this.i(2);
      case "medium":
        return this.i(4);
      case "high":
        return this.i(6);
      case "always":
        return this.i(8);
    }
  }

  static hpCost_damage(pwr: Power) : CostModifier { 
    const baselevel = pwr.system.damageLevel;
    if (baselevel == "none") {return this.i(0);}
    const baseLevel = 1;
    const levelMult = DAMAGE_LEVEL_MULTIPLIERS_HP[baselevel];
    let cost = baseLevel + (4 * levelMult);
    if (pwr.isAoE()) {
      cost = cost * 1.5;
    }
    return this.i(cost);
  }

  static hpCost_instantKill(pwr: Power) : CostModifier {
    if (pwr.system.instantKillChance == "none") {return this.i(0);}
    switch (pwr.system.instantKillChance) {
      case "low":
        return {mult: 1.1, add: 2};
      case "medium":
        return {mult: 1.5, add: 3};
      case "high":
        return {mult: 2, add: 5};
      case "always":
        return {mult: 3, add: 10};
    }
  }

	static hpCost_buffOrDebuff(pwr: Power) : CostModifier {
		const buffsGranted=  pwr.addsStatus(["attack-boost", "damage-boost", "defense-boost", "attack-nerf", "damage-nerf", "defense-nerf"]);
		const baseCost = buffsGranted * 3;
		// if (buffsGranted >= 3) {baseCost += 6;}
		// if (pwr.isAoE()) {
		// 	baseCost *= 3;
		// }
		return this.i(baseCost);
	}


}

const DAMAGE_LEVEL_MULTIPLIERS_HP : Record<DamageLevel, number>  = {
  none: 0,
  "-": 0,
  fixed: 0,
  miniscule: 0.25,
  basic: 0.75,
  light: 1,
  medium: 2,
  heavy: 3,
  severe: 4,
  colossal: 5
};

const TAG_ADJUST_HP : Partial<Record<Exclude<PowerTag, Tag>, number>> = {
  inaccurate: -3,
  accurate: 3,
  "high-crit": 3,
  "high-cost": 4,
  "price-lower-for-shadow": 0,
  mobile: 5,
  "half-on-miss": 3,
  "pierce": 5,
};

