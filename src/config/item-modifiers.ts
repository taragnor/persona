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

export const MODIFIERLIST = [
	"allAtk",
	"wpnAtk",
	"magAtk",
	"itemAtk",
	"wpnDmg",
	"wpnMult",
	"magDmg",
	"magLow",
	"magHigh",
	"criticalBoost",
	"critResist",
	"instantDeathResistanceMult",
	"allOutDmgMult", //adds to weapon multiplier on AoA
	"allDefenses",
	"ref",
	"fort",
	"will",
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
	"extraMaxPowers",
	"initiative",
	"starting-energy",
	"energy-per-turn",
	"actions-per-turn",
	"baleful-status-duration",
	"d-mon-storage",
	"max-defense-boosts",
	"max-resist-boosts",
	...ENVIRONMENTAL_MODIFIERS,
] as const;


export const MODIFIERS_TABLE = HTMLTools.createLocalizationObject(MODIFIERLIST, "persona.modifier");
// export const MODIFIERS_TABLE = Object.fromEntries(
// 	MODIFIERLIST.map ( x=> [x, `persona.modifier.${x}`])
// );

export type ModifierTarget = typeof MODIFIERLIST[number];

