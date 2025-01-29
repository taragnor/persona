export const SHADOW_ROLE_LIST = [
	"base",
	"soldier",
	"lurker",
	"support",
	"tank",
	"brute",
	"artillery",
	"assassin",
	"controller",
	"elite",
	"miniboss",
	"boss",
	"miniboss-lord",
	"boss-lord",
	"treasure-shadow",
] as const;

export type ShadowRole = typeof SHADOW_ROLE_LIST[number];

export const SHADOW_ROLE= Object.fromEntries(
	SHADOW_ROLE_LIST.map( x=> [x, `persona.shadow.role.${x}`])
);


export const SHADOW_CREATURE_TYPE_LIST = [
	"shadow",
	"daemon",
	"demon",
	"enemy-metaverse-user",
] as const;



export const SHADOW_CREATURE_TYPE =  Object.fromEntries(
	SHADOW_CREATURE_TYPE_LIST.map( x=> [x, `persona.foe.type.${x}`])
);


export const CREATURE_TYPE_LIST = [
	...SHADOW_CREATURE_TYPE_LIST,
	"pc",
	"npc"
] as const;

export type CreatureType = typeof CREATURE_TYPE_LIST[number];

export const CREATURE_TYPE =  Object.fromEntries(
	CREATURE_TYPE_LIST.map( x=> [x, `persona.foe.type.${x}`])
);

