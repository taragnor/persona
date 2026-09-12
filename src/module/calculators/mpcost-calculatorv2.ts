import {DAMAGE_LEVELS, DamageLevel} from "../../config/damage-types.js";
import {PowerTag} from "../../config/power-tags.js";
import {STATUS_AILMENT_LIST} from "../../config/status-effects.js";
import {BonusCalculation} from "../bonus-calc.js";
import {localize} from "../persona.js";
import {CostCalculator} from "./cost-calculator.js";

export class MPCostCalculatorV2 extends CostCalculator {
  static calcBaseMPCost (pwr: Power) : BonusCalculation {
    const calc = pwr.getBonusesV2("mp-cost", null);
    const functions = [
      "_damage",
      "_targetsAndAoE",
      "mpCost_buffOrDebuff",
      "mpCost_instantKill",
      "mpCost_multiattack",
      "mpCost_dekaja",
      "mpCost_ailment",
      "mpCost_tags",
			"mpcost_shields",
      "status_removal",
    ] as const;
    for (const fn of functions) {
      this[fn](pwr, calc);
    }
    return calc;
  }

  private static _damage(pwr: Power, calc : BonusCalculation) : void {
    const baselevel = pwr.system.damageLevel;
    if (baselevel == "none" || baselevel == "fixed") {return;}
    const baseCost = Math.round(this.DAMAGE_LEVEL_BASE_COST_MP[baselevel]) - 1;
    const dmgLevel = localize(DAMAGE_LEVELS[baselevel]);
    calc.add(0, baseCost, `${dmgLevel} Damage`);
  }

  private static _targetsAndAoE(pwr: Power, calc: BonusCalculation) : void {
    if (pwr.isAoE()) {
      calc.mult(0, 2, "AoE Multiplier");
    }
    switch (pwr.targets()) {
      case "1-random-enemy":
      case "each-attack-random-enemy":
        calc.mult(0, 0.75, "Random Targets");
        break;
    }
  }

  private static mpCost_buffOrDebuff(pwr: Power, calc: BonusCalculation) : void {
    const buffsGranted=  pwr.addsStatus(["attack-boost", "damage-boost", "defense-boost", "attack-nerf", "damage-nerf", "defense-nerf"], true);
    if (buffsGranted == 0) {return;}
    const valueOfEachBuffAdded = this.BASE_MP_COSTS["buff"];
    const baseCost = buffsGranted * valueOfEachBuffAdded;
    const scaling = Math.pow(1.125, buffsGranted - 1);
    const trueBaseCost = (baseCost * scaling) - 1;
    if (pwr.isAoE()) {
      calc.add(0, trueBaseCost * 1.2, `Buff/Debuff (AoE)`);
      calc.mult(0, 1.25, "AoE Buff General Multiplier");
    } else {
      calc.add(0, trueBaseCost, `Buff/Debuff (single target)`);
    }
  }

  private static status_removal(pwr: Power, calc: BonusCalculation)  : void {
    const statusesRemoved = pwr.removesStatus(STATUS_AILMENT_LIST);
    if (statusesRemoved == 0) {return;}
    const scaling = Math.pow(1.2, statusesRemoved /3);
    const amt = statusesRemoved * scaling;
    calc.add(0, amt, `Ailment Removal (${statusesRemoved})`);
  }

  private static mpCost_instantKill(pwr: Power, calc: BonusCalculation): void {
    if (!pwr.canInstantKill()) {return;}
    const instantKillGeneralMultAoE = 1.35 as const;
    const instantKillGeneralMult = 1.2 as const;
    const baseMult = this.INSTANT_KILL_LEVELS_MULT[pwr.system.instantKillChance] / instantKillGeneralMult;
    const INSTANT_KILL_BASE_COST = (this.BASE_MP_COSTS.instantKill) * baseMult;
    calc.add(0, INSTANT_KILL_BASE_COST - 1, `Instant Kill ${pwr.system.instantKillChance}`);
    if (pwr.isAoE()) {
      calc.mult(0, instantKillGeneralMultAoE, "Instant kill mult (AoE)");
    } else {
      calc.mult(0, instantKillGeneralMult, "Instant kill mult (non-AoE)");
    }
    if (pwr.isFlurryPower()) {
      calc.mult(0, 0.75, `Flurry Instant-kill Modifier`);
    }
  }

  private static mpCost_multiattack(pwr: Power, calc: BonusCalculation) : void {
    if (pwr.system.attacksMax == 1) {return;}
    const min = pwr.system.attacksMin;
    const max = pwr.system.attacksMax;
    const maxAdd =  0.4 * (max -1);
    const minAdd = 0.4 * (min -1);
    const costMod = 1 + maxAdd + minAdd;
    calc.mult(0, costMod, `Flurry of Attacks Multiplier ${min}-${max}`);
  }

	private static mpCost_dekaja(pwr: Power, calc: BonusCalculation) : void {
		const buffsRemoved = pwr.removesStatus(["attack-nerf", "damage-nerf", "defense-nerf", "attack-boost", "defense-boost", "damage-boost"]);
    if (buffsRemoved == 0) {return;}
    const dekajaFormula = 1 + (buffsRemoved * 2);
    calc.add(0, dekajaFormula , "Buff Removal");
	}

	private static mpCost_ailment(pwr: Power, calc: BonusCalculation) : void {
		if (!pwr.causesAilment()) {return;}
		let mult = 1, add = 0;
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
    calc.mult(0, mult, `${pwr.system.ailmentChance} Ailment Chance`);
    calc.add(0, add, `${pwr.system.ailmentChance} Ailment Chance`);
	}

	private static mpCost_tags(pwr: Power, calc: BonusCalculation) : void {
		const tags = pwr.tagList(null);
		for (const x of tags) {
			const tagName = (typeof x == "string" ? x : x.system.linkedInternalTag);
			const modMult = this.TAG_ADJUST_MP_MULT[tagName as keyof typeof this.TAG_ADJUST_MP_MULT];
			if (modMult == undefined) {continue;}
      calc.mult(0, modMult, `${tagName}`);
		}
	}

	private static mpcost_shields(pwr: Power, calc: BonusCalculation) : void {
		const shields= pwr.addsStatus(["magic-shield", "phys-shield"]);
		if (shields < 1) {return ;}
		const duration = this.durationFactor(pwr, "magic-shield") || this.durationFactor(pwr, "phys-shield");
		const durationFactor = typeof duration == "number" ? duration : 1.5;
		const baseCost = (shields >= 2 ? 1.5 : 1) * 24 * Math.min(1.5, durationFactor);
    calc.add(0, baseCost, "shielding power");
		if (pwr.isAoE()) {
      calc.mult(0, 1.5, "AoE shielding");
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
    "instantKill": 8,
    "buff": 8,
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

	// static override INSTANT_KILL_LEVELS_MULT : Record<InstantKillLevel, number> = {
	// 	none: 0,
	// 	low: 1,
	// 	medium: 1.5,
	// 	high: 2,
	// 	always: 3,
	// };

}
