import { CARD_TAGS } from "./card-tags.js";
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
	"persuasive",
	"artistic",
	"studying",
	"music",
	"crime",
	"linguistic",
	"gaming",
	"metaverse",
	"deception",
	"emotional",
	"friendly",
	"apathetic",
	"callous",
	"competitive",
	"strength",
	"agility",
	"seduction",
	"humor",
	"prank",
	"on-social-target",
	"on-cameo",
	"deep-conversation",
	"smalltalk",
] as const;

export type RollTag = typeof ROLL_TAG_LIST[number];

export const ROLL_TAGS = HTMLTools.createLocalizationObject(ROLL_TAG_LIST.slice().sort(), "persona.roll.rolltag");

export const ROLL_TAGS_AND_CARD_TAGS= foundry.utils.mergeObject(ROLL_TAGS, CARD_TAGS);
