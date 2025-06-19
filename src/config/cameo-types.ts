export const CAMEO_TYPES_LIST = [
	"none",
	"any-pc",
	"above",
	"below",
	"above+below",
	"student",
	"any",
	"invite-sl4",
	"invite-couple",
	"buy-in-2",
	"date-default",
	"cockblocker"
] as const;


export type CameoType = typeof CAMEO_TYPES_LIST[number];

export const CAMEO_TYPES = Object.fromEntries(
	CAMEO_TYPES_LIST.map(x => [x, `persona.social.cameo-type.${x}`])
);
