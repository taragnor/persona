import { HTMLTools } from "../module/utility/HTMLTools.js";
export const PROBABILITY_LIST = [
	"common",
	"common-minus",
	"normal-plus",
	"normal",
	"normal-minus",
	"rare-plus",
	"rare",
	"never",
	"always",
] as const;

type Probability = typeof PROBABILITY_LIST[number];

export const PROBABILITIES = HTMLTools.createLocalizationObject(PROBABILITY_LIST, "persona.probability");

export type ProbabilityRate = Record<Probability, number>;

export const ENCOUNTER_RATE_PROBABILITY : ProbabilityRate = {
	common: 5,
	"common-minus": 2,
	"normal-plus": 1.5,
	normal: 1,
	"normal-minus": .75,
	"rare-plus": .5,
	rare: .2,
	never: 0,
	always: Infinity,
};

export const SOCIAL_CARD_RATE : ProbabilityRate = {
	common: 5,
	"common-minus": 2,
	"normal-plus": 1.5,
	normal: 1,
	"normal-minus": .75,
	"rare-plus": .5,
	rare: .2,
	never: 0,
	always: Infinity,
};

export const RANDOM_POWER_RATE : ProbabilityRate = {
	common: 5,
	"common-minus": 2,
	"normal-plus": 1.5,
	normal: 1,
	"normal-minus": .75,
	"rare-plus": .5,
	rare: .2,
	never: 0,
	always: Infinity,
};

//written in percentages
export const ITEM_DROP_RATE : ProbabilityRate = {
	common: .50,
	"common-minus": .20,
	"normal-plus": .10,
	normal: .05,
	"normal-minus": .02,
	"rare-plus": .01,
	rare: .005,
	never: 0,
	always: 1,
};

export const CARD_DROP_RATE : ProbabilityRate = {
	common: 0.08,
	"common-minus": .05,
	"normal-plus": .04,
	normal: .03,
	"normal-minus": .02,
	"rare-plus": .01,
	rare: .005,
	never: 0,
	always: 1,
};

