export const PERSON_TAG_LIST = [
	"student",
	"professor",
	"social-shadow",
	"teammate",
	"npc-ally",
	"pc",
	"child",
	"tech-enthusiast",
] as const;

export const CREATURE_TAG_LIST = [
	"neko",
	"cu",
	"fairy",
	"foul",
	"human",
	"elemental",
	"beast",
	"machine",
	"god",
	"avian",
	"dragon",
	"evil-spirit",
	...PERSON_TAG_LIST,
] as const;


export type CreatureTag = typeof CREATURE_TAG_LIST[number];

export const CREATURE_TAGS = Object.fromEntries(
	CREATURE_TAG_LIST.map(x=> [x, `persona.creatureType.${x}`])
);
