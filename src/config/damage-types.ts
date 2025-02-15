import { PC } from "../module/actor/persona-actor";

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

export const DAMAGETYPES = Object.fromEntries(
	DAMAGETYPESLIST.map( x=> [x, `persona.damage.types.${x}`])
);
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

export const RESIST_STRENGTHS = Object.fromEntries(
	RESIST_STRENGTH_LIST.map( x=> [x, `persona.damage.resist.${x}`])
);

export const ELEMENTAL_DEFENSE_LINK : Record<keyof PC["system"]["combat"]["defenses"], ResistType[]> = {
	"ref": ["physical", "fire"],
	"fort": ["cold", "wind", "lightning"],
	"will": ["dark", "light"],
};

