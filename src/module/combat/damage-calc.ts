import { PersonaError } from "../persona-error.js";
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
	#blocked : boolean = false;
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

	setDamageType(dtype : RealDamageType) {
		this.damageType = dtype;
	}

	setApplyEvenBonus() {
		this.#applyEvenBonus = true;
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
		let amount = cons.amount ?? 0;
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
				if (amount < 1) {
					amount *= 100;
				}
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
			amount: amount,
			calc: cons.calc,
		};
	}

	addConsequence(cons: SourcedConsequence<DamageConsequence>, target: ValidAttackers): DamageCalculation {
		let damageOrder: DamageOrder;
		let amt : number;
		if (cons.modifiers) {
			for (const mod of cons.modifiers) {
				switch (mod) {
					case "blocked":
						this.#blocked = true;
					case "absorbed":
						this.#absorbed = true;
					case "resisted":
						this.#resisted = true;
				}
			}
		}
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
				amt = Math.round(target.mhp * (cons.amount * 0.01));
				break;
			case "mult-stack":
					damageOrder = "stackMult";
				amt = cons.amount ?? 1;
				break;
			default:
					cons satisfies never;
				return this;
		}
		if (cons.amount) {
			const effectName = cons.source?.displayedName?.toString() ?? "Unknown Source";
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
		this.#absorbed = this.#absorbed || other.#absorbed;
		this.#weakness = this.#weakness || other.#weakness;
		this.#applyEvenBonus = this.#applyEvenBonus || other.#applyEvenBonus;
		this.#resisted = this.#resisted || other.#resisted;
		this.#blocked = this.#blocked || other.#blocked;
		return this;
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
		total = Math.max(0, Math.round(total));
		str.push(`${total} --- Total`);
		let hpChange = total * (this.#absorbed ? 1 : -1) * (this.#blocked ? 0 : 1);
		if (hpChange == undefined || typeof hpChange != "number" ||  Number.isNaN(hpChange)) {
			PersonaError.softFail("Hp change isn't a number");
			hpChange = -1;
		}
		return { hpChange, str, damageType: this.damageType,
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
