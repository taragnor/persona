import { STUDENT_SKILLS_LIST } from "./student-skills.js";
export const MODIFIERLIST = [
	"maxhp",
	"wpnAtk",
	"magAtk",
	"wpnDmg",
	"magDmg",
	"criticalBoost",
	"ref",
	"fort",
	"will",
	...STUDENT_SKILLS_LIST,
	"save",
	"recovery",
] as const;

export const MODIFIERS_TABLE = Object.fromEntries(
	MODIFIERLIST.map ( x=> [x, `persona.modifier.${x}`])
);

export type ModifierTarget = typeof MODIFIERLIST[number];

