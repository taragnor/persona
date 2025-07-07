import { CombatResult } from "../module/combat/combat-result.js";

declare global {
	type ConsStruct =  ConsequenceNode

	type MenuItem = {
		name: string,
		consStruct: ConsStruct,
	}

	type ConsStructToCons<T extends ConsStruct> = 
		Prettify< T extends ConsequenceNode<any> ? ConsNodeToCons<T> :
		unknown>;

	type ToResultFn = (node: ConsNodeToCons<ConsequenceNode>,sit: Situation) => CombatResult;


	type ConsequenceNode<T extends FieldDescriptor[] = FieldDescriptor[]> = {
		type: "cons",
		data: Readonly<T>,
		toResult ?: ToResultFn
	}

	type ConsNodeToCons<T extends ConsequenceNode> = FieldDescriptorToObject<T["data"]>;


	type DataTypeMap = {
		string: string;
		number: number;
		menu: MenuItem;
	};
	type FieldDescriptor =
		GenericFieldDescriptor | MenuFieldDescriptor;

	type GenericFieldDescriptor<T extends keyof DataTypeMap = keyof DataTypeMap> = {
		name: string;
		dataType: T;
		choices ?: DataTypeMap[Exclude<T,"menu">][];
		default ?:  DataTypeMap[Exclude<T,"menu">];
	};

	type MenuFieldDescriptor =
		{
			name: string;
			dataType: "menu";
			choices: MenuItem[];
		};


	type ParseMenuItems<T extends MenuItem[], MenuFieldName extends string> =
		{[K in T[number] as K["name"]]: ObjectProp<MenuFieldName, K["name"]>
			&  ConsStructToCons<K["consStruct"]>
		};

	type FieldDescriptorToObject<T extends readonly FieldDescriptor[]> =
		GenericFieldDescriptorObject<T> &
		MenuFieldUnion<T>

		type GenericFieldDescriptorObject <T extends readonly FieldDescriptor[]> =
		{
			[K in T[number] as (K extends MenuFieldDescriptor ? never : K["name"] )]:
			K extends MenuFieldDescriptor
			? never
			: K["choices"] extends Array<any>
			? K["choices"][number]
			: DataTypeMap[K["dataType"]]
		};

	type MenuFieldUnion<T extends readonly FieldDescriptor[]> =
		ObjToValueUnion< {
			[K in T[number] as K["dataType"] extends "menu" ? K["name"] : never]:
			K extends MenuFieldDescriptor
			? ObjToValueUnion<ParseMenuItems<K["choices"], K["name"]>>
			: {}
		}>;

	type Prettify<T> = {
		[K in keyof T]: T[K];
	} & {};

	type ObjectProp<S extends string, X extends any> = {
		[V in S]: X
	}

	type ObjToValueUnion<T> = T[keyof T] extends never ? {} : T[keyof T];

}
