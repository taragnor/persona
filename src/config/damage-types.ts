import { HTMLTools } from "../module/utility/HTMLTools.js";
import {Defense} from "./defense-types.js";

export const REALDAMAGETYPESLIST = [
	"physical",
	"gun",
	"fire",
	"cold",
	"wind",
	"lightning",
	"light",
	"dark",
	"untyped",
	"healing",
	"all-out",
	"none",
] as const;

export const DAMAGETYPESLIST = [
	...REALDAMAGETYPESLIST,
	"by-power", //by power or weapon
] as const;

export const DAMAGETYPES = HTMLTools.createLocalizationObject(DAMAGETYPESLIST, "persona.damage.types");

export const REALDAMAGETYPES = Object.fromEntries(
	REALDAMAGETYPESLIST.map( x=> [x, `persona.damage.types.${x}`])
);

export type DamageType = ( (typeof DAMAGETYPESLIST)[number]);

export type RealDamageType = ( (typeof REALDAMAGETYPESLIST)[number])

export type ResistType = Exclude<DamageType, "none" | "healing" | "untyped" | "all-out" | "by-power">;

export const RESIST_STRENGTH_LIST = [
	"weakness",
	"normal",
	"resist",
	"block",
	"absorb",
	"reflect"
] as const;

export type ResistStrength = typeof RESIST_STRENGTH_LIST[number];

export const RESIST_STRENGTHS = HTMLTools.createLocalizationObject(RESIST_STRENGTH_LIST, "persona.damage.resist");

export const ELEMENTAL_DEFENSE_LINK : Record<Defense, ResistType[]> = {
	"ref": ["physical", "fire"],
	"fort": ["cold", "wind", "lightning"],
	none: [],
	kill: [],
	ail: []
};

export const DAMAGE_LEVELS_LIST = [
	"-",
	"none",
	"fixed",
	"miniscule",
	"basic",
	"light",
	"medium",
	"heavy",
	"severe",
	"colossal",
] as const;

export type DamageLevel = typeof DAMAGE_LEVELS_LIST[number];

export const DAMAGE_LEVELS = HTMLTools.createLocalizationObject(DAMAGE_LEVELS_LIST, "persona.damage.levels");


