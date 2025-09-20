import {HTMLTools} from "../module/utility/HTMLTools.js";

const TAG_TYPES_LIST = [
	"persona",
	"actor",
	"power",
	"equipment",
	"roll",
	"card",
	"role",
] as const;

export type TagType = typeof TAG_TYPES_LIST[number];


export const TAG_TYPES = HTMLTools.createLocalizationObject(TAG_TYPES_LIST, "persona.tag.tagtype");


