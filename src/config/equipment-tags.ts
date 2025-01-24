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
] as const;

export type EquipmentTag = typeof EQUIPMENT_TAGS_LIST[number];

export const EQUIPMENT_TAGS = Object.fromEntries(
	EQUIPMENT_TAGS_LIST
	.slice()
	.sort()
	.map(x => ([x, `persona.equipment.tag.${x}`] as const))
);

