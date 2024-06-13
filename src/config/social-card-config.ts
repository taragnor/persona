import { SaveType } from "./save-types";
import { SocialStat } from "./student-skills";
import { WeatherType } from "./weather-types";

export const SOCIAL_CARD_TYPES_LIST = [
	"social",
	"job",
	"training",
	"recovery",
	"other"
] as const;

export type SocialCardType = keyof typeof SOCIAL_CARD_TYPES_LIST;

export const SOCIAL_CARD_TYPES = Object.fromEntries( 
	SOCIAL_CARD_TYPES_LIST.map(a=> [a, `persona.social.card.types.${a}`])
);


export type CardEvent = {
	frequency: number, //defaults to 1
	prereqs: CardPrereq[],
	text: string,
	rollProcedure:CardRoll, //defaults to "none"
};


type CardRoll = CardRollList[keyof CardRollList];

type CardRollList = {
	"none": {
		rollType: "none"
	},
	"studentSkillCheck": {
		rollType: "studentSkillCheck",
		studentSkill: SocialStat,
		modifier: number,
		success: CardRollResult,
		failure: CardRollResult,
		crtical: CardRollResult,
	}
	"save" : {
		rollType: "save",
		type: SaveType,
		modifier: number,
		disallow_other_modifiers: boolean,
	},
}


type CardPrereq = CardPrereqList[keyof CardPrereqList];

type CardRollResult = {
	resultString : string,
};


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


