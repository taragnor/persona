export const DEFENSE_CATEGORY_LIST = [
	"pathetic",
	"weak",
	"normal",
	"strong",
	"ultimate",
] as const;

export type DefenseCategory = typeof DEFENSE_CATEGORY_LIST[number];

export const DEFENSE_CATEGORY = Object.fromEntries(
	DEFENSE_CATEGORY_LIST.map(x=> [x,`persona.defense.category.${x}`])
);
