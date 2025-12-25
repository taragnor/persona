import { HTMLTools } from "../module/utility/HTMLTools.js";

export const STATUS_AILMENT_POWER_TAGS  = [
	"dizzy",
	"charm",
	"fear",
	"sleep",
	"confusion",
	"poison",
	"rage",
	"blind",
	"mouse",
	"sealed",
	"despair",
] as const;

export const POWER_TYPE_TAGS = [
	"consumable",
	"teamwork",
	"opener",
	"ailment",
	"navigator",
	"downtime",
	"downtime-minor",
	"follow-up",
	"mandatory",
	"summon",
	"passive",
	"defensive",
	"magic",
	"instantKill",
	"no-crit",
	"pierce",
	"hack",
	"exploration",
	"usable-while-dead",
	"usable-while-sealed",
] as const;

const RESTRICTION_TAGS = [
	"exotic",
	"shadow-only",
	"non-inheritable",
	"lone-persona-only",
	"persona-only",
] as const;

const POWER_TRAIT_TAGS = [
	"inaccurate",
	"accurate",
	"high-crit",
	"high-cost",
	"price-lower-for-shadow",
	"mobile",
	"half-on-miss",
	"flurry",
	"multi-target",
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
	"physical",
	"gun",
	"variable-damage",
	"healing",
	"basicatk",
	"status-removal",
	"resurrection",
	...RESTRICTION_TAGS,
	...STATUS_AILMENT_POWER_TAGS,
	...POWER_TYPE_TAGS,
	...POWER_TRAIT_TAGS,
] as const;

export type PowerTag = typeof POWER_TAGS_LIST[number] | Tag;

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type PowerTagOrId = typeof POWER_TAGS_LIST[number] | Tag["id"]

export const POWER_TAGS = HTMLTools.createLocalizationObject(POWER_TAGS_LIST.slice().sort(), "persona.power.tag");

