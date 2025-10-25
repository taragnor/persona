import { RollTag } from "./roll-tags.js";
import { SocialCard } from "../module/item/persona-item.js";
import { Consequence } from "./consequence-types.js";
import { StudentSkillExt } from "./student-skills.js";
import { SaveType } from "./save-types.js";
import { SocialStat } from "./student-skills.js";
import { WeatherType } from "./weather-types.js";

export const SOCIAL_CARD_TYPES_LIST = [
	"social",
	"job",
	"training",
	"recovery",
	"other",
	"mixin",
	"minor",
] as const;

export const SIMPLE_SOCIAL_CARD_ROLL_TYPES_LIST = [
	"none",
	"studentSkillCheck",
	"save",
] as const;

export const SOCIAL_CARD_ROLL_TYPES_LIST = [
	...SIMPLE_SOCIAL_CARD_ROLL_TYPES_LIST,
	"gmspecial",
	"dual",
	"question",
] as const;


export const SOCIAL_CARD_ROLL_TYPES = Object.fromEntries(
	SOCIAL_CARD_ROLL_TYPES_LIST.map(a=> [a, `persona.social.card.rolls.types.${a}`])
);

export const SIMPLE_SOCIAL_CARD_ROLL_TYPES = Object.fromEntries(
	SIMPLE_SOCIAL_CARD_ROLL_TYPES_LIST.map(a=> [a, `persona.social.card.rolls.types.${a}`])
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
	postEffects: { effects: ConditionalEffect[]},
	resourceCost: number,

};

export type CardEvent = SocialCard["system"]["events"][number];



export type EventPlacement = {
	starter: boolean,
	middle: boolean,
	finale: boolean,
	special: boolean
};

export type CardRoll = {
	rollType: typeof SOCIAL_CARD_ROLL_TYPES_LIST[number]} 
	& CardRollList[keyof CardRollList]
	& RollProgress
	& RollTags
;

type RollProgress = {
	progressSuccess: number,
	progressFail: number,
	progressCrit: number
}

type RollTags = {
	rollTag1: RollTag;
	rollTag2: RollTag;
	rollTag3: RollTag;
}

type CardRollList = {
	"none": {
		rollType: "none",
	},
	"question" : {
		rollType: "question",
	}
	"studentSkillCheck": {
		rollType: "studentSkillCheck",
		simpleRoll: boolean,
		studentSkill: StudentSkillExt,
		modifier: number,
		DC: CardRollDC,
		DCVal ?: number,
	},
	"save" : {
		rollType: "save",
		simpleRoll: boolean,
		saveType: SaveType,
		modifier: number,
		disallow_other_modifiers: boolean,
		DCVal ?: number,
	},
	"waitForGM" : {
		rollType: "gmspecial"
	}
	"dual": {
		rollType: "dual",
		roll1: SimpleCardRoll,
		roll2: CardRoll,
	}
}

type SimpleCardRoll = CardRoll & {simpleRoll: true};

export const CARD_DC_TYPES = {
	"base": "Base",
	"static": "Static DC",
	"cameoSocial" : "Cameo Social DC",
} as const;

type CardRollDC = {
	subtype: keyof typeof CARD_DC_TYPES,
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
