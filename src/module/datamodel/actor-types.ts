const {StringField:txt, BooleanField: bool, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id, ObjectField: obj} = foundry.data.fields;
import { ResistType } from "../../config/damage-types";
import { INCREMENTAL_ADVANCE_TYPES } from "../../config/incremental-advance-types.js";

import { tarotDeck } from "../../config/tarot.js";
import { ResistStrength } from "../../config/damage-types.js";

const personalBio = function () {
	return new sch( {
		description: new html(),
		background: new html(),
	});
}

type HPTracking = {
	value: number;
	max: number;
}

function condArr() {
	return new arr(
		new id(),
		{initial:[]});
}

function linkBenefits() {
	return new sch ( {
		1: condArr(),
		2: condArr(),
		3: condArr(),
		4: condArr(),
		5: condArr(),
		6: condArr(),
		7: condArr(),
		8: condArr(),
		9: condArr(),
		10: condArr(),
	})

}

export type SocialData = {
	linkId: string,
	linkLevel: number,
	inspiration: number,
	currentProgress: number,
};


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

type IncAdvanceObject = Required<Record<INCREMENTAL_ADVANCE_TYPES, boolean>>;


const tarot = function () { return new txt<keyof typeof tarotDeck>( { choices: Object.keys(tarotDeck) as (keyof typeof tarotDeck)[]});}

const classData = function () {
	const initial : IncAdvanceObject =  Object.fromEntries( INCREMENTAL_ADVANCE_TYPES.map (x=> ([x, false]))
	) as IncAdvanceObject;
	return  new sch( {
		level: new num({min: 0, max: 10, initial: 1, integer:true}),
		classId: new id(),
		incremental: new obj<IncAdvanceObject>({initial}),
		incremental_progress: new num({initial:0, min:0, integer:true}),
	});
}

const combatCommonStats = function () {
	return {
		classData: classData(),
		hp: new num( {integer:true, initial: 1}),
		wpnatk: new num( {integer:true, initial: 0}),
		magatk: new num( {integer:true, initial: 0}),
		defenses :
		new sch({
			ref: new num( {integer:true, initial: 0}),
			will: new num( {integer:true, initial: 0}),
			fort: new num( {integer:true, initial: 0}),
		}),
		focuses: new arr( new id(), {initial: []}),
		powers: new arr( new id()),
		resists: elementalResists(),
		hpTracker: new obj<HPTracking>(),
	};
};

function socialLinks() {
	return new arr( new obj<SocialData>(), {initial: []});
}

function studentSkills() {
	return new sch( {
		diligence: new num({integer:true, initial:0}),
		courage: new num({integer:true, initial:0}),
		knowledge: new num({integer:true, initial:0}),
		expression: new num({integer:true, initial:0}),
		understanding: new num({integer:true, initial:0}),
	});

}

type TalentData = {
	talentId: string,
	talentLevel: number,
}

function sharedAbilities() {
	return {
		talents: new arr( new obj<TalentData>(), {initial: []}),
	}

};

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
			money: new num({integer: true, min: 0, initial:1}),
			tarot: tarot(),
			combat: new sch( {
				...combatCommonStats(),
			}),
			bio: personalBio(),
			social: socialLinks(),
			slots: skillSlots(),
			...sharedAbilities(),
			skills: studentSkills(),
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
			...sharedAbilities(),
			combat: new sch({
				...combatCommonStats(),
				wpndmg: new sch({
					low: new num({integer:true, min:0, initial:1}),
					high: new num({integer:true, min:0, initial:2}),
				}),
			}),
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
			linkBenefits: linkBenefits(),
			//include
		} as const;
		return ret;
	}
}


 export const ACTORMODELS = {pc: PCSchema, shadow: ShadowSchema, npc: NPCSchema} as const;

//testing the types, purely for debug purposes
type testPC = SystemDataObjectFromDM<typeof PCSchema>;
type testNPC = SystemDataObjectFromDM<typeof NPCSchema>;
type testShadow =SystemDataObjectFromDM<typeof ShadowSchema> 
