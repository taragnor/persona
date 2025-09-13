import { DamageType } from "./damage-types";

const iconPathBase =   `systems/persona/img/icon/` as const;

/** applies the full iconpath to a list of iconfilenames*/
function iconize<const T extends string>(obj: Record<T, string>, iconPath : string = iconPathBase) {
	function i<const T extends string>(fileName: T) {
		return `${iconPath}${fileName}`;
	}
	return Object.fromEntries(
		Object.entries<string>(obj)
		.map( ([k,v]) => [k, i(v)])
	) as Record<T, string>;
}

const DAMAGE_ICONS_OBJ = {
	physical: "phys.webp",
	gun: "pierce.png",
	fire: "fire.webp",
	cold: "ice.webp",
	wind: "wind.webp",
	lightning: "elec.webp",
	light: "light.webp",
	dark: "dark.webp",
	untyped: "untyped.webp",
	healing: "healing.webp",
	"all-out": "untyped.webp",
	none: "",
	"by-power": ""
} satisfies  Record<DamageType, string>;

export const DAMAGE_ICONS = iconize(DAMAGE_ICONS_OBJ);

const POWER_ICONS_LIST = {
	...DAMAGE_ICONS_OBJ,
	"ailment": "ailment.webp",
	"support": "support.webp",
	"passive": "passive.webp",
} as const;

export const POWER_ICONS = iconize(POWER_ICONS_LIST);


const EQUIPMENT_ICONS_OBJ = {
	"female-armor": "P3R_Equipment_Body_F_Icon.png",
	"male-armor": "P3R_Equipment_Body_M_Icon.png",
	"generic-armor": "P3R_Equipment_Body_MF_Icon.png",
	"hp-item": "P3R_HP_Icon.png",
	"hpsp-item": "P3R_HPSP_Icon.png",
	"sp-item": "P3R_SP_Icon.png",
	"key-item": "P3R_Key_Item_Icon.png",
	"gift": "P3R_Gift_Icon.png",
	"consumable": "P3R_Item_Icon.png",
	"material-1": "P3R_Material_1_Icon.png",
	"material-2": "P3R_Material_2_Icon.png",
	"material-3": "P3R_Material_3_Icon.png",
	"material-4": "P3R_Material_4_Icon.png",
	"sword": "P3R_Weapon_One_Handed_Sword_Icon.png",
	"2hsword": "P3R_Weapon_Two_Handed_Sword_Icon.png",
	"spear": "P3R_Weapon_Spear_Icon.png",
	"knife": "P3R_Weapon_Knife_Icon.png",
	"bow": "P3R_Weapon_Bow_Icon.png",
	"axe": "P3R_Weapon_Axe_Icon.png",
	"rapier": "P3R_Weapon_Rapier_Icon.png",
	"fist": "P3R_Weapon_Gloves_Icon.png",
	"accessory" : "P3R_Equipment_Accessory_Icon.png",
	"gem" : "P3R_Gem_Icon.png",
	"card":	"P3R_Skill_Icon.png",
} as const;

export type ItemCategory = keyof typeof EQUIPMENT_ICONS_OBJ | keyof typeof POWER_ICONS_LIST;

export const EQUIPMENT_ICONS = iconize(EQUIPMENT_ICONS_OBJ, `${iconPathBase}items/`);

export const ITEM_ICONS = {
	...EQUIPMENT_ICONS,
	...POWER_ICONS,
} as const;

export const CATEGORY_SORT_ORDER : Record<ItemCategory | "", number>  = {
	"":1000,
	physical: 20,
	gun: 21,
	fire: 22,
	cold: 23,
	wind: 24,
	lightning: 25,
	light: 26,
	dark: 27,
	untyped: 28,
	healing: 29,
	"all-out": 30,
	none: 31,
	"by-power": 32,
	ailment: 13,
	support: 14,
	passive: 15,
	"hp-item": 1,
	"sp-item": 2,
	"hpsp-item": 3,
	"female-armor": 10,
	"male-armor": 11,
	"generic-armor": 12,
	accessory: 13,
	gem: 14,
	card: 15,
	"key-item": 20,
	gift: 19,
	consumable: 4,
	"material-1": 8,
	"material-2": 9,
	"material-3": 10,
	"material-4": 11,
	sword: 1,
	"2hsword": 2,
	spear: 3,
	knife: 4,
	bow: 5,
	axe: 6,
	rapier: 7,
	fist: 8,
} as const;

