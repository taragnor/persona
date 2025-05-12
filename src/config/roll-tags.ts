import { HTMLTools } from "../module/utility/HTMLTools.js";

export const ROLL_TAG_LIST = [
	"",
	"physical",
	"mental",
	"social",
	"fatigue",
	"save",
	"attack",
	"opening",
	"activation",
	"defense",
	"academic",
	"school-test",
	"rest",
	"romantic",
	"commanding",

] as const;

export type RollTag = typeof ROLL_TAG_LIST[number];

export const ROLL_TAGS = HTMLTools.createLocalizationObject(ROLL_TAG_LIST.slice().sort(), "persona.roll.rolltag");
