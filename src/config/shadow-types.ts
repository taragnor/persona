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
	"boss-minion",
	"gatekeeper",
] as const;

export type ShadowRole = typeof SHADOW_ROLE_LIST[number];

export const SHADOW_ROLE = HTMLTools.createLocalizationObject(SHADOW_ROLE_LIST, "persona.shadow.role");

export const SHADOW_CREATURE_TYPE_LIST = [
	"shadow",
	"daemon",
	"demon",
	"enemy-metaverse-user",
	"npc-ally",
	"velvet-dweller",
	"d-mon",
	"persona",
] as const;



// export const SHADOW_CREATURE_TYPE =  Object.fromEntries(
// 	SHADOW_CREATURE_TYPE_LIST.map( x=> [x, `persona.foe.type.${x}`])
// );
export const SHADOW_CREATURE_TYPE = HTMLTools.createLocalizationObject(SHADOW_CREATURE_TYPE_LIST, "persona.foe.type");


export const CREATURE_TYPE_LIST = [
	...SHADOW_CREATURE_TYPE_LIST,
	"pc",
	"npc"
] as const;

export type CreatureType = typeof CREATURE_TYPE_LIST[number];

export const CREATURE_TYPE = HTMLTools.createLocalizationObject(CREATURE_TYPE_LIST, "persona.foe.type");

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
