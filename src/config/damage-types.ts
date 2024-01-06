export const DAMAGETYPESLIST = [
	"physical",
	"fire",
	"cold",
	"wind",
	"lightning",
	"light",
	"dark",
	"untyped",
	"healing",
	"none"
] as const;

export const DAMAGETYPES = Object.fromEntries(
	DAMAGETYPESLIST.map( x=> [x, `persona.damage.types.${x}`])
);

export type DamageType = ((typeof DAMAGETYPESLIST)[number]);

export type ResistType = Exclude<DamageType, "none" | "healing" | "untyped">;

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

