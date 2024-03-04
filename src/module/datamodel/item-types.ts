const {StringField:txt, BooleanField: bool, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { CharacterClassDM } from "./character-class-dm.js";
import { UsablePowerProps } from "./power-dm.js";
import { powerCost } from "./power-dm.js";
import { powerSpecific } from "./power-dm.js";
import { damage } from "./power-dm.js";
import { EQUIP_SLOTS_LIST } from "../../config/equip-slots.js";
import { effects } from "./power-dm.js";

function itemBase() {
	return {
			itemCost: new num({ integer: true, min:0, initial: 0}),
			desciption: new html(),
	};
}

function consumableSpecific() {
	return {
		amount: new num({initial:1, integer: true, min:0, max: 999}),
	}

}


 class Weapon extends foundry.abstract.DataModel {
	get type() { return "weapon" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			damage: damage(),
			...effects (false),
		};
		return ret;
	}
}

 class Focus extends foundry.abstract.DataModel {
	get type() { return "focus" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
			...effects (false),
		}
		return ret;
	}
}

 class UniversalModifier extends foundry.abstract.DataModel {
	get type() { return "universalModifier" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
			...effects (false),
		}
		return ret;
	}
}

 class Power extends foundry.abstract.DataModel {
	get type() {return "power" as const;}
	static override defineSchema() {
		const ret = {
			...powerSpecific(),
			...powerCost(),
			...UsablePowerProps(),
			...effects(true),
		};
		return ret;
	}

}

 class Consumable extends foundry.abstract.DataModel {
	get type() {return "consumable" as const;}
	static override defineSchema() {
		const ret = {
			subtype: new txt({ initial: "consumable", choices: ["consumable"]}),
			...consumableSpecific(),
			...itemBase(),
			...UsablePowerProps(),
			...effects(true),
		};
		return ret;
	}
}


 class Talent extends foundry.abstract.DataModel {
	get type() { return "talent" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
			...effects(false),
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
			...effects(false),
		}
		return ret;
	}
}

export const ITEMMODELS = {
	consumable: Consumable,
	item: InventoryItemSchema,
	power: Power,
	characterClass: CharacterClassDM,
	focus: Focus,
	talent: Talent,
	weapon: Weapon,
	universalModifier: UniversalModifier,
} as const;


//testing the types, purely for debug purposes
type CClass = SystemDataObjectFromDM<typeof CharacterClassDM>;
type PowerSO= SystemDataObjectFromDM<typeof Power>;

