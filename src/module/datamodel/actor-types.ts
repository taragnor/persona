const {StringField:txt, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;


const personalBio = new sch( {
	description: new html(),
	background: new html(),
});

const combatStats = new sch( {
	hp: new sch( {
		curr: new num(),
		max: new num(),
	}),
	wpnatk: new num(),
	magatk: new num(),
	defenses : new sch({
		ref: new num(),
		will: new num(),
		fort: new num(),
	}),
});

const socialLinks = new sch( {
	links: new arr( new sch( {
		linkId: new id(),
		linkLevel: new num(),
	})
	),
});

export class PCSchema extends window.foundry.abstract.DataModel {
		get type() { return "pc" as const;}
	static override defineSchema() {
		const ret = {
			tarot: new txt(),
			combat:combatStats,
			bio: personalBio,
			social: socialLinks,
		} as const;
		return ret;
	}
}

export class ShadowSchema extends foundry.abstract.DataModel {
	get type() { return "shadow" as const;}
	get shadowstuff() {return "thing";}
	static override defineSchema() {
		const ret = {
			tarot: new txt(),
			combat: combatStats,
		} as const;
		return ret;
	}
}

export class NPCSchema extends foundry.abstract.DataModel {
	get type() { return "npc" as const;}
	static override defineSchema() {
		const ret = {
			tarot: new txt(),
			bio: personalBio,
		} as const;
		return ret;
	}
}

export const ACTORMODELS = {pc: PCSchema, shadow: ShadowSchema, npc: NPCSchema} as const;

//example typecheck code
type testPC = SystemDataObjectFromDM<typeof PCSchema>;
type testNPC = SystemDataObjectFromDM<typeof NPCSchema>;
