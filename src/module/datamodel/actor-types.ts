const {StringField:txt, BooleanField: bool, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { tarotDeck } from "../../config/tarot.js";

const personalBio = function () {
	return new sch( {
		description: new html(),
		background: new html(),
	});
}

const tarot = function () { return new txt( { choices: Object.keys(tarotDeck)});}

const classData = function () {
	return  new sch( {
		classId: new id(),
		incremental: new sch( {
			hp: new bool({initial:false}),
			atkbonus: new bool({initial:false}),
			defbonus: new bool({initial:false}),
			slots: new bool({initial:false}),
			talents: new bool({initial:false}),
			powers: new bool({initial:false}),
			wpn_mult: new bool({initial:false}),
			mag_dmg: new bool({initial:false}),
		}),
	});
}

const combatStats = function () {
	return new sch( {
		classData: classData(),
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

abstract class BaseStuff extends window.foundry.abstract.DataModel {

	static override defineSchema() {
		return {
			locked: new bool( { initial: false}),
			short_desc: new txt(),
		}

	}

}

export class PCSchema extends window.foundry.abstract.DataModel {
		get type() { return "pc" as const;}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			tarot: tarot(),
			combat: combatStats(),
			bio: personalBio(),
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
			...BaseStuff.defineSchema(),
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
			...BaseStuff.defineSchema(),
			tarot: tarot(),
			bio: personalBio(),
		} as const;
		return ret;
	}
}


 export const ACTORMODELS = {pc: PCSchema, shadow: ShadowSchema, npc: NPCSchema} as const;

//testing the types, purely for debug purposes
type testPC = SystemDataObjectFromDM<typeof PCSchema>;
type testNPC = SystemDataObjectFromDM<typeof NPCSchema>;
