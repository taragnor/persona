import {DamageLevel, DamageType, RealDamageType} from "../../config/damage-types.js";
import {PowerType} from "../../config/effect-types.js";
import {ItemSubtype, Power, Usable} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {DamageCalculation} from "./damage-calc.js";

export abstract class DamageSystemBase implements DamageInterface {

	getDamage(power: Usable, attackerPersona: Persona, situation ?: Situation, typeOverride?: DamageType) : DamageCalculation {
		if (! situation) {
			situation = {
				user: attackerPersona.user.accessor ,
				usedPower: power.accessor,
				hit: true,
				attacker: attackerPersona.user.accessor
			};
		}
		if (!typeOverride || typeOverride == 'by-power') {
			if (power.system.dmg_type == 'none') {
				return new DamageCalculation('none');
			}
		}
		if (power.isPower() && power.system.damageLevel == 'none') {
			return new DamageCalculation('none');
		}
		const subtype : PowerType = power.isPower() ? power.system.subtype : 'standalone';
		switch(subtype) {
			case 'weapon' : {
				return this.getWeaponSkillDamage(power as ItemSubtype<Power, 'weapon'>, attackerPersona, situation);
			}
			case 'magic': {
				return this.getMagicSkillDamage(power  as ItemSubtype<Power, 'magic'>, attackerPersona, situation);
			}
			case 'standalone': {
				return this.getStandaloneDamage(power, typeOverride);
			}
			default:
				return new DamageCalculation('none');
		}
	}

	abstract applyDR(calc: DamageCalculation, damageType: RealDamageType, power: Usable, targetPersona: Persona) : DamageCalculation;

	abstract getWeaponSkillDamage(power: ItemSubtype<Power, 'weapon'>, userPersona: Persona, situation: Situation) : DamageCalculation ;

abstract	getMagicSkillDamage(power: ItemSubtype<Power, 'magic'>, userPersona: Persona, situation: Situation) : DamageCalculation ;

	getStandaloneDamage(power: Usable, damageTypeOverride?: DamageType) : DamageCalculation {
		const dmg = power.system.damage;
		const baseDtype = damageTypeOverride || power.system.dmg_type;
		const dtype = baseDtype == 'by-power' ? 'untyped' : baseDtype;
		const calc = new DamageCalculation(dtype);
		calc.add('base', dmg.low, `${power.displayedName.toString()} base damage`);
		calc.add('evenBonus', dmg.high - dmg.low, `${power.displayedName.toString()} Even Bonus Damage`);
		return calc;
	}

	convertFromOldLowDamageToNewBase(low: number) : number {
		return this.getWeaponDamageByWpnLevel(low-1);
	}

	 abstract getWeaponDamageByWpnLevel(lvl: number) : number;
	abstract getArmorDRByArmorLevel(lvl: number) : number;

}


export interface DamageInterface {
	getDamage(power: Usable,attackerPersona: Persona, situation ?: Situation, overrideDamageType ?: DamageType) : DamageCalculation;
	applyDR(calc: DamageCalculation, damageType: RealDamageType, power: Usable, targetPersona: Persona) : DamageCalculation;
	convertFromOldLowDamageToNewBase(lowDmg: number): number;
	getWeaponDamageByWpnLevel(lvl: number) : number;
	getArmorDRByArmorLevel(lvl: number) : number;
}

// const DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE = {
// 	"none": {extraVariance: 0, baseAmt: 0},
// 	"miniscule": {extraVariance: 0, baseAmt: 0},
// 	"basic": {extraVariance: 0, baseAmt: 0},
// 	"light": {extraVariance: 1, baseAmt: 10},
// 	"medium": {extraVariance: 2, baseAmt: 30},
// 	"heavy": {extraVariance: 2, baseAmt: 60},
// 	"severe": {extraVariance: 3, baseAmt: 95},
// 	"colossal": {extraVariance: 4, baseAmt: 140},
// } as const satisfies Readonly<Record< ConvertableDamageLevel, NewDamageParams>>;

// const DAMAGE_LEVEL_CONVERT_WEAPON = {
// 	"none": {extraVariance: 0, baseAmt: 0},
// 	"miniscule": {extraVariance: 0, baseAmt: 0},
// 	"basic": {extraVariance: 0, baseAmt: 0},
// 	"light": {extraVariance: 1, baseAmt: 10},
// 	"medium": {extraVariance: 2, baseAmt: 30},
// 	"heavy": {extraVariance: 2, baseAmt: 60},
// 	"severe": {extraVariance: 3, baseAmt: 95},
// 	"colossal": {extraVariance: 4, baseAmt: 140},
// } as const satisfies Readonly<Record<ConvertableDamageLevel, NewDamageParams>> ;

//formual start at 6, then to get further levels , add (newlvl+1) to previous value
// const WEAPON_LEVEL_TO_DAMAGE: Record<number, number> = {
// 	0: 10,
// 	1: 14,
// 	2: 18,
// 	3: 24,
// 	4: 32,
// 	5: 42,
// 	6: 54,
// 	7: 68,
// 	8: 84,
// 	9: 102,
// 	10: 122,
// 	11: 144,
// 	12: 168,
// };


export type ConvertableDamageLevel = Exclude<DamageLevel, "-" | "fixed">;

export type NewDamageParams = {
	baseAmt: number,
	extraVariance: number,
};

