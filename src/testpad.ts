

const simpleField =
	{name: "simple", dataType: "string"} as const satisfies FieldDescriptor;

const simplestruct = {
	type: "cons",
	data: [{name: "id", dataType: "string"}],
}  as const satisfies ConsStruct;

const Menu2 = {
	name: "targetType",
	dataType: "menu",
	choices: [{
		name: "user",
		consStruct: simplestruct,
	},{
		name: "other",
		consStruct: simplestruct
	},
	],
} as const satisfies MenuFieldDescriptor;


const X =[ {
	name: "x",
	dataType: "string",
	choices: ["A", "B", "C", "D"],
}, {
	name: "el",
	dataType: "number",
}, Menu2
] as const satisfies FieldDescriptor[] ;

const Y = [ {
	name: "y",
	dataType: "string",
	choices: ["E", "F"],

},
] as const satisfies FieldDescriptor[] ;

const XConstruct = {
	type: "cons",
	data: X,
} as const satisfies ConsequenceNode;

const YConstruct = {
	type: "cons",
	data: Y,
} as const satisfies ConsequenceNode;

type test = FieldDescriptorToObject<typeof X>;

type test2 = ConsStructToCons<typeof XConstruct>;

const Menu = {
	name: "m1",
	dataType: "menu",
	choices: [{
		name: "X-Option",
		consStruct: XConstruct,
	},{
		name: "Y-Option",
		consStruct:YConstruct,
	},
	],
} as const satisfies MenuFieldDescriptor;



const MenuStruct = {
	type: "cons",
	data: [Menu, simpleField],
} as const satisfies ConsequenceNode;

type test3 = ConsStructToCons<typeof MenuStruct>;

type test4 = Prettify<ParseMenuItems<typeof Menu["choices"], "m1">>;

type test5 = MenuFieldUnion<typeof Menu[]>;
type test6 = MenuFieldUnion<typeof simpleField[]>;
type test7 = GenericFieldDescriptorObject<typeof simpleField[]>;
type test8 = GenericFieldDescriptorObject<typeof Menu[]>;

type targetTest = Prettify<ConsStructToCons<typeof XConstruct>>;
	type targetTest1 = Prettify<GenericFieldDescriptorObject<typeof X>>;
	type targetTest2 = Prettify<MenuFieldUnion<typeof XConstruct.data>>;


type Increment<N extends number, T extends any[] = []> = 
  [...T, any]['length'] extends N
    ? [...T, any, any]['length']
    : Increment<N, [...T, any]>;

//@ts-ignore
let tt : TargetTest = something;


//@ts-ignore
let x : test3 = something;
//@ts-ignore
let y : test4 = something;

//@ts-ignore
let z : test5 = something;

y["X-Option"].targetType

if (x.m1 == "X-Option") {
	if (x.targetType == "user") {
		x.id
	}

}


