import { STUDENT_SKILLS } from "./student-skills.js";
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
	"disengage",
	"resist-status",
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
	"subject-english",
	"subject-math",
	"subject-language",
	"subject-science",
	"subject-history",
	"music",
	"crime",
	"training",
	"gaming",
	"spiritual",
	"metaverse",
	"exclude",
	"deception",
	"emotional",
	"friendly",
	"apathetic",
	"callous",
	"competitive",
	"strength",
	"agility",
	"patience",
	"seduction",
	"cheap",
	"luxury",
	"humor",
	"prank",
	"on-social-target",
	"on-cameo",
	"on-other",
	"on-group",
	"deep-conversation",
	"smalltalk",
	"free-event",
] as const;


const ROLL_TAGS_PARTIAL = HTMLTools.createLocalizationObject(ROLL_TAG_LIST.slice().sort(), "persona.roll.rolltag");

export const ROLL_TAGS = foundry.utils.mergeObject( {...ROLL_TAGS_PARTIAL}, STUDENT_SKILLS);

export type RollTag = keyof typeof ROLL_TAGS;

const MERGED_ROLL_TAGS_AND_CARD_TAGS= foundry.utils.mergeObject({...ROLL_TAGS}, CARD_TAGS);

export const ROLL_TAGS_AND_CARD_TAGS= Object.fromEntries(Object.entries(MERGED_ROLL_TAGS_AND_CARD_TAGS ).sort( ([ak, _av], [bk, _bv]) =>  ak.localeCompare(bk))) as typeof MERGED_ROLL_TAGS_AND_CARD_TAGS;



