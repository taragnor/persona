import {HTMLTools} from "../module/utility/HTMLTools.js";

const ATTACK_RESULT_LIST = [
	"hit",
	"miss" ,
	"crit" ,
	"reflect" ,
	"block" ,
	"absorb",
] as const;

export const ATTACK_RESULT = HTMLTools.createLocalizationObject(ATTACK_RESULT_LIST, "persona.attack.result");
