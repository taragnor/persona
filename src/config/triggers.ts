export const TRIGGER_LIST = [
	"on-damage",
	"on-kill-target",
	"on-combat-start",
	"on-use-power",
	"on-combat-end",
] as const;


export const TRIGGERS = Object.fromEntries(
	TRIGGER_LIST.map( x=> [x, `persona.triggers.${x}`])
);

export type Trigger = typeof TRIGGER_LIST[number];

