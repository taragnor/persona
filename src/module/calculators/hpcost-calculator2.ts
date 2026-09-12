import {DamageLevel} from "../../config/damage-types.js";
import {PowerTag} from "../../config/power-tags.js";
import {BonusCalculation} from "../bonus-calc.js";
import {CostCalculator} from "./cost-calculator.js";

export class HPCostCalculatorV2 extends CostCalculator {
  static calcBaseCost (pwr: Power) : BonusCalculation {
    if (!pwr.isWeaponSkill() || !pwr.isPower()) {return this.nullCost();}
    if (pwr.isTeamwork()) {return this.nullCost();}
    if (pwr.customCost) {return this.customCost(pwr.system.hpcost);}
    const calc = pwr.getBonusesV2("hp-cost", null);
    const functions = [
      "_damage",
      "_targetsAndAoE",
      "_buffOrDebuff",
      "_instantKill",
      "_multiattack",
      "_ailment",
      "_tags",
			// "mpcost_shields",
      // "status_removal",
    ] as const;
    for (const fn of functions) {
      this[fn](pwr, calc);
    }
    return calc;
  }

  private static nullCost() : BonusCalculation {
    const calc= new BonusCalculation("hp-cost");
    calc.mult(1, 0, "null cost");
    return calc;
  }

  private static customCost(cost: number) : BonusCalculation {
    const calc= new BonusCalculation("hp-cost");
    calc.set(1, cost, "custom cost");
    return calc;

  }

  private static _damage(pwr: Power, calc: BonusCalculation) : void {
    const baselevel = pwr.system.damageLevel;
    if (baselevel == "none" || baselevel == "fixed") {return;}
    const baseLevel = 1;
    const levelMult = this.DAMAGE_LEVEL_MULTIPLIERS_HP[baselevel];
    const cost = baseLevel + (4 * levelMult);
    calc.add(0, cost, `Damage Level ${baselevel}`);
  }

  static _buffOrDebuff(pwr: Power, calc: BonusCalculation) : void {
    const buffsGranted=  pwr.addsStatus(["attack-boost", "damage-boost", "defense-boost", "attack-nerf", "damage-nerf", "defense-nerf"], true);
    if (buffsGranted == 0) {return;}
    const valueOfEachBuffAdded = this.BASE_HP_COSTS["buff"];
    const baseCost = buffsGranted * valueOfEachBuffAdded;
    calc.add(0, baseCost, `Buff/Debuff (${buffsGranted})`);
  }

  private static _targetsAndAoE(pwr: Power, calc: BonusCalculation) : void {
    if (pwr.isAoE()) {
      calc.mult(0, 1.5, "AoE Multiplier");
    }
    switch (pwr.targets()) {
      case "1-random-enemy":
      case "each-attack-random-enemy":
        calc.mult(0, 0.75, "Random Targets");
        break;
    }
  }

  static _instantKill(pwr: Power, calc: BonusCalculation): void {
    if (!pwr.canInstantKill()) {return;}
    switch (pwr.system.instantKillChance) {
      case "low":
        calc.add(0, 5, `Instant Kill (${pwr.system.instantKillChance})`);
        calc.mult(0, 1.1, `Instant Kill (${pwr.system.instantKillChance})`);
        break;
      case "medium":
        calc.add(0, 7, `Instant Kill (${pwr.system.instantKillChance})`);
        calc.mult(0, 1.2, `Instant Kill (${pwr.system.instantKillChance})`);
        // return {mult: 1.2, add: 8};
        break;
      case "high":
        calc.add(0, 11, `Instant Kill (${pwr.system.instantKillChance})`);
        calc.mult(0, 1.3, `Instant Kill (${pwr.system.instantKillChance})`);
        // return {mult: 1.3, add: 11};
        break;
      case "always":
        calc.add(0, 14, `Instant Kill (${pwr.system.instantKillChance})`);
        calc.mult(0, 1.4, `Instant Kill (${pwr.system.instantKillChance})`);
        // return {mult: 1.4, add: 14};
        break;
    }
    if (pwr.isFlurryPower()) {
      calc.mult(0, 0.75, `Flurry Instant-kill Modifier`);
    }
  }

  private static _multiattack(pwr: Power, calc: BonusCalculation) : void {
    if (pwr.system.attacksMax == 1) {return;}
    const min = pwr.system.attacksMin;
    const max = pwr.system.attacksMax;
    const maxAdd =  this.HPCOST_MULTIATTACKMULT * (max -1);
    const minAdd = this.HPCOST_MULTIATTACKMULT * (min -1);
    // const maxAdd =  0.4 * (max -1);
    // const minAdd = 0.4 * (min -1);
    const costMod = 1 + maxAdd + minAdd;
    calc.add(0, costMod, `Flurry of Attacks Multiplier ${min}-${max}`);
  }

	private static _ailment(pwr: Power, calc: BonusCalculation) : void {
		if (!pwr.causesAilment()) {return;}
		let add = 0;
		switch (pwr.system.ailmentChance) {
			case "low":
				add += 2;
				break;
			case "medium":
				add += 4;
				break;
			case "high":
				add += 6;
				break;
			case "always":
				add += 8;
				break;
			case "none":
				return;
			default:
				pwr.system.ailmentChance satisfies never;
				return;
		}
    calc.add(0, add, `Ailment ${pwr.system.ailmentChance}`);
	}

	private static _tags(pwr: Power, calc: BonusCalculation) : void {
		const tags = pwr.tagList(null);
		for (const x of tags) {
			const tagName = (typeof x == "string" ? x : x.system.linkedInternalTag);
			const modMult = this.TAG_ADJUST[tagName as keyof typeof this.TAG_ADJUST];
			if (modMult == undefined) {continue;}
      calc.add(0, modMult, `${tagName}`);
		}
	}

	private static TAG_ADJUST : Partial<Record<Exclude<PowerTag, Tag>, number>> = {
  inaccurate: -3,
  accurate: 3,
  "high-crit": 3,
  "high-cost": 4,
  "price-lower-for-shadow": 0,
  mobile: 5,
  "half-on-miss": 3,
	};

  private static DAMAGE_LEVEL_MULTIPLIERS_HP : Record<DamageLevel, number>  = {
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

	private static BASE_HP_COSTS = {
		"directDamage": 1,
    "instantKill": 2,
    "buff": 1,
	} as const;

  static HPCOST_MULTIATTACKMULT = 3 as const;

}
