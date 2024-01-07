const {StringField:txt, BooleanField: bool, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id, ObjectField: obj} = foundry.data.fields;
import { ResistType } from "../../config/damage-types";

import { tarotDeck } from "../../config/tarot.js";
import { ResistStrength } from "../../config/damage-types";

const personalBio = function () {
	return new sch( {
		description: new html(),
		background: new html(),
	});
}



function elementalResists() {
	const initial :Record< ResistType, ResistStrength>  = {
		physical: "normal",
		fire: "normal",
		cold: "normal",
		lightning: "normal",
		wind: "normal",
		light: "normal",
		dark: "normal"
	};
	return new obj <Record<ResistType, ResistStrength>> ({
		initial });
}

function equipslots() {
	return new sch( {
		weapon: new id(),
		body: new id(),
		accessory: new id(),
		weapon_crystal: new id(),
	});
}

function skillSlots() {
	return new sch(
		{
			0: new num({min:0, max:8, initial:0}),
			1: new num({min:0, max:8, initial:0}),
			2: new num({min:0, max:8, initial:0}),
			3: new num({min:0, max:8, initial:0}),
		}
	);
}

const tarot = function () { return new txt<keyof typeof tarotDeck>( { choices: Object.keys(tarotDeck)});}

const classData = function () {
	return  new sch( {
		level: new num({min: 0, max: 10, initial: 1, integer:true}),
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
		hp: new num( {integer:true, initial: 1}),
		wpnatk: new num( {integer:true}),
		magatk: new num( {integer:true}),
		defenses :
		new sch({
			ref: new num( {integer:true}),
			will: new num( {integer:true}),
			fort: new num( {integer:true}),
		}),
		powers: new arr( new id()),
		resists: elementalResists(),

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
			equipped: equipslots(),
			tarot: tarot(),
			combat: combatStats(),
			bio: personalBio(),
			social: socialLinks,
			slots: skillSlots(),
			talents: new arr( new id(), {initial: []}),
			focuses: new arr( new id(), {initial: []}),
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
