export const PERK_TYPES_LIST =[
	"standard",
	"standard-or-cameo",
	"custom-only",
	"standard-or-custom",
	"standard-or-date",
	"none",
] as const;

export type PerkType = typeof PERK_TYPES_LIST[number];

export const PERK_TYPES = Object.fromEntries (
	PERK_TYPES_LIST.map( x=> [x, `persona.social.perk-type.${x}`])
);
