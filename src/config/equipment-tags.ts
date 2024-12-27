export const EQUIPMENT_TAGS_LIST = [
	"nil",
	"metaverse",
	"mundane",
	"consumable",
	"weapon",
	"key-item",
	"body",
	"accessory",
	"weapon_crystal",
	"non-equippable",
	"incriminating",
	"skill-card",
] as const;

export type EquipmentTag = typeof EQUIPMENT_TAGS_LIST[number];

export const EQUIPMENT_TAGS = Object.fromEntries(
	EQUIPMENT_TAGS_LIST
	.slice()
	.sort()
	.map(x => ([x, `persona.equipment.tag.${x}`] as const))
);

