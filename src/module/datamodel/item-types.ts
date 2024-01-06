const {StringField:txt, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { CharacterClass } from "./character-class-dm.js";
import { UsablePowerProps } from "./power-dm.js";
import { damage } from "./power-dm.js";
import { EQUIP_SLOTS_LIST } from "../../config/equip-slots.js";


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

function itemBase() {
	return {
			itemCost: new num({ integer: true, min:0, initial: 0}),
			desciption: new html(),
	};
}


 class StudentSkill extends foundry.abstract.DataModel {
	get type() { return "studentSkill" as const;}
	static override defineSchema() {
		const ret = {
			bonus: new num( {integer:true}),
		};
		return ret;
	}
}

 class Weapon extends foundry.abstract.DataModel {
	get type() { return "weapon" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			damage: damage(),
			modifiers: modifiers(),
		};
		return ret;
	}
}

 class Focus extends foundry.abstract.DataModel {
	get type() { return "focus" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
		}
		return ret;
	}
}

 class Power extends foundry.abstract.DataModel {
	get type() {return "power" as const;}
	static override defineSchema() {
		const ret = {
			...UsablePowerProps()
		};
		return ret;
	}

}

 class Consumable extends foundry.abstract.DataModel {
	get type() {return "consumable" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			...UsablePowerProps(),
		};
		return ret;
	}
}


 class Talent extends foundry.abstract.DataModel {
	get type() { return "talent" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
		}
		return ret;
	}
}


 class InventoryItemSchema extends foundry.abstract.DataModel {
	get type() { return "item" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			slot: new txt<typeof EQUIP_SLOTS_LIST[number]>({choices: EQUIP_SLOTS_LIST}),
			modifiers: modifiers(),
		}
		return ret;
	}
}

export const ITEMMODELS = {
	consumable: Consumable,
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
type PowerSO= SystemDataObjectFromDM<typeof Power>;

