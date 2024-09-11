const {StringField:txt, BooleanField: bool, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id, ObjectField: obj} = foundry.data.fields;
import { StatusEffectId } from "../../config/status-effects.js";
import { PC } from "../actor/persona-actor.js";
import { DEFENSE_CATEGORY_LIST } from "../../config/defense-categories.js";
import { TokenSpend } from "../../config/social-card-config.js";
import { SHADOW_ROLE_LIST } from "../../config/shadow-types.js";
import { Precondition } from "../../config/precondition-types.js";
import { ResistType } from "../../config/damage-types.js";
import { INCREMENTAL_ADVANCE_TYPES } from "../../config/incremental-advance-types.js";

import { RESIST_STRENGTH_LIST } from "../../config/damage-types.js";
import { ResistStrength } from "../../config/damage-types.js";
import { STUDENT_SKILLS_LIST } from "../../config/student-skills.js";
import { StatusDuration } from "../../config/status-effects.js";
import { TarotCard } from "../../config/tarot.js";
import { TAROT_DECK } from "../../config/tarot.js";

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

export type FlagData = {
	flagId: string,
	duration: StatusDuration
	flagName?: string,
	AEId: string,
};

function keySkills() {
	return new sch ( {
		primary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),
		secondary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),

	});
}

function weeklyAvailability() {
	return new sch( {
		Monday: new bool(),
		Tuesday: new bool(),
		Wednesday: new bool(),
		Thursday: new bool(),
		Friday: new bool(),
		Saturday: new bool(),
		Sunday: new bool(),
		available: new bool()
	});
}

export type SocialData = {
	linkId: string,
	linkLevel: number,
	inspiration: number,
	currentProgress: number,
	relationshipType: string,
};

export type ActivityData = {
	linkId: string,
	strikes: number,
	currentProgress: number,
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

function statusResists() {
	return new sch( {
		burn: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		charmed:new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		curse: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		confused: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		dizzy: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		expel: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		fear: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		vulnerable: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		forgetful: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		frozen: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		sleep: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		shock: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),

	});

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
			0: new num({min:0, max:10, initial:0}),
			1: new num({min:0, max:10, initial:0}),
			2: new num({min:0, max:10, initial:0}),
			3: new num({min:0, max:10, initial:0}),
		}
	);
}

type IncAdvanceObject = Required<Record<INCREMENTAL_ADVANCE_TYPES, boolean>>;


const tarot = function () { return new txt<TarotCard>( { choices: Object.keys(TAROT_DECK) as (TarotCard)[], blank: true, initial:""});}

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
			ref: new txt( {choices: DEFENSE_CATEGORY_LIST,  initial: "normal"}),
			will: new txt( {choices: DEFENSE_CATEGORY_LIST,  initial: "normal"}),
			fort: new txt( {choices: DEFENSE_CATEGORY_LIST,  initial: "normal"}),
		}),
		focuses: new arr( new id(), {initial: []}),
		powers: new arr( new id()),
		resists: elementalResists(),
		hpTracker: new obj<HPTracking>(),
		fadingState: new num( {integer:true, initial:0}),
	};
};

function socialLinks() {
	return new arr( new obj<SocialData>(), {initial: []});
}

function activityLinks() {
	return new arr( new obj<ActivityData>(), {initial: []});

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
			flags: new arr(new obj<FlagData>()),
		}
	}

}

export class PCSchema extends window.foundry.abstract.DataModel {
	get type() { return "pc" as const;}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			weeklyAvailability: weeklyAvailability(),
			equipped: equipslots(),
			money: new num({integer: true, min: 0, initial:1}),
			tarot: tarot(),
			combat: new sch( {
				...combatCommonStats(),
			}),
			bio: personalBio(),
			social: socialLinks(),
			activities: activityLinks(),
			slots: skillSlots(),
			...sharedAbilities(),
			skills: studentSkills(),
			keyskill: keySkills(),
			tokenSpends:new arr(new obj<TokenSpend>()),
		} as const;
		return ret;
	}

	static override migrateData(data: any) {
		const system = data as PC["system"];
		const convert = function (x: number) {
			switch (true) {
				case x  >=5: return "ultimate";
				case x  >=2: return "strong";
				case x > -2: return "normal";
				case x >= -5: return "weak";
				case x >= -10 : return "pathetic";
				default: return "normal";
			}
		};
		for (const def of ["fort", "ref", "will"] as const) {
			if (typeof system?.combat?.defenses[def] == "number") {
				system.combat.defenses[def] = convert(data.combat.defenses[def]);
			}
		}
		return data;
	}

}

export class ShadowSchema extends foundry.abstract.DataModel {
	get type() { return "shadow" as const;}
	get shadowstuff() {return "thing";}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			role: new txt({choices: SHADOW_ROLE_LIST, initial: "base"}),
			encounter: new sch( {
				rareShadow: new bool( {initial: false}),
				dungeons: new arr( new id()),
				treasure: new sch( {
					moneyLow: new num( {initial: 0, integer: true}),
					moneyHigh: new num( {initial: 0, integer: true}),
					item1: new id(),
					item1prob: new num( {initial: 0, integer: false}),
					item2: new id(),
					item2prob: new num( {initial: 0, integer: false}),
				}),
			}),
			tarot: tarot(),
			...sharedAbilities(),
			combat: new sch({
				...combatCommonStats(),
				statusResists: statusResists(),
				wpndmg: new sch({
					low: new num({integer:true, min:0, initial:1}),
					high: new num({integer:true, min:0, initial:2}),
				}),
			}),
		} as const;
		return ret;
	}

	static override migrateData(data: any) {
		const system= data as PC["system"];
		const convert = function (x: number) {
			switch (true) {
				case x >= 5: return "ultimate";
				case x >= 2: return "strong";
				case x > -2: return "normal";
				case x >= -5: return "weak";
				case x >= -10 : return "pathetic";
				default: return "normal";
			}
		};
		if (typeof system.combat.defenses.fort == "number") {
			system.combat.defenses.fort = convert(data.combat.defenses.fort);
			system.combat.defenses.ref = convert(data.combat.defenses.ref);
			system.combat.defenses.will = convert(data.combat.defenses.will);
		}
		return data;
	}

}

export class NPCSchema extends foundry.abstract.DataModel {
	get type() { return "npc" as const;}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			weeklyAvailability: weeklyAvailability(),
			conditions: new arr(new obj<Precondition>()),
			tarot: tarot(),
			bio: personalBio(),
			keyskill: keySkills(),
			baseRelationship: new txt(),
			specialEvents: new txt(),
			datePerk: new txt(),
			tokenSpends:new arr(new obj<TokenSpend>()),
			//include
		} as const;
		return ret;
	}
}

export class TarotSchema extends foundry.abstract.DataModel {
	get type() { return "tarot" as const;}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			studentAbility: new txt(),
			perk: new txt(),
			//include
		} as const;
		return ret;
	}
}


 export const ACTORMODELS = {
	 pc: PCSchema,
	 shadow: ShadowSchema,
	 npc: NPCSchema,
	 tarot: TarotSchema
 } as const;

//testing the types, purely for debug purposes
type testPC = SystemDataObjectFromDM<typeof PCSchema>;
type testNPC = SystemDataObjectFromDM<typeof NPCSchema>;
type testShadow =SystemDataObjectFromDM<typeof ShadowSchema>;
