import { HTMLTools } from "../module/utility/HTMLTools.js";

const DEPRECATED_CONSEQUENCE_TYPES = [
	"save-slot", //deprecated, don't expend slot you normally would
	"recover-slot", // deprecated
	"add-escalation", // deprecated
	"dmg-low", //deprecated
	"dmg-high", //deprecated
	"dmg-allout-low", //deprecated
	"dmg-allout-high", //deprecated
	"dmg-mult", //deprecated
	"hp-loss", //deprecated
	"half-hp-cost", //deprecated
	"absorb",
	"addStatus",
	"removeStatus",
	"escalationManipulation",
	"expend-slot",
	"alter-energy",
	"damage-new",
	"addStatus",
	"removeStatus",
	"escalationManipulation",
	"extraAttack",
	"revive",
	"extraTurn",
	"scan",

] as const;

export const NON_DEPRECATED_CONSQUENCELIST = [
	"none",
	"modifier", //singular-mod
	"modifier-new", //multi-mod
	"combat-effect",
	"expend-item",
	"add-talent-to-list",
	"add-power-to-list",
	"teach-power",
	"other-effect",
	"set-flag",
	"inspiration-cost",
	"display-msg",
	"social-card-action",
	"alter-variable",
	"add-creature-tag",
	"dungeon-action",
	"perma-buff",
	"play-sound",
	"raise-status-resistance", // functions as raise and lower
	"raise-resistance",
	"lower-resistance",
	"use-power",
	"alter-mp",
	"alter-fatigue-lvl",
	"gain-levels",
	"cancel",
	"inventory-action",
] as const;

export const CONSQUENCELIST = [
	...NON_DEPRECATED_CONSQUENCELIST,
	...DEPRECATED_CONSEQUENCE_TYPES,
] as const;


export type ConsequenceType = typeof CONSQUENCELIST[number];

export  const MODIFIER_VARIABLE_LIST= [
	"escalationDie", //Escalation Die
	"tensionPool"
] as const;

export type ModifierVariable = typeof MODIFIER_VARIABLE_LIST[number];

export const MODIFIER_VARIABLES = HTMLTools.createLocalizationObject(MODIFIER_VARIABLE_LIST, "persona.modifier-variable");

export const CONSQUENCETYPES = Object.fromEntries(
CONSQUENCELIST.map( x=> [x, `persona.effecttypes.${x}`])
);

export const NONDEP_CONSQUENCETYPES = HTMLTools.createLocalizationObject(NON_DEPRECATED_CONSQUENCELIST, "persona.effecttypes");

export const POWERTYPESLIST = [
	"weapon",
	"magic",
	"social-link",
	"other",
	"passive",
	"none",
	"standalone",
	"defensive",
	"downtime",
] as const;

export type PowerType = typeof POWERTYPESLIST[number];

export const POWERTYPES= HTMLTools.createLocalizationObject(POWERTYPESLIST, "persona.power.types");
// export const POWERTYPES= Object.fromEntries( POWERTYPESLIST.map(x=> [x, `persona.power.types.${x}`]));

export const TARGETINGLIST = [
	"1-engaged",
	"1-nearby",
	"1-nearby-dead",
	"1-random-enemy",
	"1d4-random",
	"1d4-random-rep",
	"1d3-random",
	"1d3-random-rep",
	"self",
	"all-enemies",
	"all-allies",
	"all-dead-allies",
	"all-others",
	"everyone", //doesn't include dead
	"everyone-even-dead", // includes dead
] as const;

export const TARGETING= HTMLTools.createLocalizationObject(TARGETINGLIST, "persona.power.targets");
// export const TARGETING= Object.fromEntries( TARGETINGLIST.map(x=> [x, `persona.power.targets.${x}`]));

export const SHADOW_CHANGE_REQ_LIST_FULL= [
	"none",
	"always",
	"not-enhanced", //deprecated
	"charged-req",
	"supercharged",
	"supercharged-not-enhanced", //deprecated
	"amp-req",
	"amp-fulldep",
] as const;

export const SHADOW_CHANGE_REQ_LIST= [
	"none",
	"charged-req",
	"always",
	"amp-req",
	"supercharged",
	"amp-fulldep",
] as const;

export type ShadowChargeReq = typeof SHADOW_CHANGE_REQ_LIST[number];

export const SHADOW_CHARGE_REQ = Object.fromEntries( SHADOW_CHANGE_REQ_LIST.map( x=> [x, `persona.power.shadowcosts.${x}`]));

export const SOCIAL_CARD_ACTION_LIST = [
	"stop-execution",
	"exec-event",
	"inc-events",
	"gain-money",
	"modify-progress-tokens",
	"alter-student-skill",
	"modify-progress-tokens-cameo",
	"add-card-events-to-list",
	"replace-card-events",
	"set-temporary-variable",
	"card-response",
	"append-card-tag",
	"remove-cameo",
	"set-social-card-item",
] as const;

export type SocialCardAction = typeof SOCIAL_CARD_ACTION_LIST[number];

export const SOCIAL_CARD_ACTIONS = HTMLTools.createLocalizationObject(SOCIAL_CARD_ACTION_LIST, "persona.effecttypes.social-card");

export const DUNGEON_ACTION_LIST = [
	"roll-tension-pool",
	"modify-tension-pool",
	"modify-clock",
	"set-clock",
	"rename-scene-clock",
	"close-all-doors",
	"change-scene-weather",
	"disable-region",
] as const;

export type DungeonAction = typeof DUNGEON_ACTION_LIST[number];

export const DUNGEON_ACTIONS = Object.fromEntries(
	DUNGEON_ACTION_LIST.map(x => [x, `persona.effecttypes.dungeonAction.${x}`])
);

export const MODIFIER_CONS_TYPE_LIST =  [
	"constant",
	"system-variable",
] as const;

	export type ModifierConsType = typeof MODIFIER_CONS_TYPE_LIST[number];

export const MODIFIER_CONS_TYPES = Object.fromEntries( 
	MODIFIER_CONS_TYPE_LIST.map( x=> [x, `persona.effecttypes.modifierType.${x}`])
);

export const DAMAGE_SUBTYPE_LIST = [
	"odd-even",
	"high",
	"low",
	"allout",
	"constant",
	"multiplier",
	"mult-stack",
	"percentage",
	"percentage-current",
	"set-to-const",
	"set-to-percent",
] as const;

export type DamageSubtype = typeof DAMAGE_SUBTYPE_LIST[number];

export const DAMAGE_SUBTYPES = HTMLTools.createLocalizationObject(DAMAGE_SUBTYPE_LIST, "persona.damage-subtype");

export const ALTER_MP_SUBTYPES_LIST = [
	"direct",
	"percent-of-total",
] as const;

export type AlterMPSubtype = typeof ALTER_MP_SUBTYPES_LIST[number];

export const ALTER_MP_SUBTYPES = Object.fromEntries(
	ALTER_MP_SUBTYPES_LIST.map( x=> [x, `persona.alter-mp-subtypes.${x}`])
);

export const COMBAT_EFFECTS_LIST = [
	"damage",
	"alter-energy",
	"addStatus",
	"removeStatus",
	"extraAttack",
	// "revive",
	"extraTurn",
	"scan",
	"auto-end-turn",
	"apply-recovery",
	"alter-theurgy"
] as const;

export type CombatEffect = typeof COMBAT_EFFECTS_LIST[number];

export const COMBAT_EFFECTS = Object.fromEntries(
	COMBAT_EFFECTS_LIST.map( x=> [x, `persona.combat-effects-subtypes.${x}`])
);

const INVENTORY_ACTION_LIST = [
	"add-item",
	"add-treasure",
	"remove-item",
] as const;


export const INVENTORY_ACTION = HTMLTools.createLocalizationObject(INVENTORY_ACTION_LIST, "persona.consequences.inventoryAction");


