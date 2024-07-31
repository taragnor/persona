export const INCREMENTAL_ADVANCE_TYPES = [
	"hp",
	"lvl_bonus",
	"powers",
	"damage",
] as const;

export type INCREMENTAL_ADVANCE_TYPES = typeof INCREMENTAL_ADVANCE_TYPES[number];


export const INCREMENTAL_ADVANCES =  Object.fromEntries(  INCREMENTAL_ADVANCE_TYPES
	.map (x=> [x, `persona.incremental.type.${x}`])
);
