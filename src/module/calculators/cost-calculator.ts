import {NonDeprecatedConsequence} from "../../config/consequence-types.js";
import {DamageType} from "../../config/damage-types.js";
import {StatusEffectId} from "../../config/status-effects.js";
import {StatusDuration} from "../active-effect.js";
import {InstantKillLevel} from "../combat/damage-calc.js";
export abstract class CostCalculator {

	static combineModifiers (this: void, mods: CostModifier[]) : number {
		const base : CostModifier = {
			mult: 1,
			add: 0
		};
		const subtotal = mods.reduce( (a,cm) => {
			a.add += cm.add;
			a.mult *= cm.mult;
			return a;
		}, base);
		return subtotal.add * subtotal.mult;
	}

	static durationFactor(pwr: Power, st: StatusEffectId): number | StatusDuration["dtype"] {
		for (const eff of pwr.getEffects(null)) {
			const statusAdd=  eff.consequences
				.find( cons=> cons.type == "combat-effect" && cons.combatEffect == "addStatus" && cons.statusName == st) as (NonDeprecatedConsequence & {type: "combat-effect", combatEffect : "addStatus"});
			if (!statusAdd) {continue;}
			switch (statusAdd.statusDuration) {
				case "X-rounds":
					return statusAdd.amount ?? 3;
				case "3-rounds":
						return 3;
				case "UEoT":
				case "UEoNT":
				case "USoNT":
					return 1;
				case "save-normal":
				case "save-easy":
				case "save-hard":
				case "presave-easy":
				case "presave-normal":
				case "presave-hard":
					return "save";
				default:
					return statusAdd.statusDuration;
			}
		}
		return 0;
	}

	/**generate a simple multiplier only*/
	static s(mult: number) : CostModifier {
		return {mult, add:0};
	}

	/**generate a simple add only only*/
	static i(add: number) : CostModifier {
		return {mult: 1, add};
	}

	static DAMAGE_TYPE_MODIFIER : Record<DamageType, CostModifier> = {
		none: this.s(0),
		fire: this.s(1),
		wind: this.s(0.75),
		light: this.s(1),
		dark: this.s(1),
		physical: this.s(1),
		gun: this.s(1),
		healing: this.s(1),
		cold: this.s(1),
		lightning: this.s(1),
		untyped: {mult: 1, add: 0},
		"all-out": this.s(0),
		"by-power": this.s(1),
	};

	static INSTANT_KILL_LEVELS_MULT : Record<InstantKillLevel, number> = {
		none: 0,
		low: 1,
		medium: 1.875,
		high: 2.5,
		always: 4,
	};


}


export type CostModifier = {mult: number, add:number};

