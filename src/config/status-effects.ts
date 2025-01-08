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
		icon:  "icons/magic/unholy/strike-body-life-soul-purple.webp",
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
		id: "despair",
		icon:  "icons/svg/cave.svg",
	}, {
		id: "expel",
		icon:  "icons/magic/light/explosion-star-glow-silhouette.webp",
	}, {
		id: "fading",
		icon:  "icons/svg/invisible.svg",
	}, {
		id: "fear",
		icon:  "icons/svg/terror.svg",
	}, {
		id: "poison",
		icon:  "icons/svg/poison.svg",
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
	}, {
		id: "defense-boost",
		icon:  "icons/svg/mountain.svg",
	},{
		id: "defense-nerf",
		icon:  "icons/svg/net.svg",
	}, {
		id: "attack-boost",
		icon:  "icons/svg/light.svg",
	}, {
		id: "attack-nerf",
		icon:  "icons/svg/light-off.svg",
	}, {
		id: "damage-boost",
		icon:  "icons/svg/pawprint.svg",
	}, {
		id: "damage-nerf",
		icon:  "icons/svg/direction.svg",
	}, {
		id: "bonus-action",
		icon:  "icons/svg/angel.svg",
	}, {
		id: "magic-charge",
		icon:  "icons/magic/lightning/bolt-strike-explosion-blue.webp",
	}, {
		id: "power-charge",
		icon:  "icons/magic/control/buff-strength-muscle-damage-orange.webp",
	}, {
		id: "crippled",
		icon:  "icons/skills/wounds/injury-eyes-blood-red.webp",
	}, {
		id: "injured",
		icon:  "icons/skills/wounds/injury-triple-slash-bleed.webp",
	},
	{
		id: "jailed",
		icon:  "icons/environment/traps/steel.webp",
	}, {
		id: "exhausted",
		icon:  "icons/svg/unconscious.svg",
	},
	{
		id: "sticky",
		icon:   "icons/svg/anchor.svg"
	},
	{
		id: "baton-pass",
		icon: "icons/weapons/staves/staff-orb-red.webp",

	},
	{
		id:"challenged",
		icon: "icons/skills/melee/swords-parry-block-blue.webp"
	},
	{
		id:"rage",
		icon: "icons/skills/melee/unarmed-punch-fist.webp",
	},
	{
		id:"phys-shield",
		icon: "icons/equipment/shield/heater-steel-grey.webp",
	},
	{
		id:"magic-shield",
		icon: "icons/equipment/shield/heater-steel-segmented-purple.webp",
	},
	{
		id:"fight-in-spirit-attack",
		icon: "icons/skills/melee/strike-polearm-light-orange.webp",
	},
	{
		id:"fight-in-spirit-defense",
		icon: "icons/skills/melee/shield-block-gray-yellow.webp",
		changes: [
			{
				key: "system.autoFailThreshold",
				value: "25",
				mode: 1,
			},
		],
	},
] as const;

CONFIG.statusEffects = STATUS_EFFECT_LIST
	.map( ({id, icon})=> {
	return {id, icon, name:`persona.status.${id}`};
});

export type StatusEffectId = typeof STATUS_EFFECT_LIST[number]["id"];

export const STATUS_EFFECT_TRANSLATION_TABLE = Object.fromEntries(
	CONFIG.statusEffects.map( ({id, name}) => [id, name])
);

export const STATUS_EFFECT_DURATIONS_LIST = [
	"permanent",
	"expedition",
	"combat",
	"presave-easy",
	"presave-normal",
	"presave-hard",
	"save-normal",
	"save-easy",
	"save-hard",
	"3-rounds",
	"UEoNT",
	"USoNT",
	"UEoT",
	"instant",
] as const;

export type StatusDuration = typeof STATUS_EFFECT_DURATIONS_LIST[number];

export const STATUS_EFFECT_DURATIONS = Object.fromEntries(
	STATUS_EFFECT_DURATIONS_LIST.map( x=> [x, `persona.status.duration.${x}`]
	)
);
