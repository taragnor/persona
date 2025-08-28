import { HTMLTools } from "../module/utility/HTMLTools.js";

export const PERMA_BUFF_LIST = [
	"max-hp",
	"max-mp",
] as const;

export type PermaBuffType = typeof PERMA_BUFF_LIST[number];

export const PERMA_BUFFS = HTMLTools.createLocalizationObject(PERMA_BUFF_LIST, "persona.permabuff");
