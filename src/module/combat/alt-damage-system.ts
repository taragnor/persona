import {DamageLevel, RealDamageType} from "../../config/damage-types.js";
import {InvItem, ItemSubtype, Power, Usable} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {Calculation} from "../utility/calculation.js";
import {AttackResult} from "./combat-result.js";
import {DamageCalculation} from "./damage-calc.js";
import {DamageSystemBase} from "./damage-system.js";

export class PercentBasedDamageSystem extends DamageSystemBase {
	WEAPON_DAMAGE_MULT = 1.75 as const;
	MAGIC_DAMAGE_MULT = 1.75 as const;
	BASE_VARIANCE = 2 as const;
	BASE_MAGIC_MULTIPLIER = 1 as const;
	BASE_WEAPON_MULTIPLIER = 0 as const;
	ENDURANCE_DR_MULTIPLIER = 0.005 as const;
	BASE_STAT_MULT_ADJUST = 10 as const;
	BASE_DAMAGE = 15 as const;
	ALL_OUT_ATTACK_HELPER_DIVISOR = 1/4;

	getWeaponSkillDamage(power: ItemSubtype<Power, 'weapon'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const dtype = power.getDamageType(userPersona);
		const calc = new DamageCalculation(dtype);
		const str = userPersona.combatStats.strength;
		const baseCalc = new Calculation(this.BASE_DAMAGE);
		const weaponDmgMult = this.weaponDamageMult(userPersona);
		const skillDamageMult = this.weaponSkillDamageMultiplier(power);
		const weaponName = userPersona.user.isShadow() ? 'Unarmed Shadow Damage' : (userPersona.user.weapon?.displayedName ?? 'Unarmed');
		baseCalc.add(0, (str + this.BASE_STAT_MULT_ADJUST) / 10, `Strength + ${this.BASE_STAT_MULT_ADJUST}`, "multiply");
		baseCalc.add(0, weaponDmgMult, `${weaponName} Multiplier`, "multiply");
		baseCalc.add(0, skillDamageMult, "Skill Multiplier", "multiply");
		const bonusDamage = userPersona.getBonusWpnDamage().total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const basedmg = baseCalc.eval({user: userPersona.user.accessor});
		calc.add('base', basedmg.total, `Base Damage (${basedmg.steps.join(" ,")})`);
		calc.add('base', bonusDamage, 'Bonus Damage');
		const variance  = this.BASE_VARIANCE + bonusVariance;
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

	magDR(targetPersona: Persona) : DamageCalculation{
		return this.enduranceDR(targetPersona);
	}

	enduranceDR(persona: Persona) {
		const calc= new DamageCalculation(null);
		// const percentageMult = this.#endurancePercentDR(targetPersona);
		const endurance = persona.combatStats.endurance;
		const modEnd = (this.BASE_STAT_MULT_ADJUST + endurance/ 3) / 10;
		const percentageMult = 1/ modEnd;
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
		const modifiedArmor = Math.abs(armor * armorMult);
		const finalArmor = armorBonus + modifiedArmor;
		calc.add("multiplier", 1/finalArmor, `${armorString}`);
		// calc.add("base", modifiedArmor, armorString);
		// calc.add("base", -armorBonus, "Armor Modifiers");
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

	getMagicSkillDamage(power: ItemSubtype<Power, 'magic'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const persona = userPersona;
		const baseCalc= new Calculation(this.BASE_DAMAGE);
		const magic = userPersona.combatStats.magic;
		baseCalc.add(0, (magic + this.BASE_STAT_MULT_ADJUST) / 10, `Magic Stat + ${this.BASE_STAT_MULT_ADJUST} `, "multiply");
		const skillMult = this.magicSkillDamageMultiplier(power);
		baseCalc.add(0, skillMult, `${power.name} multiplier`, "multiply");
		const damageBonus = persona.getBonuses('magDmg').total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const dtype = power.getDamageType(userPersona);
		const basedmg = baseCalc.eval({user: userPersona.user.accessor});
		const calc = new DamageCalculation(dtype);
		// const resMag = magicDmg.eval(situation);
		calc.add('base', basedmg.total, `Base Damage (${basedmg.steps.join(" ,")})`, );
		// calc.add('base', skillDamage.baseAmt, `${power.displayedName.toString()} Damage`);
		calc.add('base', damageBonus, 'Bonus Damage');
		const variance  = (this.BASE_VARIANCE + bonusVariance );
		const varianceMult = userPersona.combatStats.getMagicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		calc.setMinValue(1);
		return calc;
	}

	weaponSkillDamageMultiplier(weaponPower:ItemSubtype<Power, "weapon">) : number {
		switch (weaponPower.system.damageLevel) {
			case "-": //old system
				PersonaError.softFail(`${weaponPower.name} is no longer supported`);
				return 0;
				// return {
				// 	extraVariance: weaponPower.system.melee_extra_mult + 1,
				// 	baseAmt: 0
				// };
			case "fixed":
				return 1;
				// return {
				// 	extraVariance: 0,
				// 	baseAmt: weaponPower.system.damage.low
				// };
			default:
				return this.BASE_WEAPON_MULTIPLIER  + DAMAGE_LEVEL_CONVERT_WEAPON[weaponPower.system.damageLevel];
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

	magicSkillDamageMultiplier(magic: ItemSubtype<Power, "magic">) : number {
		switch (magic.system.damageLevel) {
			case "-":
				PersonaError.softFail(`${magic.name} is no longer supported (No damagelevel)`);
				return 0;
			case "fixed":
				PersonaError.softFail(`${magic.name} is no longer supported (Fixed damage)`);
				return 1;
			default: {
				const val = DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE[magic.system.damageLevel];
				return this.BASE_MAGIC_MULTIPLIER + val;
			}
		}
	}

	weaponDamageMult(persona: Persona) : number {
		if (persona.user.isShadow()) {
			return this.getWeaponDamageByWpnLevel(Math.floor(persona.level / 10));
		} else {
			const wpn = persona.user.weapon;
			if (!wpn) {
				return  0.5;
			}
			return wpn.baseDamage().baseAmt;
		}
	}

	getWeaponDamageByWpnLevel(lvl: number) : number {
		const val =  WEAPON_LEVEL_TO_DAMAGE_MULT[lvl];
		if (val) {return val;}
		return 0;
	}

	getArmorDRByArmorLevel(lvl: number) : number {
		const ARMOR_DIVISOR = 0.90;
		const val =  WEAPON_LEVEL_TO_DAMAGE_MULT[lvl];
		if (val) {return Math.floor(val * ARMOR_DIVISOR);}
		return 0;
	}

	override individualContributionToAllOutAttackDamage(attacker: ValidAttackers, situation: AttackResult["situation"], isAttackLeader: boolean): DamageCalculation {
		if (!attacker.canAllOutAttack()) {
			return new DamageCalculation("physical");
		}
		const basicAttack = PersonaDB.getBasicPower('Basic Attack');
		if (!basicAttack) {
			PersonaError.softFail("Can't find Basic attack power");
			return new DamageCalculation("physical");
		}
		const damage = basicAttack.damage.getDamage(basicAttack, attacker.persona(), situation);
		if (!isAttackLeader) {
			damage.add("multiplier", this.ALL_OUT_ATTACK_HELPER_DIVISOR, "All out attack helper multiplier");
		}
		return damage;
	}

}

const DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE = {
	"none": 0,
	"miniscule": 0.5,
	"basic": 1,
	"light": 1.25,
	"medium": 1.666,
	"heavy": 2.00,
	"severe": 2.3,
	"colossal": 2.6,
} as const satisfies Readonly<Record< ConvertableDamageLevel, number>>;

const DAMAGE_LEVEL_CONVERT_WEAPON = {
	"none": 0,
	"miniscule": 0.5,
	"basic": 1,
	"light": 1.25,
	"medium": 1.666,
	"heavy": 2.00,
	"severe": 2.3,
	"colossal": 2.6,
} as const satisfies Readonly<Record<ConvertableDamageLevel, number>> ;

//formual start at 6, then to get further levels , add (newlvl+1) to previous value
const WEAPON_LEVEL_TO_DAMAGE_MULT: Record<number, number> = {
	0: 1,
	1: 1.25,
	2: 1.5,
	3: 1.75 ,
	4: 2,
	5: 2.25,
	6: 2.5,
	7: 2.75,
	8: 3,
	9: 3.25,
	10:  3.50,
	11: 3.75,
	12: 4,
};

type ConvertableDamageLevel = Exclude<DamageLevel, "-" | "fixed">;

export const ALT_DAMAGE_SYSTEM = new PercentBasedDamageSystem();
