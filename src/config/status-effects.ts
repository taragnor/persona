export const STATUS_EFFECT_LIST = [
	{
		id: "burn",
		icon: "icons/svg/fire.svg",
	}, {
		id: "charmed",
		icon:  "icons/svg/heal.svg",
	}, {
		id: "blocking",
		icon:  "icons/svg/shield.svg",
	}, {
		id: "curse",
		icon:  "",
	}, {
		id: "confused",
		icon:  "icons/svg/stoned.svg",
	}, {
		id: "down",
		icon:  "icons/svg/falling.svg",
	}, {
		id: "depleted",
		icon:  "icons/svg/degen.svg",
	}, {
		id: "dizzy",
		icon:  "icons/svg/daze.svg",
	}, {
		id: "expel",
		icon:  "",
	}, {
		id: "fear",
		icon:  "icons/svg/terror.svg",
	}, {
		id: "vulnerable",
		icon:  "icons/svg/paralysis.svg",
	}, {
		id: "forgetful",
		icon:  "icons/svg/silenced.svg",
	}, {
		id: "frozen",
		icon:  "icons/svg/frozen.svg",
	}, {
		id: "sleep",
		icon:  "icons/svg/sleep.svg",
	}, {
		id: "shock",
		icon:  "icons/svg/lightning.svg",
	}, {
		id: "supercharged",
		icon:  "icons/svg/aura.svg",
	}, {
		id: "buffed",
		icon:  "icons/svg/upgrade.svg",
	}, {
		id: "debuffed",
		icon:  "icons/svg/downgrade.svg",
	}
] as const;

CONFIG.statusEffects= STATUS_EFFECT_LIST.map( ({id, icon})=> {
	return {id, icon, name:`persona.status.${id}`};
});

export type StatusEffectId = typeof STATUS_EFFECT_LIST[number]["id"];

export const STATUS_EFFECT_TRANSLATION_TABLE = Object.fromEntries(
	CONFIG.statusEffects.map( ({id, name}) => [id, name])
);

export const STATUS_EFFECT_DURATIONS_LIST = [
	"expedition",
	"combat",
	"save-normal",
	"save-easy",
	"save-hard",
	"UEoNT",
	"instant",
] as const;

export type StatusDuration = typeof STATUS_EFFECT_DURATIONS_LIST[number];

export const STATUS_EFFECT_DURATIONS = Object.fromEntries(
	STATUS_EFFECT_DURATIONS_LIST.map( x=> [x, `persona.status.duration.${x}`]
	)
);
