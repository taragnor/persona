import { Precondition } from "./precondition-types";
import { SaveType } from "./save-types";
import { SocialStat } from "./student-skills";
import { WeatherType } from "./weather-types";
import { ConditionalEffect } from "../module/datamodel/power-dm";

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
	conditions: Precondition[],
	text: string,
	roll: CardRoll, //defaults to "none"
};

export type CardEvent = {
	name: string,
	frequency: number, //defaults to 1
	choices: CardChoice[]
};

export type CardRoll = {rollType: typeof SOCIAL_CARD_ROLL_TYPES_LIST[number]} & CardRollList[keyof CardRollList];

type CardRollList = {
	"none": {
		rollType: "none"
	},
	"studentSkillCheck": {
		rollType: "studentSkillCheck",
		studentSkill: SocialStat,
		modifier: number,
		effects: ConditionalEffect[],
	}
	"save" : {
		rollType: "save",
		saveType: SaveType,
		modifier: number,
		disallow_other_modifiers: boolean,
		effects: ConditionalEffect[],
	},
	"waitForGM" : {
		rollType: "gmspecial"
	}
}

type CardRollResult = {
	resultString : string,
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

export type ThresholdOrDC= ThresholdList[keyof ThresholdList];

type ThresholdList = {
	"static" : {
		thresholdType: "static",
		num: number
	},
	"levelScaled": {
		thresholdType: "levelScaled",
		startingVal: number,
		multiplier: number,
	},
	"SL_based": {
		thresholdType: "SL_Based",
		startingVal: number,
		multiplier: number,
	}
}

