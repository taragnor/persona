import { CombatResult } from "../module/combat/combat-result.js";

type ConsStruct = {
	type: "cons",
} & ConsNode;

export type MenuItem = {
	name: string,
	consStruct: FieldDescriptor[],
} & ResolutionObj<any>;

type ConsStructToCons<T extends ConsStruct> = 
	Prettify< T extends ConsequenceNode<any> ? ConsNodeToCons<T> :
	unknown>;

type ToResultFn = (node: ConsNodeToCons<ConsequenceNode>,sit: Situation) => CombatResult;

type PrintFn = (node: ConsNodeToCons<ConsequenceNode>) => string;


type ConsNode = Prettify<ConsequenceNode<GenericFieldDescriptor[]> | ConsequenceNode<FieldDescriptor[]>>;

type ConsequenceNode<T extends FieldDescriptor[] = FieldDescriptor[]> = {
	data: T,
} & (
	DeepWriteable<T> extends GenericFieldDescriptor[] ? EndPointFunctions : {
		toResult?: never,
		print?: never,
	}
);

type EndPointFunctions = {
	toResult : ToResultFn,
	print : PrintFn,
};

type ConsNodeToCons<T extends ConsequenceNode = ConsequenceNode> = FieldDescriptorToObject<T["data"]>;


type ResolutionObj<T extends any> = {
	resolve ?: (x: FieldDescriptorToObject<FieldDescriptor[]>, situation: Situation) => T;
	toResult ?: ToResultFn,
	print ?: PrintFn,
}

type DataTypeMap = {
	string: string;
	number: number;
	menu: MenuItem;
};

export type FieldDescriptor =
	GenericFieldDescriptor | MenuFieldDescriptor;

type GenericFieldDescriptor<T extends keyof DataTypeMap = keyof DataTypeMap> = {
	name: string;
	dataType: T;
	choices ?: DataTypeMap[Exclude<T,"menu">][];
	default ?:  DataTypeMap[Exclude<T,"menu">];
} & ResolutionObj<DataTypeMap[Exclude<T,"menu">][]>;

export type MenuFieldDescriptor =
	{
		name: string;
		dataType: "menu";
		choices: MenuItem[];
	} & ResolutionObj<any>;


type ParseMenuItems<T extends MenuItem[], MenuFieldName extends string> =
	{[K in T[number] as K["name"]]: ObjectProp<MenuFieldName, K["name"]>
		// &  ConsNodeToCons<K["consStruct"]>
		&  FieldDescriptorToObject<K["consStruct"]>
	};

export type FieldDescriptorToObject<T extends FieldDescriptor[]> =
	GenericFieldDescriptorObject<T> &
	MenuFieldUnion<T>

	type GenericFieldDescriptorObject <T extends FieldDescriptor[]> =
	{
		[K in T[number] as (K extends MenuFieldDescriptor ? never : K["name"] )]:
		K extends MenuFieldDescriptor
		? never
		: K["choices"] extends Array<any>
		? K["choices"][number]
		: DataTypeMap[K["dataType"]]
	};

type MenuFieldUnion<T extends FieldDescriptor[]> =
	ObjToValueUnion< {
		[K in T[number] as K["dataType"] extends "menu" ? K["name"] : never]:
		K extends MenuFieldDescriptor
		? ObjToValueUnion<ParseMenuItems<K["choices"], K["name"]>>
		: {}
	}>;

declare global {
	type Prettify<T> = {
		[K in keyof T]: T[K];
	} & {};

	type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };
}

type ObjectProp<S extends string, X extends any> = {
	[V in S]: X
}

type ObjToValueUnion<T> = T[keyof T] extends never ? {} : T[keyof T];


