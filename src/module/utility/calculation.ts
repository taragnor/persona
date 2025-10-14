import {ModifierList} from "../combat/modifier-list.js";
import {HTMLTools} from "./HTMLTools.js";

export class Calculation {

	#priorityLevelsMax : number = Calculation.priorityMax();
	_finalizeStep : "rounded" | "raw" | "floor" = "rounded";
	data : CalcList[] = [];
	initial: number;
	_invert : boolean = false; //not yet supported

	static priorityMax(): number { return 10;}

	constructor(initial = 0, maxPriorityLevels = Calculation.priorityMax()) {
		this.initial = initial;
		this.#priorityLevelsMax = maxPriorityLevels;
	}

	maxPriorityLevels(): number {
		return this.#priorityLevelsMax;
	}

	add(priority: number, amt: CalculationNumber["amt"], name: CalculationNumber["name"], operation: keyof CalcList = "add") {
		const safePriority = Math.clamp(priority, 0, this.#priorityLevelsMax);
		if (safePriority != priority) {
			throw new Error(`Priority ${priority} is out of range for this calculation (max ${this.#priorityLevelsMax}`);
		}
		let arr = this.data[priority];
		if (arr == undefined) {
			arr = {
				multiply: [],
				add: [],
				noStackMultiply: [],
			} satisfies CalcList;
			this.data[priority] = arr;
		}
		arr[operation].push( {name, amt});
		return this;
	}


	/** merges another calculation into the current one*/
	merge( other: Readonly<Calculation>) : this {
		this.#priorityLevelsMax = Math.max(this.#priorityLevelsMax, other.maxPriorityLevels());
		for (let lvl = 0; lvl < this.maxPriorityLevels(); lvl++) {
			if (this.data[lvl] == undefined) {
				this.data[lvl] = other.data[lvl];
				continue;
			}
			if (other.data[lvl] == undefined) {
				continue;
			}
			this.data[lvl]["add"].push(...other.data[lvl].add);
			this.data[lvl].multiply.push(...other.data[lvl].multiply);
			this.data[lvl].noStackMultiply.push(...other.data[lvl].noStackMultiply);
		}
		return this;
	}

	/** not yet supported */
	#invert() : Calculation {
		this._invert = !this._invert;
		return this;
	}

	eval(situation ?: Situation, hideTotals= false) : EvaluatedCalculation {
		const strings : string[] = [];
		let total = this.initial ?? 0;
		if (this.initial != 0) {
			strings.push(`${this.initial} Initial Value`);
		}
		const maxLevels = this.maxPriorityLevels();
		for (let lvl = 0; lvl < maxLevels; lvl++) {
			if (this.data[lvl] == undefined) {continue;}
			const {multiply, add, noStackMultiply } = this.resolveModifierLists(this.data[lvl], situation);
			let subtotal = 0;
			for (const {name, amt} of noStackMultiply) {
				const addVal = amt * total;
				const modString = `${signed(addVal)} (*${+amt.toFixed(2)} (${name})`;
				strings.push(modString);
				subtotal += addVal;
			}
			total += subtotal;
			if (noStackMultiply.length && !hideTotals) {
				strings.push(`${Math.round(total)} Subtotal`);
			}

			for (const {name, amt} of multiply) {
				const modString = `*${+amt.toFixed(2)} (${name})`;
				strings.push(modString);
				total *= amt;
			}
			if (multiply.length && !hideTotals) {
				strings.push(`${Math.round(total)} Subtotal`);
			}
			for (const {name, amt} of add) {
				const modString = `${signed(amt)} (${name})`;
				strings.push(modString);
				total += amt;
			}
			if (add.length && !hideTotals) {
				strings.push(`${Math.round(total)} Subtotal`);
			}
		}
		if (!hideTotals) {
			strings.push(`${Math.round(total)} Total`);
		}
		switch (this._finalizeStep) {
			case "rounded":
				total = Math.round(total);
				break;
			case "raw":
				break;
			case "floor":
				total = Math.floor(total);
				break;
			default:
				this._finalizeStep satisfies never;
		}
		return {
			total,
			steps: strings
		} satisfies EvaluatedCalculation;
	}

	resolveModifierLists(cList: CalcList, situation ?: Situation) : Record<keyof CalcList, ResolvedCalculationNumber[]> {
		const entries = Object.entries(cList).map( ([k, arr]) => {
			const revised = arr.flatMap( entry => {
				if (typeof entry.amt == "number") {return entry;}
				if (entry.amt instanceof Calculation) {
					const evaluated = entry.amt.eval(situation, true);
					const stepsStr = evaluated.steps
					.join (", ");
					return {
						amt: evaluated.total,
						name: `${entry.name} (${stepsStr})`,
					};
				}
				if (!situation) {throw new Error("No situation provided yet this calculation contains a modifier List");}
				const list = entry.amt.list(situation);
				return list.map( ([val, txt]) =>
					({
						amt: val,
						name: txt
					} satisfies ResolvedCalculationNumber)
				);
			});
			return [k, revised];
		});
		return Object.fromEntries(entries) as Record<keyof CalcList, ResolvedCalculationNumber[]>;
	}
}

type CalcList = Record<CalculationOperation, CalculationNumber[]>;

const OPERATION_TYPE_LIST = [
	"add",
	"multiply",
	"noStackMultiply",
] as const;

export const CALCULATION_OPERATION = HTMLTools.createLocalizationObject(OPERATION_TYPE_LIST, "persona.calculation.operation");

export type CalculationOperation = typeof OPERATION_TYPE_LIST[number];

type CalculationNumber = {
	name: string,
	amt: number | ModifierList | Calculation,
}

type ResolvedCalculationNumber = {
	name: string,
	amt: number,
}

export type EvaluatedCalculation = {
	total: number,
	steps: string[],
}

function signed(num: number) : string {
	if (num > 0) {return `+${num}`;}
	else {return `${num}`;}
}

