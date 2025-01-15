export const CARD_TAG_LIST = [
	"",
	"friends",
	"date",
	"student-stuff",
	"introductory",
	"middle-range",
	"trusted",
	"disabled",
] as const;

export type CardTag = typeof CARD_TAG_LIST[number];

export const CARD_TAGS = Object.fromEntries(
	CARD_TAG_LIST.map(x=> [x, `persona.card.tag.${x}`])
);
