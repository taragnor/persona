export const OTHER_CONSEQUENCE_LIST= [
	"search-twice",
	"ignore-surprise",
	"add-talent-to-list",
	"add-power-to-list",
	"add-creature-tag",
  "teach-power",
  "add-room-effect",
  "grant-persona",
] as const;

	export const OTHER_CONSEQUENCES = Object.fromEntries (
		OTHER_CONSEQUENCE_LIST.map( x => [x, `persona.othereffect.${x}`]));

export type OtherConsequenceType = typeof OTHER_CONSEQUENCE_LIST[number];

