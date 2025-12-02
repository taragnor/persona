import {ItemSubtype, Power} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaError} from "../persona-error.js";
import {DamageCalculation} from "./damage-calc.js";
import {ConvertableDamageLevel, DamageSystem} from "./damage-system.js";

export class PercentBasedDamageSystem extends DamageSystem {

	override getWeaponSkillDamage(power: ItemSubtype<Power, 'weapon'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const dtype = power.getDamageType(userPersona);
		const calc = new DamageCalculation(dtype);
		const str = this.strDamageBonus(userPersona);
		const weaponDmg = this.weaponDamage(userPersona);
		const skillDamageMult = this.weaponSkillDamageMult(power);
		const bonusDamage = userPersona.getBonusWpnDamage().total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const strRes = str.eval(situation);
		calc.add('base', strRes.total, `${userPersona.publicName} Strength (${strRes.steps.join(" ,")})`);
		const weaponName = userPersona.user.isShadow() ? 'Unarmed Shadow Damage' : (userPersona.user.weapon?.displayedName ?? 'Unarmed');
		calc.add('base', weaponDmg.baseAmt, weaponName.toString());
		calc.add('stackMult', skillDamageMult, `${power.displayedName.toString()} Power Multiplier`);
		calc.add('base', bonusDamage, 'Bonus Damage');
		const variance  = (this.BASE_VARIANCE + weaponDmg.extraVariance + bonusVariance) * skillDamageMult;
		const varianceMult = userPersona.combatStats.getPhysicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance.toFixed(1)}x Variance)` );
		calc.setMinValue(1);
		return calc ;
	}

	override getMagicSkillDamage(power: ItemSubtype<Power, 'magic'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const persona = userPersona;
		const magicDmg = this.magDamageBonus(userPersona);
		const skillDamageMult = this.magicSkillDamageMult(power);
		const damageBonus = persona.getBonuses('magDmg').total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const dtype = power.getDamageType(userPersona);
		const calc= new DamageCalculation(dtype);
		const resMag = magicDmg.eval(situation);
		calc.add('base', resMag.total, `${userPersona.publicName} Magic (${resMag.steps.join(" ,")})`, );
		calc.add('stackMult', skillDamageMult, `${power.displayedName.toString()} Multiplier`);
		calc.add('base', damageBonus, 'Bonus Damage');
		const variance  = (this.BASE_VARIANCE + bonusVariance ) * skillDamageMult;
		const varianceMult = userPersona.combatStats.getMagicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		calc.setMinValue(1);
		return calc;
	}


	weaponSkillDamageMult(weaponPower:ItemSubtype<Power, "weapon">) :number {
		switch (weaponPower.system.damageLevel) {
			case "-": //old system
				PersonaError.softFail(`${weaponPower.name} is no longer supported`);
				return 0 ;
			case "fixed":
				return 1;
			default:
				return DAMAGE_LEVEL_WEAPON_MULTIPLIER[weaponPower.system.damageLevel];
		}
	}

	magicSkillDamageMult(magic: ItemSubtype<Power, "magic">) : number {
		switch (magic.system.damageLevel) {
			case "-":
				PersonaError.softFail(`${magic.name} is no longer supported (No damagelevel)`);
				return 0;
			case "fixed":
				PersonaError.softFail(`${magic.name} is no longer supported (Fixed damage)`);
				return 1;
			default: {
				const val = DAMAGE_LEVEL_MAGIC_MULTIPLIER[magic.system.damageLevel];
				return val;
			}
		}
	}


}

export const ALT_DAMAGE_SYSTEM = new PercentBasedDamageSystem();

const DAMAGE_LEVEL_MAGIC_MULTIPLIER : Record<ConvertableDamageLevel, number> = {
	none: 0,
	miniscule: 0.5,
	basic: 1,
	light: 1.33,
	medium: 1.75,
	heavy: 2.25,
	severe: 2.75,
	colossal: 3.25,
};

const DAMAGE_LEVEL_WEAPON_MULTIPLIER = {
	none: 0,
	miniscule: 0.5,
	basic: 1,
	light: 1.33,
	medium: 1.75,
	heavy: 2.25,
	severe: 2.75,
	colossal: 3.25,
} as const satisfies Readonly<Record<ConvertableDamageLevel, number>> ;

