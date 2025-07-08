import { FieldDescriptorToObject } from "./consequence-type-v2";
import { FieldDescriptor } from "./consequence-type-v2";
import { MenuFieldDescriptor } from "./consequence-type-v2";
import { MenuItem } from "./consequence-type-v2";

const ActorStatSelector = [
	{
		name: "actorId",
		dataType: "string",
	},
	{
		name: "actorStat",
		dataType: "string",
		choices : ["strength", "dexterity"]
	}
] as const satisfies FieldDescriptor[];

const NumericValue = {
	name : "numericValueType",
	dataType: "menu",
	resolve: NumericResolver,
	choices : [{
		name: "constant",
		consStruct: [{
			name: "value",
			dataType: "number",
		}],
	}, {
		name: "variable",
		consStruct: [{
			name: "varName",
			dataType: "string",
		}],
	}]

} as const satisfies MenuFieldDescriptor;

const VariableValue = {
	name: "variable",
	resolve: VariableResolver,
	consStruct: [{
		name: "varSubtype",
		dataType: "menu",

	}],
} as const satisfies MenuItem;

function VariableResolver( x: unknown, sit: Situation): number {
	return 0;
}

function NumericResolver(x: unknown, _sit: Situation): number {
	const y= x as FieldDescriptorToObject<typeof NumericValue[]>
		switch (y.numericValueType) {
			case "constant":
				return y.value;
			case "variable":
				throw new Error("NOt yet implemented");
			default:
				y satisfies never;
				throw new Error("Illegal choice");
		}
}

type x= Prettify<FieldDescriptorToObject<typeof NumericValue[]>>;

function ActorStatResolver (x: unknown, sit: Situation): number | undefined{
	const y= x as FieldDescriptorToObject<typeof ActorStatSelector>
		const actor=  game.actors.get(y.actorId);
	if (!actor) return undefined;
	switch (y.actorStat) {
		case "strength":
			return 5;
		case "dexterity":
			return 10;
	}
}

const Comparator = {
	name: "comparator",
	dataType: "menu",
	choices: [{
		name: "==",
		consStruct: [NumericValue],
	}, {
		name: "!=",
		consStruct: [NumericValue],
	}, {
		name: ">=",
		consStruct: [NumericValue],
	}, {
		name: "<=",
		consStruct: [NumericValue],
	}, {
		name: "<",
		consStruct: [NumericValue],
	}, {
		name: ">",
		consStruct: [NumericValue],
	}
	]
} as const satisfies MenuFieldDescriptor;

const NumericalOperand = {
	name: "operand1",
	dataType: "menu",
	choices : [{
		name: "actor-stat",
		resolve: ActorStatResolver,
		consStruct : [...ActorStatSelector, ]
	}]
} as const satisfies FieldDescriptor;

const NumericComparison = [
	Comparator,
	NumericalOperand,
] as const satisfies FieldDescriptor[];

type NumericComparison = Prettify<FieldDescriptorToObject<typeof NumericComparison>>;
