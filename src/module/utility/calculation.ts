import {ModifierList} from "../combat/modifier-list.js";

export class Calculation {

	#priorityLevelsMax : number = Calculation.priorityMax();

	data : CalcList[] = [];
	initial: number;

	static priorityMax(): number { return 10;}

	constructor(initial = 0, maxPriorityLevels = Calculation.priorityMax()) {
		this.initial = initial;
		this.#priorityLevelsMax = maxPriorityLevels;
	}

	maxPriorityLevels(): number {
		return this.#priorityLevelsMax;
	}

	add(priority: number, amt: CalculationNumber["amt"], name: CalculationNumber["name"], operation: keyof CalcList) {
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
	}


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

	eval(situation ?: Situation) : EvaluatedCalculation {
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
				const modString = `${signed(addVal)} (*${amt} (${name})`;
				strings.push(modString);
				subtotal += addVal;
			}
			total+= subtotal;
			if (noStackMultiply.length) {
				strings.push(`${Math.round(total)} Subtotal`);
			}

			for (const {name, amt} of multiply) {
				const modString = `*${amt} (${name})`;
				strings.push(modString);
				total *= amt;
			}
			if (multiply.length) {
				strings.push(`${Math.round(total)} Subtotal`);
			}
			for (const {name, amt} of add) {
				const modString = `${signed(amt)} (${name})`;
				strings.push(modString);
				total += amt;
			}
			if (add.length) {
				strings.push(`${Math.round(total)} Subtotal`);
			}
		}
		strings.push(`${Math.round(total)} Total`);
		return {
			total,
			steps: strings
		} satisfies EvaluatedCalculation;
	}

	resolveModifierLists(cList: CalcList, situation ?: Situation) : Record<keyof CalcList, ResolvedCalculationNumber[]> {
		const entries = Object.entries(cList).map( ([k, arr]) => {
			const revised = arr.flatMap( entry => {
				if (typeof entry.amt == "number") {return entry;}
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

type CalcList = {
	multiply: CalculationNumber[],
	add: CalculationNumber[],
	noStackMultiply: CalculationNumber[],
}

type CalculationNumber = {
	name: string,
	amt: number | ModifierList,
}

type ResolvedCalculationNumber = {
	name: string,
	amt: number,
}

type EvaluatedCalculation = {
	total: number,
	steps: string[],
}

function signed(num: number) : string {
	if (num > 0) {return `+${num}`;}
	else {return `${num}`;}
}

