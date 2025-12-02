import {DamageType} from "../../config/damage-types.js";
import {PowerType} from "../../config/effect-types.js";
import {ItemSubtype, Power, Usable} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {Calculation} from "../utility/calculation.js";
import {DamageCalculation, DamageCalculator} from "./damage-calc.js";

export class DamageSystem implements DamageInterface {
	WEAPON_DAMAGE_MULT = 1.75 as const;
	MAGIC_DAMAGE_MULT = 1.75 as const;

	getDamage(power: Usable,attackerPersona: Persona, situation ?: Situation, typeOverride?: DamageType) : DamageCalculation {
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
		const subtype : PowerType  = power.isPower() ? power.system.subtype : 'standalone';
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
		const skillDamage = DamageCalculator.weaponSkillDamage(power);
		const bonusDamage = userPersona.getBonusWpnDamage().total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const strRes = str.eval(situation);
		calc.add('base', strRes.total, `${userPersona.publicName} Strength (${strRes.steps.join(" ,")})`);
		const weaponName = userPersona.user.isShadow() ? 'Unarmed Shadow Damage' : (userPersona.user.weapon?.displayedName ?? 'Unarmed');
		calc.add('base', weaponDmg.baseAmt, weaponName.toString());
		calc.add('base', skillDamage.baseAmt, `${power.displayedName.toString()} Power Bonus`);
		calc.add('base', bonusDamage, 'Bonus Damage');
		const variance  = (DamageCalculator.BASE_VARIANCE + weaponDmg.extraVariance + skillDamage.extraVariance + bonusVariance );
		const varianceMult = userPersona.combatStats.getPhysicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		calc.setMinValue(1);
		return calc ;
	}

	getMagicSkillDamage(power: ItemSubtype<Power, 'magic'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const persona = userPersona;
		const magicDmg = this.magDamageBonus(userPersona);
		const skillDamage = DamageCalculator.magicSkillDamage(power);
		const damageBonus = persona.getBonuses('magDmg').total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const dtype = power.getDamageType(userPersona);
		const calc= new DamageCalculation(dtype);
		const resMag = magicDmg.eval(situation);
		calc.add('base', resMag.total, `${userPersona.publicName} Magic (${resMag.steps.join(" ,")})`, );
		calc.add('base', skillDamage.baseAmt, `${power.displayedName.toString()} Damage`);
		calc.add('base', damageBonus, 'Bonus Damage');
		const variance  = (DamageCalculator.BASE_VARIANCE + skillDamage.extraVariance + bonusVariance );
		const varianceMult = userPersona.combatStats.getMagicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		calc.setMinValue(1);
		return calc;
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

}

export const DAMAGE_SYSTEM = new DamageSystem();

interface DamageInterface {
	getDamage(power: Usable,attackerPersona: Persona, situation: Situation, damageType: DamageType) : U<DamageCalculation>;
}
