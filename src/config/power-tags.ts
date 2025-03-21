export const STATUS_POWER_TAGS  = [
	"charm",
	"fear",
	"sleep",
	"confusion",
	"poison",
	"rage",
	"blind",
	"mouse",
] as const;

export const POWER_TYPE_TAGS = [
	"power",
	"consumable",
	"exotic",
	"shadow-only",
	"teamwork",
	"opener",
	"ailment",
	"navigator",
	"downtime",
	"follow-up",
	"mandatory",
	"summon",
	"passive",
	"defensive",
	"instantKill",
] as const;

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
	"gun",
	"healing",
	"mobile",
	"basicatk",
	"high-cost",
	...STATUS_POWER_TAGS,
	...POWER_TYPE_TAGS,
] as const;


export type PowerTag = typeof POWER_TAGS_LIST[number];

export const POWER_TAGS = Object.fromEntries(
	POWER_TAGS_LIST
	.slice()
	.sort()
	.map(x => ([x, `persona.power.tag.${x}`] as const))
);

