import { PERSONA_STATS_LIST } from "./persona-stats.js";
import { HTMLTools } from "../module/utility/HTMLTools.js";
import { STUDENT_SKILLS_LIST } from "./student-skills.js";

export const ENVIRONMENTAL_MODIFIERS = [
	"shadowPresence",
	"concordiaPresence",
	"encounterSize",
	"hardMod",
	"mixedMod",
	"numberOfSearches",
	"treasureFind", // adds to search rolls of 4 or better
	"shadowMoneyBoostPercent",
] as const;

const DEPRECATED_TYPES = [
	"wpnMult",
	"magLow",
	"magHigh",
	"wpnDmg_low",
	"wpnDmg_high",
	"weakestSlot",
	"pay",
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
	"hpCostMult",
	"mpCostMult",
	"xp-multiplier",
	"extraMaxPowers",
	"max-defense-boosts",
	"max-resist-boosts",
	"d-mon-storage",
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


];

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
} as const satisfies Record<string, readonly ModifierTarget[]>;

export type ModifierCategory = keyof typeof MODIFIER_CATEGORIES;

export const MODIFIER_CATEGORIES_LOCALIZATION = HTMLTools.createLocalizationObject(Object.keys(MODIFIER_CATEGORIES) as ModifierCategory[], "persona.modifier.categories");



export const MODIFIERS_TABLE = HTMLTools.createLocalizationObject(MODIFIERLIST, "persona.modifier");
// export const MODIFIERS_TABLE = Object.fromEntries(
// 	MODIFIERLIST.map ( x=> [x, `persona.modifier.${x}`])
// );

export type NonDeprecatedModifierType = Exclude<ModifierTarget, typeof DEPRECATED_TYPES[number]>;
export type ModifierTarget = typeof MODIFIERLIST[number];

