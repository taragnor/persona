const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

const damage = function() {
	return new sch( {
		low: new num( {integer:true, positive: true, initial:1}),
		high: new num( {integer:true, positive: true, initial: 1}),
	});
}

type ClassLevelType = {
								lvl_num: number,
								maxhp: number,
								slots: [number,number,number,number]
								talents: [number,number,number,number],
								powers_known: [number,number,number,number],
								magic_damage: {low: number, high:number},
								wpn_mult: number,
};

function level_table(min = 1, max=  10) {
	// const internalSch = function() {
	// 	return new sch(
	// 		{
	// 			lvl_num: new num({min, max, integer:true}),
	// 			maxhp: new num({positive: true, integer:true, initial: 1}),
	// 			slots: new arr(  new num( {min:0, integer:true, initial:0})),
	// 			talents: new arr(  new num( {min: 0, integer:true, initial:0})),
	// 			powers_known: new arr(  new num( {min: 0, integer:true, initial:0})),
	// 			magic_damage: damage(),
	// 			wpn_mult: new num( {positive: true, integer:true, initial:1})
	// 		});
	// };
	const internalObj = function () {
		return new obj<ClassLevelType>();
	};
	let ret= new arr( internalObj()
		, {initial: []});
	return ret;
}

export class StudentSkill extends foundry.abstract.DataModel {
	get type() { return "studentSkill" as const;}
	static override defineSchema() {
		const ret = {
			bonus: new num( {integer:true}),
		};
		return ret;
	}
}

export class Skill extends foundry.abstract.DataModel {
	get type() {return "skill" as const;}
	static override defineSchema() {
		const ret = {
			subtype: new txt( {choices: ["weapon", "magic", "other", "none"]} ),
			hpcost: new num( {integer:true}),
			damage: damage(),
			slot: new num( {integer: true, positive:true}),
		};
		return ret;


	}

}

export class Weapon extends foundry.abstract.DataModel {
	get type() { return "weapon" as const;}
	static override defineSchema() {
		const ret = {
			...InventoryItemSchema.defineSchema(),
			damage: damage(),
		};
		return ret;
	}
}

export class Focus extends foundry.abstract.DataModel {
	get type() { return "talent" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
		}
		return ret;
	}
}


export class Talent extends foundry.abstract.DataModel {
	get type() { return "talent" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
		}
		return ret;
	}
}

export class CharacterClass extends foundry.abstract.DataModel {
	get type() { return "characterClass" as const;}
	static override defineSchema() {
		const ret = {
			talentChoices: new arr(
				new id()
			),
			focusChoices: new arr(
				new id()
			),
			leveling_table: level_table(),
			desciption: new html(),
		};
		return ret;
	}
}

export class InventoryItemSchema extends foundry.abstract.DataModel {
	get type() { return "item" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
		}
		return ret;
	}
}

export const ITEMMODELS = {
	item: InventoryItemSchema,
	skill: Skill,
	studentSkill: StudentSkill,
	characterClass: CharacterClass,
	focus: Focus,
	talent: Talent,
	weapon: Weapon,
} as const;


//testing the types, purely for debug purposes
type CClass = SystemDataObjectFromDM<typeof CharacterClass>;

