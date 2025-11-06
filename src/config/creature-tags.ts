import {Tag} from "../module/item/persona-item.js";
import { HTMLTools } from "../module/utility/HTMLTools.js";
import {ShadowRole} from "./shadow-types.js";

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
	"not-like-other-girls",
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

export const PERSONA_TAG_LIST = [
	"neko",
	"cu",
	"angel",
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
	"simulated",
	"d-mon",
	"pc-d-mon",
	"persona",
	"lone-persona",
	"custom-persona",
] as const;

export type PersonaTag = typeof PERSONA_TAG_LIST[number] | ShadowRole;

export const PERSONA_TAGS = HTMLTools.createLocalizationObject(PERSONA_TAG_LIST, "persona.creatureType");

export const CREATURE_TAG_LIST = [
	...PERSONA_TAG_LIST,
	...PERSON_TAG_LIST,
	...PERSONALITY_TAG_LIST,
	...TRAIT_TAG_LIST,
	...AI_TAGS,
] as const;

export type InternalCreatureTag = typeof CREATURE_TAG_LIST[number];
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type CreatureTag = InternalCreatureTag | Tag["id"];

export const CREATURE_TAGS = HTMLTools.createLocalizationObject(CREATURE_TAG_LIST, "persona.creatureType");
