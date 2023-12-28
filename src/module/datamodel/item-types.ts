const {StringField:txt, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

const damage = function() {
	return new sch( {
		low: new num( {integer:true}),
		high: new num( {integer:true}),
	});
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
	get type() { return "class" as const;}
	static override defineSchema() {
		const ret = {
			talentChoices: new arr(
				new id()
			),
			focusChoices: new arr(
				new id()
			),
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

