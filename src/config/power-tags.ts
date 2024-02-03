export const POWER_TAGS_LIST = [
	"fire",
	"ice",
	"elec",
	"wind",
	"light",
	"dark",
	"buff",
	"debuff",
	"weapon",
	"healing",

] as const;

export type PowerTag = typeof POWER_TAGS_LIST[number];

export const POWER_TAGS = Object.fromEntries(
	POWER_TAGS_LIST.map(x => ([x, `persona.power.tag.${x}`])
	));
