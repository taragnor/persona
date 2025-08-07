import { SourcedConsequence } from "../../config/consequence-types.js";
import { ValidAttackers } from "./persona-combat.js";
import { RealDamageType } from "../../config/damage-types.js";
import { DamageConsequence } from "../../config/consequence-types.js";
import { OldDamageConsequence } from "../../config/consequence-types.js";
import { DamageType } from "../../config/damage-types.js";

export class DamageCalculation {
	#resisted: boolean = false;
	#absorbed: boolean = false;
	#weakness: boolean = false;
	amt: DamageObj[] = [];
	multiplier: DamageObj[] = [];
	divisor: DamageObj[] = [];
	nonMultPostAdd: DamageObj[] = [];
	damageType : RealDamageType;
	target: ValidAttackers;

	constructor (dtype : RealDamageType) {
		this.damageType = dtype;
	}

	addDamageConsOldForm(cons: SourcedConsequence<OldDamageConsequence>, target: ValidAttackers, defaultDamageType: DamageType) : DamageCalculation {
		const newForm = DamageCalculation.convertToNewFormConsequence(cons, defaultDamageType);
		this.addConsequence(newForm, target);
		return this;

	}

	setHitWeakness() {
		this.#weakness = true;
	}

	setAbsorbed() {
		this.#absorbed = true;
	}

	setResisted() {
		this.#resisted = true;
	}


	static convertToNewFormConsequence( cons: SourcedConsequence<OldDamageConsequence>, defaultDamageType: DamageType) : SourcedConsequence<DamageConsequence> {
		let st : DamageConsequence["damageSubtype"];
		let dtype = cons.damageType != undefined ? cons.damageType : defaultDamageType;
		switch (cons.type) {
			case "dmg-high":
				st = "high";
				break;
			case "dmg-low":
				st = "low";
				break;
			case "absorb":
				st = "constant";
				break;
			case "dmg-mult":
				st ="multiplier";
				break;
			case "dmg-allout-low":
				st = "allout-low";
				break;
			case "dmg-allout-high":
				st = "allout-high";
				break;
			case "revive":
				st = "percentage";
				dtype = "healing";
				break;
			case "hp-loss":
				st ="constant";
				dtype = "none";
				break;
		}
		return {
			type: "damage-new",
			damageSubtype: st,
			source: cons.source,
			damageType: dtype,
			amount: cons.amount ?? 0,
		};
	}

	addConsequence(cons: SourcedConsequence<DamageConsequence>, target: ValidAttackers): DamageCalculation {
		let damageOrder: DamageOrder;
		let amt : number;
		switch (cons.damageSubtype) {
			case "multiplier":
				damageOrder = "multiplier";
				amt = cons.amount;
				break;
			case "odd-even":
			case "high":
			case "low":
			case "allout-low":
			case "allout-high":
			case "constant":
				damageOrder= "base";
				amt = cons.amount ?? 0;
				break;
			case "percentage":
				damageOrder = "nonMultPostAdd";
				amt = Math.round(target.mhp * (cons.amount ?? 0.01));
				break;
			default:
					cons satisfies never;
				return this;
		}
		if (cons.amount) {
			const effectName = cons.source?.displayedName?.toString() ?? "Unknown Source";
			this.add(damageOrder, amt ?? 0, effectName);
		}
		// if (cons.damageCalc) {
		// 	this.merge(cons.damageCalc);
		// }
		if (cons.absorbed) {
			this.setAbsorbed();
		}
		return this;
	}

	isMergeable( other: DamageCalculation) : boolean {
		return this.target == other.target && this.damageType == other.damageType;
	}

	add (dOrder : DamageOrder, val: number, name: string): DamageCalculation {
		switch (dOrder) {
			case "base":
				this.amt.push({
						amt: val,
						name
				});
				break;
			case "multiplier":
				if (val > 1) {
					val = val - 1;
					this.multiplier.push({
						amt: val,
						name
					});
				} else {
					this.divisor.push( {
						amt: val,
						name
					});
				}
				break;
			case "nonMultPostAdd":
				this.nonMultPostAdd.push({
					amt: val,
					name
				});
				break;
			default:
				dOrder satisfies never;
				break;
		}
		return this;
	}

	merge(other :DamageCalculation) : DamageCalculation {
		this.amt = this.amt.concat(other.amt);
		this.multiplier = this.multiplier.concat(other.multiplier);
		this.divisor = this.divisor.concat(other.divisor);
		this.nonMultPostAdd = this.nonMultPostAdd.concat(other.nonMultPostAdd);
		return this;
	}

	eval(): EvaluatedDamage {
		const str = [] as string[];
		let total = 0;
		let subtotal = 0;
		for (const {amt, name} of this.amt) {
			subtotal += amt;
			const dataString = `+${amt} ${name}`;
			str.push(dataString);
		}
		total += subtotal;
		str.push(`${Math.round(subtotal)} --- Subtotal`);
		for (const {amt, name} of this.multiplier) {
			const addAmt = amt * subtotal;
			str.push(`+${Math.round(addAmt)} ${name}(${amt+1})`);
			total+= addAmt;
		}
		const subtotal2 = Math.round(total);
		if (this.multiplier.length) {
		str.push(`${subtotal2} --- Subtotal 2 `);
		}
		let divisor = 1;
		for (const {amt, name} of this.divisor) {
			divisor *= amt;
			str.push(`* ${amt} ${name}`);
		}
		total *= divisor;
		const subtotal3  = Math.round(total);
		if (this.divisor.length) {
			str.push(`${subtotal3} --- Subtotal 3`);
		}
		for (const {amt, name} of this.nonMultPostAdd) {
			total += amt;
			const dataString = `+${amt} ${name}`;
			str.push(dataString);
		}
		total = Math.round(total);
		str.push(`${total} --- Total`);
		if (!this.#absorbed) {
			total *= -1;
		}
		const hpChange = total;
		return { hpChange, str, damageType: this.damageType,
			resisted: this.#resisted,
			absorbed: this.#absorbed,
			weakness: this.#weakness,
		};
	}
}

const DAMAGE_ORDER_LIST = [
	"base",
	"multiplier",
	"nonMultPostAdd",
] as const;

type DamageOrder = typeof DAMAGE_ORDER_LIST[number];

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
