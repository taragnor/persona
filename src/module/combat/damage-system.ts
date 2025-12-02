import {DamageLevel, DamageType} from "../../config/damage-types.js";
import {PowerType} from "../../config/effect-types.js";
import {ItemSubtype, Power, Usable} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaError} from "../persona-error.js";
import {Calculation} from "../utility/calculation.js";
import {DamageCalculation} from "./damage-calc.js";

export class DamageSystem implements DamageInterface {
	WEAPON_DAMAGE_MULT = 1.75 as const;
	MAGIC_DAMAGE_MULT = 1.75 as const;
	BASE_VARIANCE = 2 as const;

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

	getWeaponSkillDamage(power: ItemSubtype<Power, 'weapon'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const dtype = power.getDamageType(userPersona);
		const calc = new DamageCalculation(dtype);
		const str = this.strDamageBonus(userPersona);
		const weaponDmg = userPersona.wpnDamage();
		const skillDamage = this.weaponSkillDamage(power);
		const bonusDamage = userPersona.getBonusWpnDamage().total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const strRes = str.eval(situation);
		calc.add('base', strRes.total, `${userPersona.publicName} Strength (${strRes.steps.join(" ,")})`);
		const weaponName = userPersona.user.isShadow() ? 'Unarmed Shadow Damage' : (userPersona.user.weapon?.displayedName ?? 'Unarmed');
		calc.add('base', weaponDmg.baseAmt, weaponName.toString());
		calc.add('base', skillDamage.baseAmt, `${power.displayedName.toString()} Power Bonus`);
		calc.add('base', bonusDamage, 'Bonus Damage');
		const variance  = (this.BASE_VARIANCE + weaponDmg.extraVariance + skillDamage.extraVariance + bonusVariance );
		const varianceMult = userPersona.combatStats.getPhysicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		calc.setMinValue(1);
		return calc ;
	}

	getMagicSkillDamage(power: ItemSubtype<Power, 'magic'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const persona = userPersona;
		const magicDmg = this.magDamageBonus(userPersona);
		const skillDamage = this.magicSkillDamage(power);
		const damageBonus = persona.getBonuses('magDmg').total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const dtype = power.getDamageType(userPersona);
		const calc= new DamageCalculation(dtype);
		const resMag = magicDmg.eval(situation);
		calc.add('base', resMag.total, `${userPersona.publicName} Magic (${resMag.steps.join(" ,")})`, );
		calc.add('base', skillDamage.baseAmt, `${power.displayedName.toString()} Damage`);
		calc.add('base', damageBonus, 'Bonus Damage');
		const variance  = (this.BASE_VARIANCE + skillDamage.extraVariance + bonusVariance );
		const varianceMult = userPersona.combatStats.getMagicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		calc.setMinValue(1);
		return calc;
	}

	weaponSkillDamage(weaponPower:ItemSubtype<Power, "weapon">) : NewDamageParams {
		switch (weaponPower.system.damageLevel) {
			case "-": //old system
				PersonaError.softFail(`${weaponPower.name} is no longer supported`);
				return {
					extraVariance: weaponPower.system.melee_extra_mult + 1,
					baseAmt: 0
				};
			case "fixed":
				return {
					extraVariance: 0,
					baseAmt: weaponPower.system.damage.low
				};
			default:
				return DAMAGE_LEVEL_CONVERT_WEAPON[weaponPower.system.damageLevel];
		}
	}


	strDamageBonus(persona: Persona) : Calculation {
		const strength = persona.combatStats.strength;
		const calc = new Calculation(0, 2);
		return calc
			.add(0, strength + 0, `${persona.displayedName} Strength`, "add")
			.add(1, this.WEAPON_DAMAGE_MULT, `Weapon Strength Damage Multiplier`, "multiply");
	}

	magDamageBonus(persona: Persona) : Calculation {
		const magic = persona.combatStats.magic;
		const calc = new Calculation(0);
		return calc
			.add(0, magic, `${persona.displayedName} Magic`, "add")
			.add(1, this.MAGIC_DAMAGE_MULT, `Magic Damage Multiplier`, "multiply");
	}

	getStandaloneDamage(power: Usable, damageTypeOverride?: DamageType) : DamageCalculation {
		const dmg = power.system.damage;
		const baseDtype = damageTypeOverride || power.system.dmg_type;
		const dtype = baseDtype == 'by-power' ? 'untyped' : baseDtype;
		const calc = new DamageCalculation(dtype);
		calc.add('base', dmg.low, `${power.displayedName.toString()} base damage`);
		calc.add('evenBonus', dmg.high - dmg.low, `${power.displayedName.toString()} Even Bonus Damage`);
		return calc;
	}

	magicSkillDamage(magic: ItemSubtype<Power, "magic">) : Readonly<NewDamageParams> {
		switch (magic.system.damageLevel) {
			case "-":
				PersonaError.softFail(`${magic.name} is no longer supported (No damagelevel)`);
				return {
					extraVariance: magic.system.mag_mult,
					baseAmt: 0
				};
			case "fixed":
				PersonaError.softFail(`${magic.name} is no longer supported (Fixed damage)`);
				return {
					extraVariance: 0,
					baseAmt: magic.system.damage.low,
				};
			default: {
				const val = DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE[magic.system.damageLevel];
				return val;
			}
		}
	}

}

export const DAMAGE_SYSTEM = new DamageSystem();

export interface DamageInterface {
	getDamage(power: Usable,attackerPersona: Persona, situation ?: Situation, overrideDamageType ?: DamageType) : DamageCalculation;
}

const DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE = {
	"none": {extraVariance: 0, baseAmt: 0},
	"miniscule": {extraVariance: 0, baseAmt: 0},
	"basic": {extraVariance: 0, baseAmt: 0},
	"light": {extraVariance: 1, baseAmt: 10},
	"medium": {extraVariance: 2, baseAmt: 30},
	"heavy": {extraVariance: 2, baseAmt: 60},
	"severe": {extraVariance: 3, baseAmt: 95},
	"colossal": {extraVariance: 4, baseAmt: 140},
} as const satisfies Readonly<Record< ConvertableDamageLevel, NewDamageParams>>;

const DAMAGE_LEVEL_CONVERT_WEAPON = {
	"none": {extraVariance: 0, baseAmt: 0},
	"miniscule": {extraVariance: 0, baseAmt: 0},
	"basic": {extraVariance: 0, baseAmt: 0},
	"light": {extraVariance: 1, baseAmt: 10},
	"medium": {extraVariance: 2, baseAmt: 30},
	"heavy": {extraVariance: 2, baseAmt: 60},
	"severe": {extraVariance: 3, baseAmt: 95},
	"colossal": {extraVariance: 4, baseAmt: 140},
} as const satisfies Readonly<Record<ConvertableDamageLevel, NewDamageParams>> ;


export type ConvertableDamageLevel = Exclude<DamageLevel, "-" | "fixed">;

export type NewDamageParams = {
	baseAmt: number,
	extraVariance: number,
};

