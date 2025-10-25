import {HTMLTools} from "../module/utility/HTMLTools.js";

const DEFENSE_TYPE_LIST = [
"fort" ,
"ref" ,
// "will",
"kill", // instantkill
"ail", //ailment
] as const;

const ALL_DEFENSE_TYPES_LIST = [
	...DEFENSE_TYPE_LIST,
	"none",

] as const;

export type Defense = typeof ALL_DEFENSE_TYPES_LIST[number];

export const REAL_DEFENSE_TYPES = HTMLTools.createLocalizationObject(DEFENSE_TYPE_LIST,  "persona.defense");

export const DEFENSE_TYPES = HTMLTools.createLocalizationObject(ALL_DEFENSE_TYPES_LIST, "persona.defense");


