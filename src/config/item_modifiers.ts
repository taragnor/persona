export const MODIFIERLIST = [
	"wpnAtk",
	"magAtk",
	"wpnDmg",
	"magDmg",
	"criticalBoost",
	"ref",
	"fort",
	"will",
]

export const MODIFIERS_TABLE = Object.fromEntries(
	MODIFIERLIST.map ( x=> [x, `persona.modifier.${x}`])
);
