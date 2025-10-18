import { ValidAttackers } from "./persona-combat.js";
import { DamageLevel, RealDamageType } from "../../config/damage-types.js";
import { ConsequenceAmount, DamageConsequence, EnhancedSourcedConsequence } from "../../config/consequence-types.js";
import { OldDamageConsequence } from "../../config/consequence-types.js";
import { DamageType } from "../../config/damage-types.js";
import {ItemSubtype, Power} from "../item/persona-item.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {ConsequenceConverter} from "../migration/convertConsequence.js";
import {PersonaError} from "../persona-error.js";
import {ConsequenceAmountResolver} from "../conditionalEffects/consequence-amount.js";

export class DamageCalculation {
	#resisted: boolean = false;
	#absorbed: boolean = false;
	#weakness: boolean = false;
	#blocked : boolean = false;
	#minValue : number = 0;
	#applyEvenBonus: boolean = false;
	lists = {
		base: [] as DamageObj[],
		evenBonus: [] as DamageObj[],
		multiplier: [] as DamageObj[],
		divisor: [] as DamageObj[],
		stackMult: [] as DamageObj[],
		nonMultPostAdd: [] as DamageObj[],
		resist: [] as DamageObj[],
	} satisfies Record<string, DamageObj[]>;
	damageType : RealDamageType | null;
	target: ValidAttackers;

	constructor (dtype : RealDamageType | null) {
		this.damageType = dtype;
		this.#minValue = 0;
	}

	addDamageConsOldForm(cons: SourcedConsequence<OldDamageConsequence>, target: ValidAttackers, defaultDamageType: DamageType) : DamageCalculation {
		const newForm = DamageCalculation.convertToNewFormConsequence(cons, defaultDamageType);
		this.addConsequence(newForm, target);
		return this;
	}

	setMinValue(val: number) {
		this.#minValue = val;
		return this;
	}

	setDamageType(dtype : RealDamageType) {
		this.damageType = dtype;
		return this;
	}

	setApplyEvenBonus() : this {
		this.#applyEvenBonus = true;
		return this;
	}
	setHitWeakness() {
		this.#weakness = true;
		return this;
	}

	setAbsorbed() {
		this.#absorbed = true;
		return this;
	}

	setResisted() {
		this.#resisted = true;
		return this;
	}

	static convertToNewFormConsequence( cons: SourcedConsequence<OldDamageConsequence>, defaultDamageType: DamageType) : SourcedConsequence<DamageConsequence> {
		const convert = ConsequenceConverter.convertDeprecatedDamageConsequence(cons, defaultDamageType);
		return {
			...convert,
			source: cons.source,
			owner: cons.owner,
			realSource: cons.realSource,
		};
	}

	addConsequence(cons: EnhancedSourcedConsequence<DamageConsequence>, target: ValidAttackers): DamageCalculation {
		let damageOrder: DamageOrder;
		let amt : number;
		if (cons.modifiers) {
			for (const mod of cons.modifiers) {
				switch (mod) {
					case "blocked":
						this.#blocked = true;
						break;
					case "absorbed":
						this.#absorbed = true;
						break;
					case "resisted":
						this.#resisted = true;
						break;
				}
			}
		}
		switch (cons.damageSubtype) {
			case "multiplier": {
				damageOrder = "multiplier";
				if (cons.amount == undefined) {amt= 0; break;}
				const res = this.resolveConsAmount(cons);
				amt = res ?? 0;
				break;
			}
			case "odd-even":
			case "high":
			case "low":
			case "allout":
				damageOrder= "base";
				amt = 0;
				break;
			case "constant": {
				damageOrder= "base";
				if (cons.amount == undefined) {amt= 0; break;}
				const res = this.resolveConsAmount(cons);
				amt = res ?? 0;
				break;
			}
			case "percentage": {
				damageOrder = "nonMultPostAdd";
				if (cons.amount == undefined) {amt= 0; break;}
				const res = this.resolveConsAmount(cons);
				amt = Math.round(target.mhp * ((res ?? 0) * 0.01));
				break;
			}
			case "mult-stack": {
				damageOrder = "stackMult";
				if (cons.amount == undefined) {amt= 0; break;}
				const res = this.resolveConsAmount(cons);
				amt = res ?? 1;
				break;
			}
			default:
				cons satisfies never;
				return this;
		}
		if (cons.amount) {
			const effectName = cons.realSource
				? cons.realSource?.displayedName
				: cons.source
				? cons.source?.displayedName?.toString()
				?? "Unknown Source"
				: "Unknown Source";
			this.add(damageOrder, amt ?? 0, effectName);
		}
		if (this.damageType == "healing") {
			this.#resisted= false;
			this.#absorbed= true;
		}
		if (cons.calc && cons.calc instanceof DamageCalculation) {
			this.merge(cons.calc);
		}
		return this;
	}

	resolveConsAmount (cons: EnhancedSourcedConsequence<DamageConsequence> & {amount: ConsequenceAmount}) : U<number> {
		const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
		const contextList = {};
		const resolvedCE = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, contextList);
		return resolvedCE;

}

	isMergeable( other: DamageCalculation) : boolean {
		return this.target == other.target && this.damageType == other.damageType;
	}

	add (dOrder : DamageOrder, val: number, name: string): DamageCalculation {
		switch (dOrder) {
			case "multiplier":
				if (val > 1) {
					val = val - 1;
					this.lists[dOrder].push({
						amt: val,
						name
					});
				} else {
					this.lists["divisor"].push({
						amt: val,
						name
					});
				}
				break;
			default:
				this.lists[dOrder].push({
					amt: val,
					name
				});
				break;
		}
		return this;
	}

	merge(other : DamageCalculation) : typeof this {
		for (const k of Object.keys(this.lists)) {
			const dOrder= k as keyof DamageCalculation["lists"];
			this.lists[dOrder] = this.lists[dOrder].concat(other.lists[dOrder]);
		}
		if (this.damageType === null) {
			this.damageType = other.damageType;
		}
		this.#absorbed = this.#absorbed || other.#absorbed;
		this.#weakness = this.#weakness || other.#weakness;
		this.#applyEvenBonus = this.#applyEvenBonus || other.#applyEvenBonus;
		this.#resisted = this.#resisted || other.#resisted;
		this.#blocked = this.#blocked || other.#blocked;
		this.#minValue = this.#minValue == 0 ? other.#minValue : this.#minValue;
		return this;
	}

	clone(): DamageCalculation {
		const dc = new DamageCalculation(this.damageType);
		return dc.merge(this);
	}

	eval(): EvaluatedDamage {
		const str = [] as string[];
		let total = 0;
		let subtotal = 0;
		for (const {amt, name} of this.lists.base) {
			if (amt == 0) {continue;}
			subtotal += amt;
			const dataString = `${signed(amt)} ${name}`;
			str.push(dataString);
		}
		if (this.#applyEvenBonus) {
			for (const {amt, name} of this.lists.evenBonus) {
				if (amt == 0) {continue;}
				subtotal += amt;
				const dataString = `${signed(amt)} ${name}`;
				str.push(dataString);
			}
		}
		total += subtotal;
		str.push(`${Math.round(subtotal)} --- Subtotal`);
		for (const {amt, name} of this.lists.multiplier) {
			const addAmt = amt * subtotal;
			str.push(`${signed(Math.round(addAmt))} ${name}(${amt+1})`);
			total+= addAmt;
		}
		if (this.lists.multiplier.length) {
			const subtotal2 = Math.round(total);
			str.push(`${subtotal2} --- Subtotal`);
		}
		let divisor = 1;
		for (const {amt, name} of this.lists.divisor) {
			divisor *= amt;
			str.push(`* ${amt} ${name}`);
		}
		total *= divisor;
		if (this.lists.divisor.length) {
			const subtotal3  = Math.round(total);
			str.push(`${subtotal3} --- Subtotal`);
		}
		let mult = 1;
		for (const {amt, name} of this.lists.stackMult) {
			mult *= amt;
			str.push(`* ${amt} ${name}`);
		}
		total *= mult;
		if (this.lists.stackMult.length) {
			const subtotal4  = Math.round(total);
			str.push(`${subtotal4} --- Subtotal`);
		}
		if (!this.#absorbed && total > 0) {
			for (const {amt, name} of this.lists.resist) {
				if (amt == 0) {continue;}
				total += amt;
				const dataString = `${signed(amt)} ${name}`;
				str.push(dataString);
			}
		}
		for (const {amt, name} of this.lists.nonMultPostAdd) {
			total += amt;
			const dataString = `+${amt} ${name}`;
			str.push(dataString);
		}
		if (this.#resisted) {
			const RESISTMULT = 0.5;
			str.push(`* ${RESISTMULT} Damage Resistance`);
			total *= RESISTMULT;
		}
		total = Math.max(Math.round(total));
		str.push(`${total} --- Total`);
		total = Math.max(this.#minValue, total);

		let hpChange = total * (this.#absorbed ? 1 : -1) * (this.#blocked ? 0 : 1);
		if (hpChange == undefined || typeof hpChange != "number" ||  Number.isNaN(hpChange)) {
			PersonaError.softFail("Hp change isn't a number");
			hpChange = -1;
		}
		const damageType = this.damageType ? this.damageType : "none";
		return { hpChange, str, damageType,
			resisted: this.#resisted,
			absorbed: this.#absorbed,
			weakness: this.#weakness,
		};
	}
}

type DamageOrder = keyof DamageCalculation["lists"];

type DamageObj = {
	name: string;
	amt: number;
}

export type EvaluatedDamage = {
	/** need to factor in absorbing separately somewhere else and reverse sign*/
	hpChange: number;
	str: string[];
	damageType: RealDamageType;
	resisted: boolean;
	weakness: boolean;
	absorbed: boolean;
};

function signed(num: number) : string {
	if (num > 0) {return `+${num}`;}
	else {return `${num}`;}
}

export class DamageCalculator {
	static BASE_VARIANCE = 2 as const;

	static weaponSkillDamage(weaponPower:ItemSubtype<Power, "weapon">) : NewDamageParams {
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

	static magicSkillDamage(magic: ItemSubtype<Power, "magic">) : Readonly<NewDamageParams> {
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
				const isHealing = magic.system.dmg_type == "healing";
				const val = DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE[magic.system.damageLevel];
				if (isHealing) {
					return {
						extraVariance: val.extraVariance + 1,
						baseAmt: val.baseAmt,
					};
				}
				return val;
			}
		}
	}

	static convertFromOldLowDamageToNewBase(low: number) : number {
		return this.getWeaponDamageByWpnLevel(low-1);
	}

	static getWeaponDamageByWpnLevel(lvl: number) : number {
		const val =  WEAPON_LEVEL_TO_DAMAGE[lvl];
		if (val) {return val;}
		return 0;
	}

	static getArmorDRByArmorLevel(lvl: number) : number {
		const ARMOR_DIVISOR = 0.80;
		const val =  WEAPON_LEVEL_TO_DAMAGE[lvl];
		if (val) {return Math.floor(val * ARMOR_DIVISOR);}
		return 0;
	}

}

const DAMAGE_LEVEL_CONVERT_WEAPON = {
	"none": {extraVariance: 0, baseAmt: 0},
	"miniscule": {extraVariance: 0, baseAmt: 0},
	"basic": {extraVariance: 0, baseAmt: 0},
	"light": {extraVariance: 1, baseAmt: 10},
	"medium": {extraVariance: 2, baseAmt: 25},
	"heavy": {extraVariance: 2, baseAmt: 50},
	"severe": {extraVariance: 3, baseAmt: 85},
	"colossal": {extraVariance: 3, baseAmt: 130},
} as const satisfies Readonly<Record<ConvertableDamageLevel, NewDamageParams>> ;


const DAMAGE_LEVEL_CONVERT_MAGIC_DAMAGE = {
	"none": {extraVariance: 0, baseAmt: 0},
	"miniscule": {extraVariance: 0, baseAmt: 0},
	"basic": {extraVariance: 0, baseAmt: 0},
	"light": {extraVariance: 1, baseAmt: 10},
	"medium": {extraVariance: 2, baseAmt: 30},
	"heavy": {extraVariance: 2, baseAmt: 60},
	"severe": {extraVariance: 3, baseAmt: 90},
	"colossal": {extraVariance: 3, baseAmt: 130},
} as const satisfies Readonly<Record< ConvertableDamageLevel, NewDamageParams>>;

type ConvertableDamageLevel = Exclude<DamageLevel, "-" | "fixed">;



const INSTANT_KILL_LEVELS_LIST= [
	"none",
	"low",
	"medium",
	"high",
	"always"
] as const;

export type InstantKillLevel = typeof INSTANT_KILL_LEVELS_LIST[number];

export const INSTANT_KILL_LEVELS = HTMLTools.createLocalizationObject( INSTANT_KILL_LEVELS_LIST, "persona.powers.instantKillLevels");


export const INSTANT_KILL_CRIT_BOOST : Record< InstantKillLevel, number>= {
	none: 0,
	high: 11,
	low: 5,
	medium: 8,
	always: 1000,
};

export const AILMENT_BONUS_LEVELS : Record <InstantKillLevel, number> = {
	none: 0,
	high: 11,
	low: 5,
	medium: 8,
	always: 11,//treat as always
};

export type NewDamageParams = {
	baseAmt: number,
	extraVariance: number,
};

//formual start at 6, then to get further levels , add (newlvl+1) to previous value
const WEAPON_LEVEL_TO_DAMAGE: Record<number, number> = {
	0: 10,
	1: 14,
	2: 18,
	3: 24,
	4: 32,
	5: 42,
	6: 54,
	7: 68,
	8: 84,
	9: 102,
	10: 122,
	11: 144,
	12: 168,
};



