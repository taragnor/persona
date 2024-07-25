export const POWER_TAGS_LIST = [
	"amped",
	"fire",
	"charged",
	"ice",
	"elec",
	"wind",
	"light",
	"dark",
	"almighty",
	"buff",
	"debuff",
	"weapon",
	"healing",
	"mobile",
	"basicatk",
	"charm",
	"fear",
	"sleep",
	"confusion",
] as const;

export type PowerTag = typeof POWER_TAGS_LIST[number];

export const POWER_TAGS = Object.fromEntries(
	POWER_TAGS_LIST
	.slice()
	.sort()
	.map(x => ([x, `persona.power.tag.${x}`] as const))
);

