import {DamageLevel, RealDamageType} from "../../config/damage-types.js";
import { ItemSubtype} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {Calculation} from "../utility/calculation.js";
import {GrowthCalculator} from "../utility/growth-calculator.js";
import {AttackResult} from "./combat-result.js";
import {DamageCalculation, NewDamageParams} from "./damage-calc.js";
import {DamageSystemBase} from "./damage-system.js";

export class OriginalDamageSystem extends DamageSystemBase {
	// WEAPON_DAMAGE_MULT = 1.75 as const;
	// MAGIC_DAMAGE_MULT = 1.75 as const;
	// ENDURANCE_DR_MULTIPLIER = 0.005 as const;
	ENDURANCE_DR_MULTIPLIER = 0.01 as const;
	WEAPON_DAMAGE_MULT = 2 as const;
	MAGIC_DAMAGE_MULT = 2 as const;
	BASE_VARIANCE = 2 as const;
	ARMOR_TO_DAMAGE_DIVISOR = 0.8 as const;
	ALL_OUT_ATTACK_HELPER_DIVISOR = 1/4;
	BASE_DAMAGE_LEVEL_DIVISOR = 0.5;
	private _weaponDmgGrowth = new GrowthCalculator(1.20, 11, 4.5);

	getWeaponSkillDamage(power: ItemSubtype<Power, 'weapon'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const dtype = power.getDamageType(userPersona);
		const calc = new DamageCalculation(dtype);
		const str = this.strDamageBonus(userPersona);
		const weaponDmg = this.weaponDamage(userPersona);
		const skillDamage = this.weaponSkillDamage(power);
		const bonusDamage = userPersona.getBonusWpnDamage().total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const strRes = str.eval(situation);
		calc.add('base', userPersona.user.level * this.BASE_DAMAGE_LEVEL_DIVISOR, `Character Level * ${this.BASE_DAMAGE_LEVEL_DIVISOR} `);
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

	override applyDR(calc: DamageCalculation, damageType: RealDamageType, power: Usable, targetPersona: Persona): DamageCalculation {
		let DR = new DamageCalculation(damageType);
		switch (true) {
			case (damageType == "healing"):
				return calc;
			case !power.isUsableType(): return calc;
			case power.isConsumable():  return calc;
			case damageType == "all-out":
			case power.isWeaponSkill():
				DR = this.physDR(targetPersona);
				break;
			case power.isMagicSkill():
				DR = this.magDR(targetPersona);
				break;
		}
		return calc.merge(DR);
	}

	physDR(targetPersona: Persona): DamageCalculation {
		const calc = this.enduranceDR(targetPersona);
		return calc.merge(this.armorDR(targetPersona));
	}

	magDR(targetPersona: Persona) : DamageCalculation {
		return this.enduranceDR(targetPersona);
	}

	enduranceDR(targetPersona: Persona) : DamageCalculation {
		const calc = new DamageCalculation(null);
		const percentageMult = this.#endurancePercentDR(targetPersona);
		calc.add("multiplier", percentageMult, "Endurance DR modifier");
		return calc;
	}

	armorDR(targetPersona: Persona) : DamageCalculation {
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

	#armorDR(persona: Persona) : number {
	if (persona.user.isShadow()) {
		const DR =  this.getArmorDRByArmorLevel(Math.floor(persona.level /10));
		return DR;
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


	#endurancePercentDR(targetPersona: Persona) : number {
		const situation = {
			user: targetPersona.user.accessor,
			target: targetPersona.user.accessor,
		};
		const generalDRBonus = targetPersona.getDefensiveBonuses("dr").total(situation);
		const percentageMult = 1 - ((targetPersona.combatStats.endurance + generalDRBonus) * this.ENDURANCE_DR_MULTIPLIER);
		return Math.max(0.25, percentageMult);

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
		calc.add('base', userPersona.user.level * this.BASE_DAMAGE_LEVEL_DIVISOR, `Character Level * ${this.BASE_DAMAGE_LEVEL_DIVISOR} `);
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
			.add(1, this.WEAPON_DAMAGE_MULT, `Strength Damage Bonus Multiplier`, "multiply");
	}

	magDamageBonus(persona: Persona) : Calculation {
		const magic = persona.combatStats.magic;
		const calc = new Calculation(0);
		return calc
			.add(0, magic, `${persona.displayedName} Magic`, "add")
			.add(1, this.MAGIC_DAMAGE_MULT, `Magic Damage Multiplier`, "multiply");
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

	weaponDamage(persona: Persona) : NewDamageParams {
		if (persona.user.isShadow()) {
			return {
				baseAmt: this.getWeaponDamageByWpnLevel(Math.floor(persona.level / 10)),
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

	getWeaponDamageByWpnLevel(lvl: number) : number {
		lvl = Math.round(lvl);
		return this._weaponDmgGrowth.valueAt(lvl + 1);
	}

	// getWeaponDamageByWpnLevel(lvl: number) : number {
	// 	lvl = Math.clamp(Math.round(lvl), 0, 12);
	// 	const val =  WEAPON_LEVEL_TO_DAMAGE[lvl];
	// 	if (val) {return val;}
	// 	return 0;
	// }

	getArmorDRByArmorLevel(lvl: number) : number {
		const ARMOR_DIVISOR = this.ARMOR_TO_DAMAGE_DIVISOR;
		// const ARMOR_DIVISOR = 0.90;
		const val =  this.getWeaponDamageByWpnLevel(lvl);
		if (val) {return Math.floor(val * ARMOR_DIVISOR);}
		return 0;
	}

	individualContributionToAllOutAttackDamage(actor: ValidAttackers, situation: AttackResult['situation'], isAttackLeader: boolean) : DamageCalculation {
		if (!actor.canAllOutAttack()) {
			return new DamageCalculation("physical");
		}
		const basicAttack = PersonaDB.getBasicPower('Basic Attack');
		if (!basicAttack) {
			PersonaError.softFail("Can't find Basic attack power");
			return new DamageCalculation("physical");
		}
		const damage = basicAttack.damage.getDamage(basicAttack, actor.persona(), situation);
		if (!isAttackLeader) {
			damage.add("multiplier", this.ALL_OUT_ATTACK_HELPER_DIVISOR, "All out attack helper multiplier");
		}
		return damage;
	}

}

const DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE = {
	"none": {extraVariance: 0, baseAmt: 0},
	"miniscule": {extraVariance: 0, baseAmt: 0},
	"basic": {extraVariance: 0, baseAmt: 0},
	"light": {extraVariance: 1, baseAmt: 10},
	"medium": {extraVariance: 2, baseAmt: 30},
	"heavy": {extraVariance: 2, baseAmt: 65},
	"severe": {extraVariance: 3, baseAmt: 100},
	"colossal": {extraVariance: 4, baseAmt: 150},
} as const satisfies Readonly<Record< ConvertableDamageLevel, NewDamageParams>>;

const DAMAGE_LEVEL_CONVERT_WEAPON = {
	"none": {extraVariance: 0, baseAmt: 0},
	"miniscule": {extraVariance: 0, baseAmt: 0},
	"basic": {extraVariance: 0, baseAmt: 0},
	"light": {extraVariance: 1, baseAmt: 10},
	"medium": {extraVariance: 2, baseAmt: 30},
	"heavy": {extraVariance: 2, baseAmt: 65},
	"severe": {extraVariance: 3, baseAmt: 100},
	"colossal": {extraVariance: 4, baseAmt: 150},
} as const satisfies Readonly<Record<ConvertableDamageLevel, NewDamageParams>> ;


type ConvertableDamageLevel = Exclude<DamageLevel, "-" | "fixed">;

export const ORIGINAL_DAMAGE_SYSTEM = new OriginalDamageSystem();

