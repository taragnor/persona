import { HTMLTools } from "../module/utility/HTMLTools.js";

export const SHADOW_ROLE_LIST = [
	"base",
	"soldier",
	"lurker",
	"support",
	"tank",
	"brute",
	"minion",
	"artillery",
	"assassin",
	"controller",
	"elite",
	"miniboss",
	"boss",
	"treasure-shadow",
	"solo",
	"summoner",
	"duo",
] as const;

export type ShadowRole = typeof SHADOW_ROLE_LIST[number];

export const SHADOW_ROLE = HTMLTools.createLocalizationObject(SHADOW_ROLE_LIST, "persona.shadow.role");
// export const SHADOW_ROLE= Object.fromEntries(
// 	SHADOW_ROLE_LIST.map( x=> [x, `persona.shadow.role.${x}`])
// );


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
			return 2.5;
		case "miniboss":
			return 3.5;
		case "boss":
			return 4.5;
		case "solo":
			return 7;
		case "duo":
			return 4;
		case "treasure-shadow":
			return 8;
		default:
			return 1;
	}
}

export function poisonDamageMultiplier (role: ShadowRole) : number {
	switch (role) {
		case "solo":
			return 0.2;
		case "duo":
			return 0.5;
		case "elite":
			return 0.75;
		case "summoner":
			return 0.75;
		default:
			return 1;
	}


}
