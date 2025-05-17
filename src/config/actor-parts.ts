import { ConditionalEffectDM } from "../module/datamodel/item-types.js";
import { Precondition } from "./precondition-types.js";
import { TokenSpend } from "./social-card-config.js";
import { TAROT_DECK } from "./tarot.js";
import { DEFENSE_CATEGORY_LIST } from "./defense-categories.js";
import { TarotCard } from "./tarot.js";
import { StatusDuration } from "../module/active-effect.js";
const {EmbeddedDataField: embedded, StringField:txt, BooleanField: bool, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id, FilePathField: file } = foundry.data.fields;
import { ResistType } from "./damage-types.js";
import { RESIST_STRENGTH_LIST } from "./damage-types.js";
import { ResistStrength } from "./damage-types.js";
import { STUDENT_SKILLS_LIST } from "./student-skills.js";

export type FlagData = {
	flagId: string,
	duration: StatusDuration
	flagName?: string,
	AEId: string,
};

export const personalBio = function () {
	return new sch( {
		description: new html(),
		background: new html(),
	});
}

export type TalentData = {
	talentId: string,
	talentLevel: number,
}


type HPTracking = {
	value: number;
	max: number;
}

export function elementalResists() {
	const initial :Record< ResistType, ResistStrength>  = {
		physical: "normal",
		gun: "normal",
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

export function statusResists() {
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
		rage: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		poison: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		blind: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		sealed: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
		despair: new txt( {choices: RESIST_STRENGTH_LIST, initial: "normal"}),
	});

}

export function keySkills() {
	return new sch ( {
		primary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),
		secondary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),
	});
}

export function weeklyAvailability() {
	return new sch( {
		Monday: new bool(),
		Tuesday: new bool(),
		Wednesday: new bool(),
		Thursday: new bool(),
		Friday: new bool(),
		Saturday: new bool(),
		Sunday: new bool(),
		available: new bool(),
		disabled: new bool(),
	});
}

export type SocialData = {
	linkId: string,
	linkLevel: number,
	inspiration: number,
	currentProgress: number,
	relationshipType: string,
	isDating: boolean,
};

export type ActivityData = {
	linkId: string,
	strikes: number,
	currentProgress: number,
}

export function equipslots() {
	return new sch( {
		weapon: new id(),
		body: new id(),
		accessory: new id(),
		weapon_crystal: new id(),
	});
}

export function skillSlots() {
	return new sch(
		{
			0: new num({min:0, max:10, initial:0}),
			1: new num({min:0, max:10, initial:0}),
			2: new num({min:0, max:10, initial:0}),
			3: new num({min:0, max:10, initial:0}),
		}
	);
}

export function tarotFields() {
	return {
		tarot: new txt<TarotCard>( {
			choices: Object.keys(TAROT_DECK) as (TarotCard)[],
			blank: true,
			initial:""
		}),
	}
}

export const classData = function () {
	return  new sch( {
		level: new num({min: 0, max: 10, initial: 1, integer:true}),
		classId: new id(),
		incremental: new sch ({
			hp: new num({integer: true, initial: 0, max: 3}),
			mp: new num({integer: true, initial: 0, max: 3}),
			attack: new num({integer: true, initial: 0, max: 2}),
			defense: new num({integer: true, initial: 0, max: 2}),
			magicLow: new bool(),
			magicHigh: new bool(),
			talent: new bool(),
			wpnDamage: new num({integer: true, initial: 0, max: 2}),
			initiative: new num({integer: true, initial: 0, max: 3}),
		}),
	});
}

export function combatCommonStats() {
	return {
		classData: classData(),
		xp: new num( {integer: false, initial: 0, min: 0}),
		hp: new num( {integer:true, initial: 1}),
		wpnatk: new num( {integer:true, initial: 0}),
		magatk: new num( {integer:true, initial: 0}),
		defenses :
		new sch({
			ref: new txt( {choices: DEFENSE_CATEGORY_LIST,  initial: "normal"}),
			will: new txt( {choices: DEFENSE_CATEGORY_LIST,  initial: "normal"}),
			fort: new txt( {choices: DEFENSE_CATEGORY_LIST,  initial: "normal"}),
		}),
		initiative: new txt( {choices: DEFENSE_CATEGORY_LIST,  initial: "normal"}),
		resists: elementalResists(),
		hpTracker: new obj<HPTracking>(),
		// fadingState: new num( {integer:true, initial:0}),
		statusResists: statusResists(),
		focuses: new arr( new id(), {initial: []}),
		actionsRemaining: new num( {initial: 1, integer:true, min:0, max: 20}),
	};
};

export function PCAndNPCAllyCombatStats() {
	return {
		...combatCommonStats(),
		powers: new arr( new id()),
		powers_sideboard: new arr( new id()),
		teamworkMove: new id(),
		mp: new sch({
			value: new num({initial: 0, integer: true, min: 0, max: 1000}),
			max: new num({initial: 1, integer: true, min:1, max:1000}),
		}),
	};
}


export function socialLinks() {
	return new arr( new obj<SocialData>(), {initial: []});
}

export function activityLinks() {
	return new arr( new obj<ActivityData>(), {initial: []});
}

export function studentSkills() {
	return new sch( {
		diligence: new num({integer:true, initial:0}),
		courage: new num({integer:true, initial:0}),
		knowledge: new num({integer:true, initial:0}),
		expression: new num({integer:true, initial:0}),
		understanding: new num({integer:true, initial:0}),
	});
}

export function sharedAbilities() {
	return {
	}

};

export function shadowOnlyCombatAbilities() {
	return {
		energy: new sch({
			value: new num({initial: 0, integer: true, min: -10, max: 10}),
			max: new num({initial: 10, integer: true, min:1, max:10}),
		}),
		wpndmg: new sch({
			low: new num({integer:true, min:0, initial:1}),
			high: new num({integer:true, min:0, initial:2}),
		}),
	}
}

export function PCSpecificStuff() {
	return {
		social: socialLinks(),
		activities: activityLinks(),
		skills: studentSkills(),
		talents: new arr( new obj<TalentData>(), {initial: []}),
	}
}

export function SocialTargetBlockData() {
	return {
		weeklyAvailability: weeklyAvailability(),
		keyskill: keySkills(),
		tokenSpends:new arr(new obj<TokenSpend>()),
		conditions: new arr(new obj<Precondition>()),
		availabilityConditions: new arr(new obj<Precondition>()),
		specialEvents: new txt(),
		datePerk: new txt(),
		socialEffects: new arr(new embedded(ConditionalEffectDM))
	}
}


export function encounterDataSchema() {
	return new sch( {
		CR: new num({integer: true, initial: 1, max: 10, min:1 }),
		timesDefeated: new num({integer: true, min:0, initial:0}),
		conditions: new arr(new obj<Precondition>()),
		rareShadow: new bool( {initial: false}),
		dungeonEncounters: new arr( new embedded(EncounterDataDM)),
		dungeons: new arr( new id()), //deprecated but left for conversion purposes
		frequency: new num({integer: false, initial: 1.0}), ///deprecated but left for conversion purposes
		treasure: new sch( {
			moneyLow: new num( {initial: 0, integer: true}),
			moneyHigh: new num( {initial: 0, integer: true}),
			cardPowerId: new id(), //Power Id
			cardProb: new num( {initial: 2, integer: false, min: 0, max: 100}),
			item0: new id(),
			item0prob: new num( {initial: 15, integer: false, min: 0, max: 100}),
			item1: new id(),
			item1prob: new num( {initial: 7, integer: false, min: 0, max: 100}),
			item2: new id(),
			item2prob: new num( {initial: 2, integer: false, min: 0, max: 100}),
		}),
	});


}

class EncounterDataDM extends foundry.abstract.DataModel {
	static override defineSchema() {
		return {
			dungeonId: new txt(),
			frequency: new num({initial: 1})
		}
	}
}

