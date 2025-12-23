import {DamageLevel, DamageType, RealDamageType} from "../../config/damage-types.js";
import {ItemSubtype, Power, Usable} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaError} from "../persona-error.js";
import {AttackResult} from "./combat-result.js";
import {DamageCalculation, EvaluatedDamage} from "./damage-calc.js";

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
		let subtype : Power["system"]["subtype"] = "none";
		if (power.isPower()) {
			subtype = power.system.damageLevel == "fixed" ?
				"standalone" : power.system.subtype;
		} else {
			subtype = 'standalone';
		}
		// const subtype : PowerType = power.isPower() ? power.system.subtype : 'standalone';
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

	calculateAllOutDamage(attackLeader: ValidAttackers, allAttackers: ValidAttackers[], situation: AttackResult['situation'] ) : AllOutReturn[] {
		const list : AllOutReturn[] = [];
		for (const actor of allAttackers) {
			if (!actor.canAllOutAttack()) {continue;}
			const isAttackLeader = actor == attackLeader;
			const damageCalc = this.individualContributionToAllOutAttackDamage(actor, situation, isAttackLeader);
			const result = damageCalc.eval();
			if (result == undefined) {
				PersonaError.softFail('Allout contribution for ${actor.name} was undefined');
				continue;
			}
			const contribution= Math.round(Math.abs(result.hpChange));
			list.push( {
				contributor: actor,
				amt: contribution,
				stack: result.str,
			});
		}
		return list;
	}

	abstract individualContributionToAllOutAttackDamage(attacker: ValidAttackers, situation: AttackResult['situation'], isAttackLeader: boolean) : DamageCalculation;

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
	calculateAllOutDamage(attackLeader: ValidAttackers, allAttackers: ValidAttackers[], situation: AttackResult['situation'] ) : AllOutReturn[];
	individualContributionToAllOutAttackDamage(actor: ValidAttackers, situation: AttackResult["situation"], isAttackLeader: boolean) : DamageCalculation;
}

export type ConvertableDamageLevel = Exclude<DamageLevel, "-" | "fixed">;

export type NewDamageParams = {
	baseAmt: number,
	extraVariance: number,
};


export type AllOutReturn  = {
	contributor: ValidAttackers,
	amt: number,
	stack: EvaluatedDamage['str']
};
