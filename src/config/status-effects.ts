export const STATUS_EFFECT_LIST = [
	{
		id: "burn",
		icon: "icons/svg/fire.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "charmed",
		icon:  "icons/svg/heal.svg",
		tags: ["baneful"]
	}, {
		id: "blocking",
		icon:  "icons/svg/shield.svg",
		tags: ["beneficial"]
	}, {
		id: "curse",
		icon:  "icons/magic/unholy/strike-body-life-soul-purple.webp",
		tags: ["lethal"]
	}, {
		id: "confused",
		icon:  "icons/svg/stoned.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "down",
		icon:  "icons/svg/falling.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "dizzy",
		icon:  "icons/svg/daze.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "despair",
		icon:  "icons/svg/cave.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "sealed",
		icon:  "icons/svg/silenced.svg",
		tags: ["baneful"]
	}, {
		id: "expel",
		icon:  "icons/magic/light/explosion-star-glow-silhouette.webp",
		tags: ["lethal"]
	}, {
		id: "fading",
		icon:  "icons/svg/invisible.svg",
		tags: ["incapacitating", "distracting", "baneful", "fade"],
	}, {
		id: "full-fade",
		icon:  "icons/svg/door-exit.svg",
		tags: ["incapacitating", "fade"],
	}, {
		id: "fear",
		icon:  "icons/svg/terror.svg",
		tags: ["distracting", "baneful"],
	}, {
		id: "poison",
		icon:  "icons/svg/poison.svg",
		tags: ["baneful"],
	}, {
		id: "vulnerable",
		icon:  "icons/svg/paralysis.svg",
		tags: ["baneful"],
	}, {
		id: "forgetful",
		icon:  "icons/svg/silenced.svg",
		tags: ["baneful", "distracting"],
	}, {
		id: "frozen",
		icon:  "icons/svg/frozen.svg",
		tags: ["baneful", "distracting"],
	}, {
		id: "sleep",
		icon:  "icons/svg/sleep.svg",
		tags: ["baneful", "distracting", "incapacitating"],
	}, {
		id: "shock",
		icon:  "icons/svg/lightning.svg",
		tags: ["baneful", "distracting", "incapacitating"],
	}, {
		id: "blind",
		icon: "icons/svg/blind.svg",
		tags: ["baneful", "distracting"],
	},
	{
		id: "mouse",
		icon: "icons/creatures/mammals/rodent-rat-green.webp",
		tags: ["baneful", "distracting"],
	},
	{
		id: "buffed",
		icon:  "icons/svg/upgrade.svg",
		tags: [],
	}, {
		id: "debuffed",
		icon:  "icons/svg/downgrade.svg",
		tags: [],
	}, {
		id: "defense-boost",
		icon:  "icons/svg/mountain.svg",
		tags: ["buff"],
	},{
		id: "defense-nerf",
		icon:  "icons/svg/net.svg",
		tags: ["debuff"],
	}, {
		id: "attack-boost",
		icon:  "icons/svg/light.svg",
		tags: ["buff"],
	}, {
		id: "attack-nerf",
		icon:  "icons/svg/light-off.svg",
		tags: ["debuff"],
	}, {
		id: "damage-boost",
		icon:  "icons/svg/pawprint.svg",
		tags: ["buff"],
	}, {
		id: "damage-nerf",
		icon:  "icons/svg/direction.svg",
		tags: ["debuff"],
	}, {
		id: "bonus-action",
		icon:  "icons/svg/angel.svg",
		tags: [],
	}, {
		id: "magic-charge",
		icon:  "icons/magic/lightning/bolt-strike-explosion-blue.webp",
		tags: [],
	}, {
		id: "power-charge",
		icon:  "icons/magic/control/buff-strength-muscle-damage-orange.webp",
		tags: [],
	}, {
		id: "crippled",
		icon:  "icons/skills/wounds/injury-eyes-blood-red.webp",
		tags: ["downtime", "distracting", "baneful"],
	}, {
		id: "injured",
		icon:  "icons/skills/wounds/injury-triple-slash-bleed.webp",
		tags: ["downtime", "baneful"],
	},

	{
		id: "jailed",
		icon:  "icons/environment/traps/steel.webp",
		tags: ["downtime", "distracting"],
	}, {
		id: "rested",
		icon:  "icons/skills/social/thumbsup-approval-like.webp",
		tags: ["downtime"],
	}, {
		id: "exhausted",
		icon:  "icons/svg/unconscious.svg",
		tags: ["downtime", "baneful"],
	}, {
		id: "tired",
		icon:   "icons/svg/down.svg",
		tags: ["downtime"],
	}, {
		id: "sticky",
		icon:   "icons/svg/anchor.svg",
		tags: [],
	},
	{
		id: "baton-pass",
		icon: "icons/weapons/staves/staff-orb-red.webp",
		tags: [],
	},
	{
		id:"challenged",
		icon: "icons/skills/melee/swords-parry-block-blue.webp",
		tags: [],
	},
	{
		id:"rage",
		icon: "icons/skills/melee/unarmed-punch-fist.webp",
		tags: ["baneful"],
	},
	{
		id:"phys-shield",
		icon: "icons/equipment/shield/heater-steel-grey.webp",
		tags: [],
	},
	{
		id:"magic-shield",
		icon: "icons/equipment/shield/heater-steel-segmented-purple.webp",
		tags: [],
	},
	{
		id:"fight-in-spirit-attack",
		icon: "icons/skills/melee/strike-polearm-light-orange.webp",
		tags: [],
	},
	{
		id:"fight-in-spirit-defense",
		icon: "icons/skills/melee/shield-block-gray-yellow.webp",
		tags: [],
		changes: [
			{
				key: "system.autoFailThreshold",
				value: "25",
				mode: 1,
			},
		],
	},
] as const satisfies Omit<StatusEffectObject, "name">[];

declare global {
	interface StatusEffectObject {
		tags: StatusTag[];
	}
}


type StatusTag = "distracting" | "baneful" | "incapacitating" | "debuff" | "buff" | "lethal" | "downtime" | "beneficial" | "fade";

CONFIG.statusEffects = STATUS_EFFECT_LIST
	.map( ({id, icon, tags})=> {
	return {id, icon, tags, name:`persona.status.${id}`};
});

export type StatusEffectId = typeof STATUS_EFFECT_LIST[number]["id"];

export const STATUS_EFFECT_TRANSLATION_TABLE = Object.fromEntries(
	CONFIG.statusEffects.map( ({id, name}) => [id, name])
);

export const statusMap = new Map(CONFIG.statusEffects.map( k => ([k.id, k])) );

export const STATUS_EFFECT_DURATIONS_TYPE_LIST = [
	"permanent",
	"expedition",
	"combat",
	"save",
	"X-rounds",
	"X-days",
	"UEoNT",
	"USoNT",
	"UEoT",
	"instant",
	"3-rounds", // deprecated
	"save-normal", //deprecated
	"save-easy", //deprecated
	"save-hard", //deprected
	"presave-easy", //deprecated
	"presave-normal", //deprecated
	"presave-hard", //deprecated
	"anchored" //special
] as const;

export type StatusDurationType = typeof STATUS_EFFECT_DURATIONS_TYPE_LIST[number];

export const STATUS_EFFECT_DURATION_TYPES = Object.fromEntries(
	STATUS_EFFECT_DURATIONS_TYPE_LIST.map( x=> [x, `persona.status.duration.${x}`]
	)
);

