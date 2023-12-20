
class pcSchema extends window.foundry.abstract.DataModel {
		get type() { return "pc" as const;}
	static override defineSchema() {
		const fields = window.foundry.data.fields;
		const ret = {
			description: new fields.StringField(),
			test : new fields.NumberField(),
		} as const;
		return ret;
	}
}

class ShadowSchema extends foundry.abstract.DataModel {
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

class NPCSchema extends foundry.abstract.DataModel {
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



const actormodels = {pc: pcSchema, shadow: ShadowSchema, npc: NPCSchema} as const;

function registerDataModels () {
	CONFIG.Actor.dataModels= actormodels;
}

	class PersonaActor extends Actor<typeof actormodels> {

		test() {
			if (this.system.type == "shadow") {
				this.system.shadowattack 
			}
			if (this.system.type == "npc") {
				this.system.schemaTest.num
			}


		}

	}


