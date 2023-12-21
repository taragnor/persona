const {StringField:txt, NumberField: num, SchemaField: sch, HTMLField: html  } = foundry.data.fields;

export class PlaceholderSchema extends foundry.abstract.DataModel {
	get type() { return "placeholder" as const;}
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
		}
		return ret;
	}



}

export const ITEMMODELS = {
	item: InventoryItemSchema,
	skill: PlaceholderSchema,
	studentSkill: PlaceholderSchema,
	characterClass: PlaceholderSchema,
	focus: PlaceholderSchema,
	talent: PlaceholderSchema
} as const;



