const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { CharacterClass } from "./character-class-dm.js";
import { Power } from "./power-dm.js";
import { damage } from "./power-dm.js";


//Note: have to manually match this with MODIIFERLIST
function modifiers() {
	return new sch( {
		wpnAtk: new num({initial: 0, integer: true}),
		magAtk: new num({initial: 0, integer: true}),
		wpnDmg: new num({initial: 0, integer: true}),
		magDmg: new num({initial: 0, integer: true}),
		criticalBoost: new num({initial: 0, integer: true}),
		ref: new num({initial: 0, integer: true}),
		fort: new num({initial: 0, integer: true}),
		will: new num({initial: 0, integer: true}),
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

export class Weapon extends foundry.abstract.DataModel {
	get type() { return "weapon" as const;}
	static override defineSchema() {
		const ret = {
			...InventoryItemSchema.defineSchema(),
			damage: damage(),
			modifiers: modifiers(),
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


export class InventoryItemSchema extends foundry.abstract.DataModel {
	get type() { return "item" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
			modifiers: modifiers(),
		}
		return ret;
	}
}

export const ITEMMODELS = {
	item: InventoryItemSchema,
	power: Power,
	studentSkill: StudentSkill,
	characterClass: CharacterClass,
	focus: Focus,
	talent: Talent,
	weapon: Weapon,
} as const;


//testing the types, purely for debug purposes
type CClass = SystemDataObjectFromDM<typeof CharacterClass>;

