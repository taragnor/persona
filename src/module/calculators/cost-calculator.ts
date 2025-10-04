import {DamageType} from "../../config/damage-types.js";
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

	static INSTANT_KILL_LEVELS_MULT : Record<InstantKillLevel, number> = {
		none: 0,
		low: 1,
		medium: 1.875,
		high: 2.5,
		always: 4,
	};

	static s(mult: number) : CostModifier {
		return {mult, add:0};
	}

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

}


export type CostModifier = {mult: number, add:number};

