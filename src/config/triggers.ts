import { HTMLTools } from "../module/utility/HTMLTools.js";

export const COMBAT_TRIGGER_LIST = [
	"on-damage",
	"on-kill-target",
	"on-combat-start",
	"on-combat-start-global",
	"on-use-power",
	"on-combat-end",
	"on-combat-end-global",
	"on-inflict-status",
	"start-turn",
	"end-turn",
] as const;

export const NONCOMBAT_TRIGGER_LIST = [
	"on-attain-tarot-perk",
	"on-enter-region",
	"on-search-end",
	"on-presence-check",
	"on-clock-tick",
	"on-clock-change",
	"on-open-door",
	"enter-metaverse",
	"exit-metaverse",
	"on-metaverse-turn",
	"on-roll",
	"on-active-scene-change",
] as const;

export const TRIGGER_LIST = [
	...COMBAT_TRIGGER_LIST,
	...NONCOMBAT_TRIGGER_LIST,
] as const;

export const TRIGGERS = HTMLTools.createLocalizationObject(TRIGGER_LIST, "persona.triggers");
// export const TRIGGERS = Object.fromEntries(
// 	TRIGGER_LIST.map( x=> [x, `persona.triggers.${x}`])
// );

export type Trigger = typeof TRIGGER_LIST[number];

export type CombatTriggerTypes = typeof COMBAT_TRIGGER_LIST[number];

export type NonCombatTriggerTypes = typeof NONCOMBAT_TRIGGER_LIST[number];

