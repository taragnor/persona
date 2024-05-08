

export const COMBAT_TRIGGER_LIST = [
	"on-damage",
	"on-kill-target",
	"on-combat-start",
	"on-use-power",
	"on-combat-end",
	"on-inflict-status",
	"enter-metaverse",
	"exit-metaverse",
] as const;

export const NONCOMBAT_TRIGGER_LIST = [
	"on-attain-tarot-perk",

] as const;

export const TRIGGER_LIST = [
	...COMBAT_TRIGGER_LIST,
	...NONCOMBAT_TRIGGER_LIST,
] as const;


export const TRIGGERS = Object.fromEntries(
	TRIGGER_LIST.map( x=> [x, `persona.triggers.${x}`])
);

export type Trigger = typeof TRIGGER_LIST[number];

export type CombatTrigger = typeof COMBAT_TRIGGER_LIST[number];

export type NonCombatTrigger = typeof NONCOMBAT_TRIGGER_LIST[number];

