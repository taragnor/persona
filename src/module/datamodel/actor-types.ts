const {StringField:str, NumberField: num, SchemaField: sch  } = foundry.data.fields;


export class PCSchema extends window.foundry.abstract.DataModel {
		get type() { return "pc" as const;}
	static override defineSchema() {
		const fields = window.foundry.data.fields;
		const ret = {
			description: new str(),
			test : new fields.NumberField(),
		} as const;
		return ret;
	}
}

export class ShadowSchema extends foundry.abstract.DataModel {
	get type() { return "shadow" as const;}
	get shadowstuff() {return "thing";}
	static override defineSchema() {
		const fields = window.foundry.data.fields;
		const ret = {
			shadowdesc: new fields.StringField(),
			shadowattack : new fields.NumberField(),
		} as const;
		return ret;
	}
}

export class NPCSchema extends foundry.abstract.DataModel {
	get type() { return "npc" as const;}
	static override defineSchema() {
		const fields = window.foundry.data.fields;
		const ret = {
			shadowdesc: new fields.StringField(),
			schemaTest: new fields.SchemaField( {num: new fields.NumberField()}),
		} as const;
		return ret;
	}
}

export const ACTORMODELS = {pc: PCSchema, shadow: ShadowSchema, npc: NPCSchema} as const;

	export class PersonaActor extends Actor<typeof ACTORMODELS> {

		test() {
			if (this.system.type == "shadow") {
				this.system.shadowattack
			}
			if (this.system.type == "npc") {
				this.system.schemaTest.num
			}


		}

	}

//example typecheck code
type testPC = SystemDataObjectFromDM<typeof PCSchema>;
type testNPC = SystemDataObjectFromDM<typeof NPCSchema>;
