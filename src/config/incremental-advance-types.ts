import { PC } from "../module/actor/persona-actor.js";

export const INCREMENTAL_ADVANCE_TYPES = [
	"attack",
	"defenses",
	"magicLow",
	"magicHigh",
	"talent",
] as const satisfies (keyof PC["system"]["combat"]["classData"]["incremental"])[];

export type INCREMENTAL_ADVANCE_TYPES = typeof INCREMENTAL_ADVANCE_TYPES[number];


export const INCREMENTAL_ADVANCES =  Object.fromEntries(  INCREMENTAL_ADVANCE_TYPES
	.map (x=> [x, `persona.incremental.type.${x}`])
);
