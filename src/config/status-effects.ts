import { HTMLTools } from "../module/utility/HTMLTools.js";

import { PersonaError } from "../module/persona-error.js";

const PERSONA_ICONS_PATH = "systems/persona/img/icon" as const;

export const BUFF_MAX_POTENCY = 2;

export const STATUS_EFFECT_LIST = [
	{
		id: "burn",
		img: "icons/svg/fire.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "charmed",
		img:`${PERSONA_ICONS_PATH}/P3R_Charm_Icon.png`,
		// icon:  "icons/svg/heal.svg",
		tags: ["baneful"]
	}, {
		id: "blocking",
		img:  "icons/svg/shield.svg",
		tags: ["beneficial"]
	}, {
		id: "curse",
		img:  "icons/magic/unholy/strike-body-life-soul-purple.webp",
		tags: ["lethal"]
	}, {
		id: "confused",
		img:  "icons/svg/stoned.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "down",
		img:  "icons/svg/falling.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "dizzy",
		img:  "icons/svg/daze.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "despair",
		img:  "icons/svg/cave.svg",
		tags: ["distracting", "baneful"]
	}, {
		id: "sealed",
		img:  "icons/svg/silenced.svg",
		tags: ["baneful"]
	}, {
		id: "expel",
		img:  "icons/magic/light/explosion-star-glow-silhouette.webp",
		tags: ["lethal"]
	}, {
		id: "fading",
		img:  "icons/svg/invisible.svg",
		tags: ["incapacitating", "distracting", "baneful", "fade"],
	}, {
		id: "full-fade",
		img:  "icons/svg/door-exit.svg",
		tags: ["incapacitating", "fade"],
	}, {
		id: "fear",
		img:`${PERSONA_ICONS_PATH}/P3R_Fear_Icon.png`,
		// icon:  "icons/svg/terror.svg",
		tags: ["distracting", "baneful"],
	}, {
		id: "poison",
		img:  "icons/svg/poison.svg",
		tags: ["baneful"],
	}, {
		id: "vulnerable",
		img:  "icons/svg/paralysis.svg",
		tags: ["baneful"],
	}, {
		id: "frozen",
		img:`${PERSONA_ICONS_PATH}/P3R_Freeze_Icon.png`,
		tags: ["baneful", "distracting"],
	}, {
		id: "sleep",
		img:  "icons/svg/sleep.svg",
		tags: ["baneful", "distracting", "incapacitating"],
	}, {
		id: "shock",
		img:  "icons/svg/lightning.svg",
		tags: ["baneful", "distracting", "incapacitating"],
	}, {
		id: "blind",
		img: "icons/svg/blind.svg",
		tags: ["baneful", "distracting"],
	}, {
		id: "mouse",
		img: "icons/creatures/mammals/rodent-rat-green.webp",
		tags: ["baneful", "distracting"],
	// }, {
		// id: "buffed",
		// icon:  "icons/svg/upgrade.svg",
		// tags: [],
	// }, {
		// id: "debuffed",
		// icon:  "icons/svg/downgrade.svg",
		// tags: [],
	}, {
		id: "defense-boost",
		img:  "icons/svg/mountain.svg",
		tags: ["buff"],
	},{
		id: "defense-nerf",
		img:  "icons/svg/net.svg",
		tags: ["debuff"],
	}, {
		id: "attack-boost",
		img:  "icons/svg/light.svg",
		tags: ["buff"],
	}, {
		id: "attack-nerf",
		img:  "icons/svg/light-off.svg",
		tags: ["debuff"],
	}, {
		id: "damage-boost",
		img:  "icons/svg/pawprint.svg",
		tags: ["buff"],
	}, {
		id: "damage-nerf",
		img:  "icons/svg/direction.svg",
		tags: ["debuff"],
	}, {
		id: "bonus-action",
		img:  "icons/svg/angel.svg",
		tags: [],
	}, {
		id: "magic-charge",
		img:  "icons/magic/lightning/bolt-strike-explosion-blue.webp",
		tags: ["beneficial"],
	}, {
		id: "power-charge",
		img:  "icons/magic/control/buff-strength-muscle-damage-orange.webp",
		tags: ["beneficial"],
	}, {
		id: "crippled",
		img:  "icons/skills/wounds/injury-eyes-blood-red.webp",
		tags: ["downtime", "distracting", "baneful"],
	}, {
		id: "injured",
		img:  "icons/skills/wounds/injury-triple-slash-bleed.webp",
		tags: ["downtime", "baneful"],
	}, {
		id: "jailed",
		img:  "icons/environment/traps/steel.webp",
		tags: ["downtime", "distracting"],
	}, {
		id: "rested",
		img:  "icons/skills/social/thumbsup-approval-like.webp",
		tags: ["downtime", "fatigue"],
	}, {
		id: "exhausted",
		img:  "icons/svg/unconscious.svg",
		tags: ["downtime", "baneful", "fatigue"],
	}, {
		id: "tired",
		img:   "icons/svg/down.svg",
		tags: ["downtime", "fatigue"],
	}, {
		id: "fatigued",
		img:   "icons/svg/down.svg",
		tags: ["downtime", "fatigue"],
	}, {
		id: "sticky",
		img:   "icons/svg/anchor.svg",
		tags: ["identifier"],
	}, {
		id: "baton-pass",
		img: "icons/weapons/staves/staff-orb-red.webp",
		tags: ["out-of-turn-action"],
	}, {
		id: "teamwork-shift",
		img: "icons/skills/social/diplomacy-handshake.webp",
		tags: ["out-of-turn-action", "enable-teamwork"],
	}, {
		id: "tactical-shift",
		img: "icons/svg/wingfoot.svg",
		tags: ["out-of-turn-action"],
	}, {
		id:"challenged",
		img: "icons/skills/melee/swords-parry-block-blue.webp",
		tags: [],
	},{
		id:"protected",
		img: "icons/magic/holy/barrier-shield-winged-cross.webp",
		tags: ["beneficial"],

	},{
		id:"rage",
		img: "icons/skills/melee/unarmed-punch-fist.webp",
		tags: ["baneful"],
	}, {
		id:"phys-shield",
		img: "icons/equipment/shield/heater-steel-grey.webp",
		tags: ["beneficial"],
	}, {
		id:"magic-shield",
		img: "icons/equipment/shield/heater-steel-segmented-purple.webp",
		tags: ["beneficial"],
	}, {
		id:"fight-in-spirit-attack",
		img: "icons/skills/melee/strike-polearm-light-orange.webp",
		tags: ["beneficial"],
	}, {
		id:"fight-in-spirit-defense",
		img: "icons/skills/melee/shield-block-gray-yellow.webp",
		tags: ["beneficial"],
		changes: [
			{
				key: "system.autoFailThreshold",
				value: "25",
				mode: 1,
			},
		],
	}, {
		id:"preparing-fusion",
		img: "icons/skills/social/diplomacy-unity-alliance.webp",
		tags: [],
	},
] as const satisfies Omit<StatusEffectObject, "name">[];



declare global {
	interface StatusEffectObject {
		tags: StatusTag[];
	}
}

type StatusTag = typeof STATUS_PROPERTY_TAGS[number];

const STATUS_PROPERTY_TAGS = [
"distracting" ,
"baneful" ,
"incapacitating" ,
"debuff" ,
"buff" ,
"lethal" ,
"downtime" ,
"beneficial" ,
"fade" ,
"fatigue" ,
"identifier" ,
"out-of-turn-action" ,
"enable-teamwork",
"fusion"
] as const;

CONFIG.statusEffects = STATUS_EFFECT_LIST
	.map( ({id, img, tags})=> {
	return {id, img, tags, name:`persona.status.${id}`};
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DEPRECATED_STATUS_EFFECTS = [
	 // "blind", //becomes dizzy
	 // "fear", //becomes confused
] as const;

export type DeprecatedStatusEffects = typeof DEPRECATED_STATUS_EFFECTS[number];

export type StatusEffectId = Exclude<typeof STATUS_EFFECT_LIST[number]["id"], DeprecatedStatusEffects>;

export type FatigueStatusId = Extract<StatusEffectId, "tired" | "exhausted" | "rested" | "fatigued">

export const STATUS_EFFECT_TRANSLATION_TABLE = Object.fromEntries(
	CONFIG.statusEffects.map( ({id, name}) => [id, name])
) as Record<StatusEffectId, LocalizationString>;

export const statusMap = new Map(CONFIG.statusEffects.map( k => ([k.id, k])) );

export const STATUS_EFFECT_DURATIONS_TYPE_LIST = [
	"permanent",
	"expedition",
	"X-exploration-turns",
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

export const STATUS_EFFECT_DURATION_TYPES = HTMLTools.createLocalizationObject(STATUS_EFFECT_DURATIONS_TYPE_LIST, "persona.status.duration");

Hooks.on("ready", () => {
	console.log("Sorting status effects");
	CONFIG.statusEffects.sort( (a,b) =>  {
		const la = game.i18n.localize(a.name as LocalizationString);
		const lb = game.i18n.localize(b.name as LocalizationString);
		return la.localeCompare(lb);
	});
});

export function statusToFatigueLevel(id: FatigueStatusId | undefined) :number {
	switch (id) {
		case "rested": return 2;
		case undefined:return 1;
		case "exhausted": return -2;
		case "fatigued": return 0;
		case "tired": return -1;
	}
}

export function localizeStatusId(id: StatusEffectId) : string {
	const st = statusMap.get(id);
	if (!st) {
		PersonaError.softFail(`couldn't find statusId ${id}`);
		return "ERROR";
	}
	return game.i18n.localize(st.name as LocalizationString);
}


export function fatigueLevelToStatus(lvl: number): FatigueStatusId | undefined {
	switch (true) {
		case lvl <= -2: return "exhausted";
		case lvl == -1: return "tired";
		case lvl == 0: return "fatigued";
		case lvl == 1: return undefined;
		case lvl >= 2: return "rested";
		default:
			throw new PersonaError(`Unknown Fatigue Level: ${lvl}`);
	}
}

export const STATUS_AILMENT_LIST = [
	"charmed",
	"fear",
	"dizzy",
	"sleep",
	"confused",
	"poison",
	"rage",
	"blind",
	"mouse",
	"sealed",
	"despair",
] as const satisfies StatusEffectId[];

export const STATUS_AILMENT_SET : Set<StatusEffectId> = new Set(STATUS_AILMENT_LIST);

export const STATUSES_BY_TAG : Record<StatusTag, Set<StatusEffectId>> = Object.fromEntries(
	STATUS_PROPERTY_TAGS.map( tag => [ tag, new Set( CONFIG.statusEffects
		.filter( x=> x.tags.includes(tag))
		.map( x=> x.id as StatusEffectId)
	)])
) as Record<StatusTag, Set<StatusEffectId>>;

export type StatusEffectPlus = StatusEffectId
  | "triggering";
