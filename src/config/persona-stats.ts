import { HTMLTools } from "../module/utility/HTMLTools.js";

const PERSONA_STATS_LIST = [
	"str",
	"mag",
	"end",
	"agi",
	"luk"
] as const;

export type PersonaStat = typeof PERSONA_STATS_LIST[number];

export const PERSONA_STATS = HTMLTools.createLocalizationObject(PERSONA_STATS_LIST, "persona.statistic.stat");

