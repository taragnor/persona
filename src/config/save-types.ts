export const SAVE_TYPES = {
	"normal": 11,
	"easy" : 6,
	"hard" : 16
} as const;

export type SaveType = keyof typeof SAVE_TYPES;

export const SAVE_TYPES_LOCALIZED = Object.fromEntries(
	Object.keys(SAVE_TYPES).map(a=> [a, `persona.saves.types.${a}`])
);

