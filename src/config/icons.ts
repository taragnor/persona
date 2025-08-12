import { DamageType } from "./damage-types";

const iconPath =   `systems/persona/img/icon/` as const;

/** applies the full iconpath to a list of iconfilenames*/
function iconize<const T extends string>(obj: Record<T, string>) {
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

