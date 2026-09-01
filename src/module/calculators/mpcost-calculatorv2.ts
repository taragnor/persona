import {DAMAGE_LEVELS, DamageLevel} from "../../config/damage-types.js";
import {PowerTag} from "../../config/power-tags.js";
import {BonusCalculation} from "../bonus-calc.js";
import {localize} from "../persona.js";
import {CostCalculator} from "./cost-calculator.js";

export class MPCostCalculatorV2 extends CostCalculator {
  static calcBaseMPCost (pwr: Power) : BonusCalculation {
    const calc=  pwr.getBonusesV2("mp-cost", null);
    const functions = [
      "_damage",
      "_targetsAndAoE",
      "mpCost_buffOrDebuff",
      "mpCost_instantKill",
      "mpCost_multiattack",
      "mpCost_dekaja",
      "mpCost_ailment",
      "mpCost_tags",

    ] as const;
    for (const fn of functions) {
      this[fn](pwr, calc);
    }
    return calc;
  }

  private static _damage(pwr: Power, calc : BonusCalculation) : void {
    const baselevel = pwr.system.damageLevel;
    if (baselevel == "none" || baselevel == "fixed") {return;}
    // const baseCost = this.BASE_MP_COSTS["directDamage"];
    const levelMult = this.DAMAGE_LEVEL_MULTIPLIERS_MP[baselevel] ;
    const baseCost = Math.round(this.DAMAGE_LEVEL_BASE_COST_MP[baselevel] / levelMult);
    // const cost = baseCost * levelMult;
    const dmgLevel = localize(DAMAGE_LEVELS[baselevel]);
    calc.add(0, baseCost, `${dmgLevel} Damage`);
    calc.mult(1, levelMult, `${dmgLevel} Damage`);
    // if (pwr.isAoE()) {
    //   cost *= 1.5;
    //   cost += 4;
    // }
  }

  private static _targetsAndAoE(pwr: Power, calc: BonusCalculation) : void {
    if (pwr.isAoE()) {
      calc.mult(1, 2, "AoE Multiplier");
    }
    switch (pwr.targets()) {
      case "1-random-enemy":
      case "each-attack-random-enemy":
        calc.mult(1, 0.75, "Random Targets");
        break;
    }
  }

  static mpCost_buffOrDebuff(pwr: Power, calc: BonusCalculation) : void {
    const buffsGranted=  pwr.addsStatus(["attack-boost", "damage-boost", "defense-boost", "attack-nerf", "damage-nerf", "defense-nerf"], true);
    if (buffsGranted == 0) {return;}
    const baseCost = buffsGranted * 8;
    // if (buffsGranted >= 3) {baseCost += 6;}
    calc.add(0, baseCost, `Buff/Debuff`);
    if (pwr.isAoE()) {
      calc.mult(1, 1.5, "AoE Buff");
    }
  }

  static mpCost_instantKill(pwr: Power, calc: BonusCalculation): void {
    if (!pwr.canInstantKill()) {return;}
    const mult = this.INSTANT_KILL_LEVELS_MULT[pwr.system.instantKillChance];
    const INSTANT_KILL_BASE_COST = 8;
    // const cost =  mult * INSTANT_KILL_BASE_COST;
    calc.add(0, INSTANT_KILL_BASE_COST, `Instant Kill ${pwr.system.instantKillChance}`);
    calc.mult(1, mult, `Instant Kill multiplier ${pwr.system.instantKillChance}`);

		// if (pwr.isAoE()) {
		// 	cost *= 2.25;
		// 	cost += 0;
		// }
	}

  static mpCost_multiattack(pwr: Power, calc: BonusCalculation) : void{
    if (pwr.system.attacksMax == 1) {return;}
    const min = pwr.system.attacksMin;
    const max = pwr.system.attacksMax;
    const maxAdd =  0.4 * (max -1);
    const minAdd = 0.4 * (min -1);
    const costMod = 1 + maxAdd + minAdd;
    calc.mult(1, costMod, `Flurry of Attacks Multiplier ${min}-${max}`);
  }

	static mpCost_dekaja(pwr: Power, calc: BonusCalculation) : void{
		const buffsRemoved = pwr.removesStatus(["attack-nerf", "damage-nerf", "defense-nerf"]);
    if (buffsRemoved == 0) {return;}
    const dekajaFormula = 1 + (buffsRemoved * 3);
    calc.add(0, dekajaFormula , "Buff Removal");
	}

	private static mpCost_ailment(pwr: Power, calc: BonusCalculation) : void {
		if (!pwr.causesAilment()) {return;}
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
				return;
			default:
				pwr.system.ailmentChance satisfies never;
				return;
		}
		// if (pwr.isAoE()) {
		// 	add += 6;
		// }
    calc.mult(1, mult, `${pwr.system.ailmentChance} Ailment Chance`);
    calc.mult(0, add, `${pwr.system.ailmentChance} Ailment Chance`);
	}

	private static mpCost_tags(pwr: Power, calc: BonusCalculation) : void {
		const tags = pwr.tagList(null);
		for (const x of tags) {
			const tagName = (typeof x == "string" ? x : x.system.linkedInternalTag);
			const modMult = this.TAG_ADJUST_MP_MULT[tagName as keyof typeof this.TAG_ADJUST_MP_MULT];
			if (modMult == undefined) {continue;}
      calc.mult(1, modMult, `${tagName}`);
		}
	}


	static TAG_ADJUST_MP_MULT : Partial<Record<Exclude<PowerTag, Tag>, number>> = {
		"half-on-miss": 1.1,
		"high-crit":1.25,
		"accurate": 1.15,
		"inaccurate": 0.80,
	};

	static BASE_MP_COSTS = {
		"directDamage": 4,
	} as const;

	static DAMAGE_LEVEL_MULTIPLIERS_MP : Record<DamageLevel, number>  = {
		none: 1,
		"-": 0,
		fixed: 1,
		miniscule: 0.5,
		basic: 0.25,
		light: 1,
		medium: 2,
		heavy: 3,
		severe: 4,
		colossal: 5,
	};

  static DAMAGE_LEVEL_BASE_COST_MP : Record<DamageLevel, number> = {
		none: 1,
		"-": 0,
    fixed: 0,
    miniscule: 2,
    basic: 1,
    light: 6,
    medium: 12,
    heavy: 18,
    severe: 30,
    colossal: 62,
  };

}
