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
] as const;

export const MODIFIERS_TABLE = Object.fromEntries(
	MODIFIERLIST.map ( x=> [x, `persona.modifier.${x}`])
);

export type ModifierTarget = typeof MODIFIERLIST[number];

