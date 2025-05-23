import { HTMLTools } from "../module/utility/HTMLTools.js";

export const PERSON_TAG_LIST = [
	"student",
	"professor",
	"social-shadow",
	"teammate",
	"npc-ally",
	"pc",
	"child",
	"stuck-in-metaverse",
] as const;

export const PERSONALITY_TAG_LIST = [
	"adventurous",
	"musician",
	"gamer",
	"timid",
	"tech-enthusiast",
	"artist",
] as const;


export const TRAIT_TAG_LIST = [
	"unscannable",
	"enigmatic",
	"no-xp",
] as const;

export const AI_TAGS = [
	"stupid",
	"smart",
] as const;

export const CREATURE_TAG_LIST = [
	"neko",
	"cu",
	"fairy",
	"foul",
	"human",
	"elemental",
	"beast",
	"machine",
	"god",
	"avian",
	"dragon",
	"card-soldier",
	"evil-spirit",
	"rat",
	"true-demon",
	"pure-shadow",
	"d-mon",
	...PERSON_TAG_LIST,
	...PERSONALITY_TAG_LIST,
	...TRAIT_TAG_LIST,
	...AI_TAGS,
] as const;

export type CreatureTag = typeof CREATURE_TAG_LIST[number];

export const CREATURE_TAGS = HTMLTools.createLocalizationObject(CREATURE_TAG_LIST, "persona.creatureType");
