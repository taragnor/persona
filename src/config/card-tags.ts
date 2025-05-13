import { HTMLTools } from "../module/utility/HTMLTools.js";

export const CARD_RESTRICTOR_TAGS = [
	"friends",
	"date",
	"student-stuff",
	"introductory",
	"middle-range",
	"trusted",
	"disabled",
	"real-world",
	"one-shot",
	"question",
] as const;

export const CARD_SITUATIONS = [
	"romantic-place",
	"public-place",
	"school-grounds",
	"in-metaverse",
] as const;

export const CARD_TAG_LIST = [
	"",
	...CARD_RESTRICTOR_TAGS,
	...CARD_SITUATIONS,
] as const;


export type CardTag = typeof CARD_TAG_LIST[number];

export const CARD_TAGS = HTMLTools.createLocalizationObject(CARD_TAG_LIST.slice().sort(), "persona.card.tag");
