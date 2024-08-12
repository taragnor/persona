import { Consequence } from "../module/combat/combat-result.js";
import { StudentSkillExt } from "./student-skills.js";
import { Precondition } from "./precondition-types.js";
import { SaveType } from "./save-types.js";
import { SocialStat } from "./student-skills.js";
import { WeatherType } from "./weather-types.js";
import { ConditionalEffect } from "../module/datamodel/power-dm.js";

export const SOCIAL_CARD_TYPES_LIST = [
	"social",
	"job",
	"training",
	"recovery",
	"other"
] as const;

export const SOCIAL_CARD_ROLL_TYPES_LIST = [
	"none",
	"studentSkillCheck",
	"save",
	"gmspecial",
];

export const SOCIAL_CARD_ROLL_TYPES = Object.fromEntries(
	SOCIAL_CARD_ROLL_TYPES_LIST.map(a=> [a, `persona.social.card.rolls.types.${a}`])
);


	export type SocialCardType = keyof typeof SOCIAL_CARD_TYPES_LIST;

export const SOCIAL_CARD_TYPES = Object.fromEntries(
	SOCIAL_CARD_TYPES_LIST.map(a=> [a, `persona.social.card.types.${a}`])
);

export type CardChoice = {
	name: string,
	conditions: Precondition[],
	text: string,
	roll: CardRoll, //defaults to "none"
	postEffects: { effects: ConditionalEffect[]}
};

export type CardEvent = {
	name: string,
	img: string,
	label: string,
	frequency: number, //defaults to 1
	placement?: {starter: boolean, middle: boolean, finale: boolean},
	text: string,
	conditions: Precondition[],
	choices: CardChoice[]
};

export type CardRoll = {rollType: typeof SOCIAL_CARD_ROLL_TYPES_LIST[number]} & CardRollList[keyof CardRollList];

type CardRollList = {
	"none": {
		rollType: "none"
	},
	"studentSkillCheck": {
		rollType: "studentSkillCheck",
		studentSkill: StudentSkillExt,
		modifier: number,
		DC: CardRollDC,
	}
	"save" : {
		rollType: "save",
		saveType: SaveType,
		modifier: number,
		disallow_other_modifiers: boolean,
	},
	"waitForGM" : {
		rollType: "gmspecial"
	}
}

type CardRollDC = {
	subtype: "static" | "base",
	staticDC: number,
};

export type Opportunity = {
	choices: number, //amount of choice points this option takes,
} & CardChoice;

export type CardPrereq = CardPrereqList[keyof CardPrereqList];


type CardPrereqList = {
	"weekday": {
		prereqType : "weekday",
		weekday: "weekend" | "weekday",
	},
	"socialLinkRating": {
		prereqType : "socialLinkRating",
		linkId: string,
		linkMinLevel: number,
		linkMaxLevel: number
	},
	"weather": {
		prereqType : "weather",
		weather: WeatherType | "any" | "any stormy"
	}

};

export type ThresholdOrDC= ThresholdList[number] & {thresholdType: ThresholdType};

type ThresholdList = [
	{
		thresholdType: "static",
		num: number
	},
	{
		thresholdType: "levelScaled",
		startingVal: number,
		multiplier: number,
	},
	{
		thresholdType: "statScaled",
		stat: SocialStat,

	}
];

const THRESHOLD_TYPE_LIST = [
	"static",
	"levelScaled",
	"statScaled",
] as const;

type ThresholdType = typeof THRESHOLD_TYPE_LIST[number]

export const THRESHOLD_TYPE = Object.fromEntries (
	THRESHOLD_TYPE_LIST.map (x=> [x, `persona.social.card.thresholdType.${x}`])
);


export type TokenSpend = {
	conditions: Precondition[],
	amount: number,
	text: string,
	consequences: Consequence[]
}


