const {StringField:txt, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { tarotDeck } from "../../config/tarot.js";

const personalBio = new sch( {
	description: new html(),
	background: new html(),
});

const tarot = function () { return new txt( { choices: Object.keys(tarotDeck)});}

const combatStats = function () {
	return new sch( {
	hp: new sch( {
		curr: new num( {integer:true}),
		max: new num( {integer:true}),
	}),
	wpnatk: new num( {integer:true}),
	magatk: new num( {integer:true}),
	defenses :
	new sch({
		ref: new num( {integer:true}),
		will: new num( {integer:true}),
		fort: new num( {integer:true}),
	}),
	equippedWeapon: new id(),
});
};

const socialLinks = new sch( {
	links: new arr( new sch( {
		linkId: new id(),
		linkLevel: new num( {min:0, max:10, integer:true}),
	})
	),
});

export class PCSchema extends window.foundry.abstract.DataModel {
		get type() { return "pc" as const;}
	static override defineSchema() {
		const ret = {
			tarot: tarot(),
			combat: combatStats(),
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
			tarot: tarot(),
			combat: combatStats(),
		} as const;
		return ret;
	}
}

export class NPCSchema extends foundry.abstract.DataModel {
	get type() { return "npc" as const;}
	static override defineSchema() {
		const ret = {
			tarot: tarot(),
			bio: personalBio,
		} as const;
		return ret;
	}
}


 export const ACTORMODELS = {pc: PCSchema, shadow: ShadowSchema, npc: NPCSchema} as const;

//testing the types, purely for debug purposes
type testPC = SystemDataObjectFromDM<typeof PCSchema>;
type testNPC = SystemDataObjectFromDM<typeof NPCSchema>;
