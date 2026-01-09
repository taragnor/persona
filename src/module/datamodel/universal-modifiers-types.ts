export const UNIVERSAL_MODIFIERS_TYPE_LIST = [
	"global",
	"scene",
	"room",
	"event-social",
	"event-metaverse",
] as const;

export type UniversalModifierType = typeof UNIVERSAL_MODIFIERS_TYPE_LIST[number];

export const UNIVERSAL_MODIFIERS_TYPE = Object.fromEntries(
	UNIVERSAL_MODIFIERS_TYPE_LIST.map( x=> [x, `persona.universalModifier.${x}`])
);
