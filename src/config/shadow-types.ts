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
	"npc-ally",
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

export function shadowRoleMultiplier (role: ShadowRole) : number{
	switch (role) {
		case "elite":
			return 2;
		case "miniboss":
			return 6;
		case "miniboss-lord":
			return 3;
		case "boss":
			return 7;
		case "boss-lord":
			return 4;
		case "treasure-shadow":
			return 4;
		default:
			return 1;
	}
}


