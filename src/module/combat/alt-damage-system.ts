import {DAMAGE_LEVELS, RealDamageType} from "../../config/damage-types.js";
import {ItemSubtype} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {Calculation} from "../utility/calculation.js";
import {GrowthCalculator} from "../utility/growth-calculator.js";
import {AttackResult} from "./combat-result.js";
import {DamageCalculation} from "./damage-calc.js";
import {ConvertableDamageLevel, DamageSystemBase, NewDamageParams} from "./damage-system.js";


export class AltDamageSystem extends DamageSystemBase {

	// private ENDURANCE_DR_MULTIPLIER = 0.01 as const;
	private WEAPON_STRENGTH_DAMAGE_MULT = 0.5 as const;
	private HEALING_MAGIC_MULT = 1 as const;
	private END_DIFF_PERCENTAGE_MULT = 0.5 as const;
	private MAGIC_DAMAGE_MULT = 1 as const;
	private BASE_VARIANCE = 2 as const;
	private ARMOR_TO_DAMAGE_DIVISOR = 1.0 as const;
	private ALL_OUT_ATTACK_HELPER_DIVISOR = 1/3;
	private BASE_DAMAGE_LEVEL_DIVISOR = 0.50 as const;
	// private STAT_DIFF_DAMAGE_BOOST_PERCENT = 0.02;
	private _weaponDmgGrowth = new GrowthCalculator(1.20, 11, 4.5);

	individualContributionToAllOutAttackDamage(actor: ValidAttackers, target: ValidAttackers, situation: AttackResult['situation'], isAttackLeader: boolean) : DamageCalculation {
		if (!actor.canAllOutAttack()) {
			return new DamageCalculation("physical");
		}
		const basicAttack = PersonaDB.getBasicPower('Basic Attack');
		if (!basicAttack) {
			PersonaError.softFail("Can't find Basic attack power");
			return new DamageCalculation("physical");
		}
		const damage = this.getDamage(basicAttack, actor.persona(), target.persona(), situation);
		if (!isAttackLeader) {
			damage.add("multiplier", this.ALL_OUT_ATTACK_HELPER_DIVISOR, "All out attack helper multiplier");
		}
		return damage;
	}

	protected override applyDR(calc: DamageCalculation, damageType: RealDamageType, power: Usable, attackerPersona: U<Persona>, targetPersona: Persona): DamageCalculation {
		let DR = new DamageCalculation(damageType);
		switch (true) {
			case (damageType == "healing"):
				return calc;
			case !power.isUsableType(): return calc;
			case power.isConsumable():  return calc;
			case damageType == "all-out":
			case power.isWeaponSkill():
				if (!attackerPersona) {
					return calc;
				}
				DR = this.physDR(attackerPersona, targetPersona);
				break;
			case power.isMagicSkill():
				if (!attackerPersona) {
					return calc;
				}
				DR = this.magDR(attackerPersona, targetPersona);
				break;
		}
		return calc.merge(DR);
	}

	public getWeaponSkillDamage(power: ItemSubtype<Power, 'weapon'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const dtype = power.getDamageType(userPersona);
		const calc = new DamageCalculation(dtype);
		const levelDivisor = power.isBasicPower() ? 1 : this.BASE_DAMAGE_LEVEL_DIVISOR;
		const str = this.strDamageBonus(userPersona);
		const weaponDmg = this.weaponDamage(userPersona);
		const skillDamage = this.weaponSkillDamage(power);
		const bonusDamage = userPersona.getBonusWpnDamage().total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const strRes = str.eval(situation);
		calc.add('base', userPersona.user.level * levelDivisor, `Character Level * ${levelDivisor} `);
		calc.add('base', strRes.total, `${userPersona.publicName} Strength (${strRes.steps.join(" ,")})`);
		const weaponName = userPersona.user.isShadow() ? 'Unarmed Shadow Damage' : (userPersona.user.weapon?.displayedName ?? 'Unarmed');
		calc.add('base', weaponDmg.baseAmt, weaponName.toString());
		calc.add('base', skillDamage.baseAmt, `${power.displayedName.toString()} Power Bonus`);
		calc.add('base', bonusDamage, 'Bonus Damage');
		const variance  = (this.BASE_VARIANCE + weaponDmg.extraVariance + skillDamage.extraVariance + bonusVariance );
		const varianceMult = userPersona.combatStats.getPhysicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		const damageLevelLoc = game.i18n.localize(DAMAGE_LEVELS[power.system.damageLevel]);
		calc.add("multiplier", skillDamage.mult, `${damageLevelLoc} Damage Multiplier`);
		calc.setMinValue(1);
		return calc ;
	}

	public getMagicSkillDamage(power: ItemSubtype<Power, 'magic'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const dtype = power.getDamageType(userPersona);
		const isHealing = dtype == "healing";
		const persona = userPersona;
		const skillDamage = this.magicSkillDamage(power);
		const magicDmg = this.magDamageBonus(userPersona);
		if (isHealing) {
			magicDmg.mult(1, this.HEALING_MAGIC_MULT , "Healing Power");
		}
		const damageBonus = persona.getBonuses('magDmg').total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const calc= new DamageCalculation(dtype);
		const resMag = magicDmg.eval(situation);
		if (!isHealing) {
			calc.add('base', userPersona.user.level * this.BASE_DAMAGE_LEVEL_DIVISOR, `Character Level * ${this.BASE_DAMAGE_LEVEL_DIVISOR} `);
		}
		calc.add('base', resMag.total, `${userPersona.publicName} Magic (${resMag.steps.join(" ,")})`, );
		const baseAmt = skillDamage.baseAmt;
		calc.add('base', baseAmt, `${power.displayedName.toString()} Damage`);
		calc.add('base', damageBonus, 'Bonus Damage');
		const variance  = (this.BASE_VARIANCE + skillDamage.extraVariance + bonusVariance );
		const varianceMult = userPersona.combatStats.getMagicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		const damageLevelLoc = game.i18n.localize(DAMAGE_LEVELS[power.system.damageLevel]);
		const mult = isHealing ? skillDamage.healMult : skillDamage.mult;
		calc.add("stackMult", mult, `${damageLevelLoc} ${isHealing ? "Healing" : "Damage"} Multiplier`);
		calc.setMinValue(1);
		return calc;
	}

	public getWeaponDamageByWpnLevel(lvl: number) : number {
		lvl = Math.round(lvl);
		return this._weaponDmgGrowth.valueAt(lvl + 1);
	}

	public getArmorDRByArmorLevel(lvl: number) : number {
		const ARMOR_DIVISOR = this.ARMOR_TO_DAMAGE_DIVISOR;
		// const ARMOR_DIVISOR = 0.90;
		const val =  this.getWeaponDamageByWpnLevel(lvl);
		if (val) {return Math.floor(val * ARMOR_DIVISOR);}
		return 0;
	}

	protected getPercentModifier(attackStat: number, endurance: number) : number {
		const PERCENT_PADDING = 5 as const;
		let percent = (PERCENT_PADDING + attackStat) / (PERCENT_PADDING + endurance);
		const deviance = 1- percent;
		percent += deviance * (1 - this.END_DIFF_PERCENTAGE_MULT);
		percent = Math.round(percent * 100) / 100;
		return percent;
	}

	protected physDR(attackerPersona : Persona, targetPersona: Persona): DamageCalculation {
		const calc = new DamageCalculation(null);
		const attackStat = attackerPersona.combatStats.strength;
		const endurance = targetPersona.combatStats.endurance;
		const percent= this.getPercentModifier(attackStat, endurance);
		const armorDR = this.armorDR(targetPersona);
		calc.merge(armorDR);
		calc.add("stackMult", percent, "Strength vs Endurance Difference");
		return calc;
	}

	protected magDR(attackerPersona: Persona, targetPersona: Persona) : DamageCalculation {
		const calc = new DamageCalculation(null);
		const attackStat = attackerPersona.combatStats.magic;
		const endurance = targetPersona.combatStats.endurance;
		const percent= this.getPercentModifier(attackStat, endurance);
		calc.add("stackMult", percent, "Magic vs Endurance Difference");
		const armorDR = this.armorDR(targetPersona);
		calc.merge(armorDR);
		return calc;
	}

	protected armorDR(targetPersona: Persona) : DamageCalculation {
		const calc = new DamageCalculation(null);
		const situation = {
			user: targetPersona.user.accessor,
			target: targetPersona.user.accessor,
		};
		const armor = this.#armorDR(targetPersona);
		const armorBonus = targetPersona.getDefensiveBonuses("armor-dr").total(situation);
		const armorMult = targetPersona.getDefensiveBonuses("armor-dr-mult").total(situation, "percentage");
		const armorString = "Armor DR";
		// console.log(`${targetPersona.name} DR mult : ${armorMult}`);
		const modifiedArmor = -Math.abs(Math.round(armor * armorMult));
		calc.add("base", modifiedArmor, armorString);
		calc.add("base", -armorBonus, "Armor Modifiers");
		return calc;
	}

	getShadowEffectiveEquipmentLevel(shadow: Shadow) {
		const base =  Math.floor((shadow.level -10) / 10);
		return Math.max(0, base);
	}

	#armorDR(persona: Persona) : number {
		if (persona.user.isShadow()) {
			return this.getArmorDRByArmorLevel(this.getShadowEffectiveEquipmentLevel(persona.user));
		}
		const armor = persona.user.equippedItems().find(x => x.isInvItem() && x.system.slot == "body") as U<InvItem>;
		return armor  != undefined ? this.armorDRByEquipment(armor) : 0;
	}

	armorDRByEquipment(item: InvItem) : number {
		if (item.system.slot != "body") {return 0;}
		if (item.system.armorLevel > 0) {
			return this.getArmorDRByArmorLevel(item.system.armorLevel);
		}
		if (item.system.armorDR > 0) {
			return item.system.armorDR;
		}
		if (item.itemLevel() > 0) {
			return this.getArmorDRByArmorLevel(item.itemLevel());
		}
		return 0;
	}

	protected strDamageBonus(persona: Persona) : Calculation {
		const strength = persona.combatStats.strength;
		const calc = new Calculation(0, 2);
		return calc
			.add(0, strength + 0, `${persona.displayedName} Strength`)
			.mult(1, this.WEAPON_STRENGTH_DAMAGE_MULT, `Strength Damage Bonus Multiplier`);
	}

	protected magDamageBonus(persona: Persona) : Calculation {
		const magic = persona.combatStats.magic;
		const calc = new Calculation(0);
		return calc
			.add(0, magic, `${persona.displayedName} Magic`)
			.mult(1, this.MAGIC_DAMAGE_MULT, `Magic Damage Multiplier`);
	}

	protected weaponDamage(persona: Persona) : NewDamageParams {
		if (persona.user.isShadow()) {
			const shadowDmg = this.getWeaponDamageByWpnLevel(this.getShadowEffectiveEquipmentLevel(persona.user));
			return {
				baseAmt: Math.max(0, shadowDmg) ,
				extraVariance: 0
			};
		} else {
			const wpn = persona.user.weapon;
			if (!wpn) {
				return  {baseAmt: 0, extraVariance: 0};
			}
			return wpn.baseDamage();
		}
	}

	protected weaponSkillDamage(weaponPower:ItemSubtype<Power, "weapon">) : ExtraDamageParams {
		switch (weaponPower.system.damageLevel) {
			case "-": //old system
				PersonaError.softFail(`${weaponPower.name} is no longer supported`);
				return {
					extraVariance: weaponPower.system.melee_extra_mult + 1,
					baseAmt: 0,
					mult: 1,
					healMult: 1,
				};
			case "fixed":
				return {
					extraVariance: 0,
					baseAmt: weaponPower.system.damage.low,
					mult: 1,
					healMult: 1,
				};
			default:
				return DAMAGE_LEVEL_NEW[weaponPower.system.damageLevel];
		}
	}

	protected magicSkillDamage(magic: ItemSubtype<Power, "magic">) : Readonly<ExtraDamageParams> {
		switch (magic.system.damageLevel) {
			case "-":
				PersonaError.softFail(`${magic.name} is no longer supported (No damagelevel)`);
				return {
					extraVariance: magic.system.mag_mult,
					baseAmt: 0,
					mult: 1,
					healMult: 1,
				};
			case "fixed":
				PersonaError.softFail(`${magic.name} is no longer supported (Fixed damage)`);
				return {
					extraVariance: 0,
					baseAmt: magic.system.damage.low,
					mult: 1,
					healMult: 1,
				};
			default: {
				const val = DAMAGE_LEVEL_NEW[magic.system.damageLevel];
				return val;
			}
		}
	}

}

const DAMAGE_LEVEL_NEW = {
	"none": {extraVariance: 0, baseAmt: 0, mult: 0, healMult: 0},
	"miniscule": {extraVariance: 0, baseAmt: 0, mult: 0.5, healMult: 0.25},
	"basic": {extraVariance: 0, baseAmt: 0, mult: 1, healMult: 0.5},
	"light": {extraVariance: 0, baseAmt: 15, mult: 1.05, healMult: 1.25},
	"medium": {extraVariance: 0, baseAmt: 20, mult: 1.20, healMult: 1.75},
	"heavy": {extraVariance: 0, baseAmt: 25, mult: 1.4, healMult: 2.5},
	"severe": {extraVariance: 0, baseAmt: 30, mult: 1.6, healMult: 3},
	"colossal": {extraVariance: 0, baseAmt: 35, mult: 1.8, healMult :4},
} as const satisfies Readonly<Record< ConvertableDamageLevel, ExtraDamageParams>>;

export const ALT_DAMAGE_SYSTEM = new AltDamageSystem();

type ExtraDamageParams = {
	mult: number,
	baseAmt: number,
	extraVariance: number,
	healMult: number,
};

