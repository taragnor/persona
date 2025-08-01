import { HTMLTools } from "../module/utility/HTMLTools.js";

export const EQUIP_SLOTS_LIST = [
	"body",
	"accessory",
	"weapon_crystal",
	"none",
	"key-item",
	"crafting",
] as const;


export const EQUIP_SLOTS = Object.fromEntries(
	EQUIP_SLOTS_LIST.map( x=> [x, `persona.equipslots.${x}`])
);


export const CONSUMABLE_SUBTYPE_LIST = [
	"consumable",
	"reusable"
] as const;

export const CONSUMABLE_SUBTYPES = HTMLTools.createLocalizationObject(CONSUMABLE_SUBTYPE_LIST, "persona.consumables.subtype");
