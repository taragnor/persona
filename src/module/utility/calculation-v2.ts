import {ConsequenceAmountV2} from "../../config/consequence-types.js";
import {ConsequenceAmountResolver} from "../conditionalEffects/consequence-amount.js";
import {HTMLTools} from "./HTMLTools.js";

export class CalculationV2 {
	data : CalcList[] = [];

	constructor(initial = 0) {
    if (initial != 0) {
      this.data.push( {
        op: "set",
        amt: initial,
        priority: 0,
        name: "Initial",
        calculationOptions: {},
      });
    }
	}

	add(priority: number, amt: CalculationNumber["amt"], name: CalculationNumber["name"]) : this {
		return this.setTerm(priority, amt, name, "add");
	}

  sub(priority: number, amt: CalculationNumber["amt"], name: CalculationNumber["name"]) : this {
    return this.setTerm(priority, amt, name, "sub");
  }


  div(priority: number, amt: CalculationNumber["amt"], name: CalculationNumber["name"]): this {
    return this.setTerm(priority, amt, name, "divide");
  }

  set(priority: number, amt: CalculationNumber["amt"], name: CalculationNumber["name"]): this {
    return this.setTerm(priority, amt, name, "set");
  }

  mult(priority: number, amt: CalculationNumber["amt"], name: CalculationNumber["name"]) : this {
    return this.setTerm(priority, amt, name, "multiply");
  }

	setTerm(priority: number, amt: CalculationNumber["amt"], name: CalculationNumber["name"], operation: CalcList["op"], options : CalculationOptions = {}) : this {
    const item = {
      op: operation,
      priority,
      name,
      amt,
      calculationOptions: options,
    } satisfies typeof this.data[number] ;
    this.data.push( item);
    return this;
	}

	/** merges another calculation into the current one*/
	merge( other: Readonly<CalculationV2>) : this {
    this.data.push(...other.data);
    return this;
	}

  eval(situation ?: Situation, _options= {hideTotals: false}) : EvaluatedCalculation {
    const steps : string[] = [];
    this.sortPriorities();
    this.propagateOptions();
    let total = 0;
    const resolvedData= this.data.map ( entry => {
      const resolved = this.resolveCalculationNumber(entry, situation);
      return {
        ...entry,
        name: resolved ? resolved.name : `ERROR: ${entry.name}`,
        amt: resolved ? resolved.amt: 0,
        error: resolved == null,
      };
    });
    const priorityGroups = this.divideIntoPriorityGroups(resolvedData);
    for (const group of priorityGroups) {
      group.sort ((a, b) => b.amt - a.amt);
      group.forEach( (item, i) => {
        if (item.error) {
          steps.push(`ERROR on ${item.name} ${item.op}`);
          return;
        }
        if (item.calculationOptions.takeBest)  {
          if (i >= item.calculationOptions.takeBest) {
            return;
          }
        }
        total = this.applyCalcItem(total, item.op, item.amt);
        steps.push(this.getStepExplanation(total, item, item.amt));
      });
      steps.push(`Subtotal: ${total}`);
    }
    return {
      steps: steps,
      total,
    };
  }

  private applyCalcItem(lastTotal: number, operation: CalculationOperation, amt : number) : number {
    const operand = amt;
    switch (operation) {
      case "set":  {
        return operand;
      }
      case "add":
        return lastTotal + operand;
      case "sub":
        return lastTotal - operand;
      case "divide":
        return lastTotal / operand;
      case "multiply":
        return lastTotal * operand;
    }

  }

  private getStepExplanation(_lastTotal: number, calc: typeof this.data[number], amt : number) : string {
    const operand = amt;
    switch (calc.op) {
      case "set":  {
        return `SET ${operand} (${calc.name})`;
      }
      case "add":
        return `+ ${operand} (${calc.name})`;
      case "sub":
        return `- ${operand} (${calc.name})`;
      case "divide":
        return `/ ${operand} (${calc.name})`;
      case "multiply":
        return `* ${operand} (${calc.name})`;
    }

  }

  private divideIntoPriorityGroups<T extends Pick<CalcList, "op" | "priority">>(arr: T[]) : T[][] {
    if (arr.length == 0) {return [];}
    const retarr= [] as T[][];
    let currentArr = [] as T[];
    let lastPriority : U<CalcList["priority"]> = undefined;
    let lastOp : U<CalcList["op"]> = undefined;
    for (const data of arr) {
      if (lastPriority == data.priority
        && lastOp == data.op) {
        currentArr.push(data);
      } else {
        if (currentArr.length) {
          retarr.push(currentArr);
        }
        currentArr = [data];
        lastOp = data.op;
        lastPriority = data.priority;
      }
    }
    if (currentArr.length) {
      retarr.push(currentArr);
    }
    return retarr;
  }

  private sortPriorities() {
    this.data.sort ( (a,b) => {
      if (a.priority != b.priority) {
        return a.priority - b.priority;
      }
      if (a.op != b.op) {
        const OrderVal = (op: CalculationOperation) => OPERATION_ORDER_LIST.indexOf(op);
        return OrderVal(a.op) - OrderVal(b.op);
      }
      return 0;
    });
  }

  /** normalizes options among objects of the same priority level where needed*/
  private propagateOptions() {
    for (const d of this.data) {
      if (!d.calculationOptions) {continue;}
      if (d.calculationOptions.takeBest) {
        this.data
          .filter( item => item.priority == d.priority && d.op == item.op)
          .forEach( item=> {
            item.calculationOptions.takeBest = Math.min(item?.calculationOptions?.takeBest ?? Infinity, d.calculationOptions?.takeBest ?? Infinity);
          });
      }
    }
  }

	// eval(situation ?: Situation, hideTotals= false) : EvaluatedCalculation {
	// 	const strings : string[] = [];
	// 	let total = this.initial ?? 0;
	// 	if (this.initial != 0) {
	// 		strings.push(`${this.initial} Initial Value`);
	// 	}
	// 	const maxLevels = this.maxPriorityLevels();
	// 	for (let lvl = 0; lvl < maxLevels; lvl++) {
	// 		if (this.data[lvl] == undefined) {continue;}
	// 		const {multiply, add, noStackMultiply } = this.resolveCalculationNumbers(this.data[lvl], situation);
	// 		let subtotal = 0;
	// 		for (const {name, amt} of noStackMultiply) {
	// 			const addVal = amt * total;
	// 			const modString = `${signed(addVal)} (*${+amt.toFixed(2)} (${name})`;
	// 			strings.push(modString);
	// 			subtotal += addVal;
	// 		}
	// 		total += subtotal;
	// 		if (noStackMultiply.length && !hideTotals) {
	// 			strings.push(`${Math.round(total)} Subtotal`);
	// 		}

	// 		for (const {name, amt} of multiply) {
	// 			const modString = `*${+amt.toFixed(2)} (${name})`;
	// 			strings.push(modString);
	// 			total *= amt;
	// 		}
	// 		if (multiply.length && !hideTotals) {
	// 			strings.push(`${Math.round(total)} Subtotal`);
	// 		}
	// 		for (const {name, amt} of add) {
	// 			const modString = `${signed(amt)} (${name})`;
	// 			strings.push(modString);
	// 			total += amt;
	// 		}
	// 		if (add.length && !hideTotals) {
	// 			strings.push(`${Math.round(total)} Subtotal`);
	// 		}
	// 	}
	// 	if (!hideTotals) {
	// 		strings.push(`${Math.round(total)} Total`);
	// 	}
	// 	switch (this._finalizeStep) {
	// 		case "rounded":
	// 			total = Math.round(total);
	// 			break;
	// 		case "raw":
	// 			break;
	// 		case "floor":
	// 			total = Math.floor(total);
	// 			break;
	// 		default:
	// 			this._finalizeStep satisfies never;
	// 	}
	// 	return {
	// 		total,
	// 		steps: strings
	// 	} satisfies EvaluatedCalculation;
	// }

	// resolveCalculationNumbers(cList: CalcList, situation ?: Situation) : Record<keyof CalcList, ResolvedCalculationNumber[]> {
	// 	const entries = Object.entries(cList).map( ([k, arr]) => {
	// 		const revised = arr.flatMap( entry => {
	// 			const flip = entry.flipSign ? -1 : 1;
	// 			if (typeof entry.amt == "number") {return {
	// 				amt: entry.amt * flip,
	// 				name: entry.name,
	// 				entry
	// 			};}
	// 			if (entry.amt instanceof Calculation) {
	// 				const evaluated = entry.amt.eval(situation, true);
	// 				const stepsStr = evaluated.steps
	// 				.join (", ");
	// 				return {
	// 					amt: evaluated.total * flip,
	// 					name: `${entry.name} (${stepsStr})`,
	// 				} satisfies ResolvedCalculationNumber;
	// 			}
	// 			if (!situation) {throw new Error("No situation provided yet this calculation contains a modifier List");}
	// 			const list = entry.amt.list(situation);
	// 			return list.map( ([val, txt]) =>
	// 				({
	// 					amt: ModifierList.resolveModifier(val, situation) * flip,
	// 					name: txt,
	// 				} satisfies ResolvedCalculationNumber)
	// 			);
	// 		});
	// 		return [k, revised];
	// 	});
	// 	return Object.fromEntries(entries) as Record<keyof CalcList, ResolvedCalculationNumber[]>;
	// }
// }

  resolveCalculationNumber(entry : typeof this.data[number], situation ?: Situation) : N<ResolvedCalculationNumber> {
    if (typeof entry.amt == "number") {
      return { amt: entry.amt, name: entry.name};
    }
    if ("type" in entry.amt) {
      if (!situation) {
        throw new Error("No situation provided with Consequence Number");
      }
      const amt = ConsequenceAmountResolver.resolveConsequenceAmount(entry.amt, situation);
      if (!amt) {return null;}
      return { amt, name: entry.name };
    }
    if ("calc" in entry.amt) {
      const evaluated = entry.amt.eval(situation, {
        hideTotals: true
      });
      if (evaluated == null)  {
        return null;
      }
      const stepsStr = evaluated.steps
        .join (", ");
      return {
        amt: evaluated.total,
        name: `${entry.name} (${stepsStr})`,
      } satisfies ResolvedCalculationNumber;
    }
    return null;
  }
}

type CalcList = {
  op: CalculationOperation,
  priority: number,
} & CalculationNumber;

// type CalcList = Record<CalculationOperation, CalculationNumber[]>;

const OPERATION_ORDER_LIST = [
  "set",
  "add",
  "sub",
  "multiply",
  "divide",
] as const satisfies CalculationOperation[];

const OPERATION_TYPE_LIST = [
	"add",
  "sub",
  "divide",
	"multiply",
  "set",
] as const;

export const CALCULATION_OPERATION = HTMLTools.createLocalizationObject(OPERATION_TYPE_LIST, "persona.calculation.operation");

export type CalculationOperation = typeof OPERATION_TYPE_LIST[number];

type CalculationNumber = {
	name: string,
	// amt: number | ModifierList | CalculationV2,
  amt: number | Sourced<ConsequenceAmountV2> | Calculateable
  calculationOptions: CalculationOptions;
};

interface CalculationOptions {
    takeBest?: number,

}

export interface Calculateable {
  eval(situation?: Situation, options?: object) : N<EvaluatedCalculation>;
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

