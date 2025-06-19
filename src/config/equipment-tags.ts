import { HTMLTools } from "../module/utility/HTMLTools.js";

export const WEAPON_TAGS_LIST = [
	"bow",
	"fist",
	"mace",
	"blade",
	"axe",
	"heavy",
	"light-weapon",
	"spear",
] as const;

export const EQUIPMENT_TAGS_LIST = [
	"nil",
	"metaverse",
	"mundane",
	"common-loot",
	"consumable",
	"weapon",
	"key-item",
	"body",
	"accessory",
	"weapon_crystal",
	"non-equippable",
	"incriminating",
	"skill-card",
	"ticket",
	"occult",
	"wonderland",
	"cat-themed",
	"clock",
	"tech",
	"book",
	"fashion",
	"female",
	"male",
	"music",
	"child",
	"drink",
	"food",
	"trinket",
	"expensive",
	"luxury",
	"pyrotechnic",
	"fairy",
	"health",
	"cute",
	"student",
	"romantic",
	"medical",
	"expensive-very",
	"sexual",
	"drug",
	"defensive",
	"crafting",
	"d-mon",
	...WEAPON_TAGS_LIST,
] as const;


export type WeaponTag= typeof WEAPON_TAGS_LIST[number];

export type EquipmentTag = typeof EQUIPMENT_TAGS_LIST[number];

export const WEAPON_TAGS = HTMLTools.createLocalizationObject(WEAPON_TAGS_LIST.slice().sort(), "persona.equipment.tag");

export const EQUIPMENT_TAGS = HTMLTools.createLocalizationObject(EQUIPMENT_TAGS_LIST.slice().sort(), "persona.equipment.tag");
