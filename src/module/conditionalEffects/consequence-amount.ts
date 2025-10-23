import {ConsequenceAmount, ConsequenceAmountV2} from "../../config/consequence-types.js";
import {PersonaAE} from "../active-effect.js";
import {TargettingContextList} from "../combat/persona-combat.js";
import {PersonaItem} from "../item/persona-item.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaVariables} from "../persona-variables.js";

export class ConsequenceAmountResolver {

	static extractSourcedAmount<T extends Sourced<object> & {amount: ConsequenceAmount}> (cons: T) : number | Sourced<ConsequenceAmountV2> {
		return this.extractSourcedFromField(cons, "amount");
	}

	static extractSourcedValue <T extends SourcedConsequence & {value: ConsequenceAmount}> (cons: T) : number  | Sourced<ConsequenceAmountV2> {
		return this.extractSourcedFromField(cons, "value");
	}

	static extractSourcedFromField <FieldName extends string, T extends (Sourced<object> & Record<FieldName, ConsequenceAmount>)> (cons: T, fieldName: FieldName) : number | Sourced<ConsequenceAmountV2> {
		const val = cons[fieldName];
		if (typeof val == "number") {return val;}
		const x : ConsequenceAmountV2 = val; //needed for TS to figure it out;
		return {
			owner: cons.owner,
			source: cons.source,
			realSource: cons.realSource,
			...x,
		};
	}

	static resolveConsequenceAmount< C extends ConsequenceAmount>(amt: C extends object ? Sourced<C> : number, contextList: Partial<TargettingContextList>) : U<number> {
		if (typeof amt == "number") {return amt;}
		return this.resolveConsequenceAmountV2(amt, contextList, amt.source);
	}

static resolveConsequenceAmountV2< C extends ConsequenceAmountV2>(amt: C, contextList: Partial<TargettingContextList>, source: Sourced<ConsequenceAmountV2>["source"]) : U<number> {
	switch (amt.type) {
		case "operation": {
			return this.resolveOperation(amt, contextList, source);
		}
		case "constant":
			return amt.val;
		case "variable-value":
				return PersonaVariables.getVariable(amt, contextList) ?? 0;
		case "random-range": {
			const rand = Math.floor(amt.min + Math.random() * (amt.max - amt.min));
			return rand;
		}
		case "item-property": {
			return this.resolveItemProperty(amt, contextList, source);
		}
		case "situation-property": {
			return this.resolveSituationProperty(amt, contextList, source);
		}
		case "actor-property": {
			return this.resolveActorProperty(amt, contextList, source);
		}
		default:
				amt satisfies never;
			PersonaError.softFail(`Unknwon consequence Amount type :${amt["type"] as string}`);
			return undefined;
	}
}

private static resolveSituationProperty(amt: ConsequenceAmountV2 & {type: "situation-property"}, list: Partial<TargettingContextList> , _source: Sourced<ConsequenceAmountV2>["source"]): U<number> {
	const situation = list.situation;
	if (!situation) {return undefined;}
	switch (amt.property) {
		case "damage-dealt":
			return ("amt" in situation) ? Math.abs(situation.amt) : undefined;
		default:
			amt.property satisfies never;
	}

}

private static resolveActorProperty(amt: ConsequenceAmountV2 & {type: "actor-property"}, list: Partial<TargettingContextList> , _source: Sourced<ConsequenceAmountV2>["source"]): U<number> {
	const targets = list[amt.target];
	if (!targets) {return undefined;}
	const returns = targets
	.map (target => PersonaDB.findActor(target))
	.map( target => {
		switch (amt.property) {
			case "mhp":
			case "hp":
				return target[amt.property];
		}
	});
	return returns.at(0);
}

static resolveItemProperty<T extends ConsequenceAmountV2 & {type: "item-property"}>( amt: T, _contextList: Partial<TargettingContextList>, source: Sourced<T>["source"]) : U<number> {
	let item : U<PersonaItem>;
	switch (amt.itemTarget) {
		case "source":
			if (source instanceof PersonaItem) {
				item = source;
				break;
			}
			if (source instanceof PersonaAE
				&& source.parent instanceof PersonaItem) {
				item = source.parent;
			}
			break;
		default:
			amt.itemTarget satisfies never;
	}
	if (!item) {return undefined;}
	switch (amt.property) {
		case "item-level":
			return item.itemLevel();
		default:
			amt.property satisfies never;
			return undefined;
	}
}

static resolveOperation <T extends ConsequenceAmountV2 & {type: "operation"}> (amt: T, contextList: Partial<TargettingContextList>, source: Sourced<T>["source"] ) : U<number> {
	let val1 = this.resolveConsequenceAmountV2(amt.amt1, contextList, source);
	let val2 = this.resolveConsequenceAmountV2(amt.amt2, contextList, source);
	switch (amt.operator) {
		case "add":
			val1 = val1 == undefined ? 0 : val1;
			val2 = val2 == undefined ? 0 : val2;
			return val1 + val2;
		case "subtract":
			val1 = val1 == undefined ? 0 : val1;
			val2 = val2 == undefined ? 0 : val2;
			return val1 - val2;
		case "divide":
			val1 = val1 == undefined ? 1 : val1;
			val2 = val2 == undefined ? 1 : val2;
			if (val2 == 0) {return undefined;}
			return val1 / val2;
		case "multiply":
			val1 = val1 == undefined ? 1 : val1;
			val2 = val2 == undefined ? 1 : val2;
			return val1 * val2;
		case "modulus":
			if (val1 == undefined || val2 == undefined) {return undefined;}
			return val1 % val2;
		default:
			amt.operator satisfies never;
			PersonaError.softFail(`Unknown Operator: ${amt["operator"] as string}`);
			return -1;
	}
}

}
