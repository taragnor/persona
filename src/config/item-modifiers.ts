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
] as const;

export const MODIFIERLIST = [
	"allAtk",
	"wpnAtk",
	"magAtk",
	"itemAtk",
	"wpnDmg",
	"magDmg",
	"variance",
	"criticalBoost",
	"critResist",
	"instantDeathResistanceMult",
	"afflictionRange",
	"instantDeathRange",
	"allOutDmgMult", //adds to weapon multiplier on AoA
	"allDefenses",
	"ref",
	"fort",
	"will",
	"kill", //kill defense bonus
	"ail", //ailment defnese bonus
	"DCIncrease",
	"socialRoll",
	...STUDENT_SKILLS_LIST,
	"save",
	"recovery",
	"recovery-mult",
	"maxhp",
	"maxhpMult", //old weird new form, additive multiplier
	"maxhpMult-new", //newform straight multiply
	"maxmp",
	"maxmpMult",
	"hpCostMult",
	"mpCostMult",
	"wpnDmg_low",
	"wpnDmg_high",
	"disengage",
	"weakestSlot",
	"pay",
	"xp-multiplier",
	"shadow-xp-value",
	"extraMaxPowers",
	"initiative",
	"starting-energy",
	"energy-per-turn",
	"max-energy",
	"actions-per-turn",
	"baleful-status-duration",
	"d-mon-storage",
	"max-defense-boosts",
	"max-resist-boosts",
	...ENVIRONMENTAL_MODIFIERS,
	...DEPRECATED_TYPES,

] as const;


export const MODIFIERS_TABLE = HTMLTools.createLocalizationObject(MODIFIERLIST, "persona.modifier");
// export const MODIFIERS_TABLE = Object.fromEntries(
// 	MODIFIERLIST.map ( x=> [x, `persona.modifier.${x}`])
// );

export type NonDeprecatedModifierType = Exclude<ModifierTarget, typeof DEPRECATED_TYPES[number]>;
export type ModifierTarget = typeof MODIFIERLIST[number];

