import { STUDENT_SKILLS_LIST } from "./student-skills.js";

export const ENVIRONMENTAL_MODIFIERS = [
	"shadowPresence",
	"concordiaPresence",
	"encounterSize",
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
	"socialRoll",
	...STUDENT_SKILLS_LIST,
	"save",
	"recovery",
	"recovery-mult",
	"maxhp",
	"maxhpMult",
	"maxmp",
	"maxmpMult",
	"hpCostMult",
	"mpCostMult",
	"wpnDmg_low",
	"wpnDmg_high",
	"disengage",
	"weakestSlot",
	"pay",
	"extraMaxPowers",
	"initiative",
	"starting-energy",
	"energy-per-turn",
	"actions-per-turn",
	"baleful-status-duration",
	...ENVIRONMENTAL_MODIFIERS,
] as const;


export const MODIFIERS_TABLE = Object.fromEntries(
	MODIFIERLIST.map ( x=> [x, `persona.modifier.${x}`])
);

export type ModifierTarget = typeof MODIFIERLIST[number];

