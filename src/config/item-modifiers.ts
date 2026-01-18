import { PERSONA_STATS_LIST } from "./persona-stats.js";
import { HTMLTools } from "../module/utility/HTMLTools.js";
import { STUDENT_SKILLS_LIST } from "./student-skills.js";

export const ENVIRONMENTAL_MODIFIERS = [
	"shadowPresence",
	"concordiaPresence",
	"encounterSize",
	"hardMod",
	"mixedMod",
	"treasureMod", //increases chance of running into treasure shadows
	"numberOfSearches",
	"treasureFind", // adds to search rolls of 4 or better
	"shadowMoneyBoostPercent",
	"treasure-roll-bonus", // adds to actual treasure roll in new treasure system
	"shadowItemDropRate", // multiplies item drop rate
] as const;

const DEPRECATED_TYPES = [
	"wpnMult",
	"magLow",
	"magHigh",
	"wpnDmg_low",
	"wpnDmg_high",
	"weakestSlot",
	"pay",
	"hpCostMult",
	"mpCostMult",
] as const;

export const COMBAT_BONUS_TYPES = [
	"disengage",
	"initiative",
] as const;

export const OFFENSE_TYPES = [
	"allAtk",
	"wpnAtk",
	"magAtk",
	"itemAtk",
	"wpnDmg",
	"magDmg",
	"variance",
	"criticalBoost",
	"afflictionRange",
	"instantDeathRange",
	"allOutDmgMult", //adds to weapon multiplier on AoA
] as const;

const DEFENSE_TYPES = [
	"allDefenses",
	"ref",
	"fort",
	"will",
	"kill", //kill defense bonus
	"ail", //ailment defnese bonus
	"dr",
	"armor-dr",
	"armor-dr-mult",
	"instantDeathResistanceMult",
	"critResist",
	"baleful-status-duration",
	"save",
] as const;

export const ACTOR_STATS_TYPES = [
	"recovery",
	"recovery-mult",
	"maxhp",
	"maxhpMult", //old weird new form, additive multiplier
	"maxhpMult-new", //newform straight multiply
	"maxmp",
	"maxmpMult",
	"xp-multiplier",
	"inactive-party-member-xp-gains", //decimal percentage additive , max 1.0
	"navigator-xp-mult", //XP gained while navigating
	"extraMaxPowers", // extra sideobard powers
	"persona-sideboard", // extra sideobard peronsas
	"inactive-persona-xp",
	"sideboard-persona-xp",
	"max-defense-boosts",
	"max-resist-boosts",
	"d-mon-storage",
	"fusion-xp-boost-sl-percent",
] as const;

export const SHADOW_STATS_TYPES = [
	"encounter-size-multiplier",
	"shadow-xp-value",
	"starting-energy",
	"energy-per-turn",
	"actions-per-turn",
	"max-energy",
] as const;

export const STUDENT_SKILLS_TYPES = [
	...STUDENT_SKILLS_LIST,
	"DCIncrease",
	"socialRoll",
] as const;

export const OTHER_TYPES = [
	"power-energy-cost",
	"power-energy-req",
	"power-mp-cost",
	"power-mp-cost-mult",
	"power-hp-cost",
] as const;

export const MODIFIERLIST = [
	...OFFENSE_TYPES,
	...DEFENSE_TYPES,
	...COMBAT_BONUS_TYPES,
	...PERSONA_STATS_LIST,
	...SHADOW_STATS_TYPES,
	...STUDENT_SKILLS_TYPES,
	...ACTOR_STATS_TYPES,
	...ENVIRONMENTAL_MODIFIERS,
	...DEPRECATED_TYPES,
	...OTHER_TYPES,

] as const;

export const MODIFIER_CATEGORIES = {
	"combat" : COMBAT_BONUS_TYPES,
	"defense": DEFENSE_TYPES,
	"offense": OFFENSE_TYPES,
	"persona": PERSONA_STATS_LIST,
	"shadow": SHADOW_STATS_TYPES,
	"social": STUDENT_SKILLS_TYPES,
	"actor": ACTOR_STATS_TYPES,
	"metaverse": ENVIRONMENTAL_MODIFIERS,
	"deprecated": DEPRECATED_TYPES,
	"other": OTHER_TYPES,
} as const satisfies Record<string, readonly ModifierTarget[]>;

export type ModifierCategory = keyof typeof MODIFIER_CATEGORIES;

export const MODIFIER_CATEGORIES_LOCALIZATION = HTMLTools.createLocalizationObject(Object.keys(MODIFIER_CATEGORIES) as ModifierCategory[], "persona.modifier.categories");



export const MODIFIERS_TABLE = HTMLTools.createLocalizationObject(MODIFIERLIST, "persona.modifier");

export type NonDeprecatedModifierType = Exclude<ModifierTarget, typeof DEPRECATED_TYPES[number]>;
export type ModifierTarget = typeof MODIFIERLIST[number];


const ITEM_TARGETS_LIST = [
	"source"
];

export type ItemTarget = typeof ITEM_TARGETS_LIST[number];

export const ITEM_TARGETS = HTMLTools.createLocalizationObject(ITEM_TARGETS_LIST, "persona.item-targets");

const ITEM_PROPERTIES_LIST = [
	"item-level",
] as const;

export type ItemProperty = typeof ITEM_PROPERTIES_LIST[number];


export const ITEM_PROPERTIES = HTMLTools.createLocalizationObject(ITEM_PROPERTIES_LIST, "persona.item-property");
