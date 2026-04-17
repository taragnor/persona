import { HTMLTools } from "../module/utility/HTMLTools.js";
import {DAMAGE_TYPES_LIST, REALDAMAGETYPES, REALDAMAGETYPESLIST} from "./damage-types.js";

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
	"combat",
	"usable-while-dead",
	"usable-while-sealed",
	"theurgy",
  "swappable",
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
  "by-power",
  ...REALDAMAGETYPESLIST,
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
	 "cooldown",
	...RESTRICTION_TAGS,
	...STATUS_AILMENT_POWER_TAGS,
	...POWER_TYPE_TAGS,
	...POWER_TRAIT_TAGS,
] as const;

type RawPowerId = typeof POWER_TAGS_LIST[number] | Exclude<typeof DAMAGE_TYPES_LIST[number], "none">;

export type PowerTag = RawPowerId | Tag;

export type PowerTagOrId = RawPowerId | Tag["id"];

export const POWER_TAGS = HTMLTools.createLocalizationObject(POWER_TAGS_LIST.slice().sort(), "persona.power.tag");

