import { NumericComparisonPC } from "./numeric-comparison.js";
import { BooleanComparisonPC } from "./boolean-comparison.js";
import { UniversalActorAccessor } from "../module/utility/db-accessor.js";
import { PC } from "../module/actor/persona-actor.js";
import { Shadow } from "../module/actor/persona-actor.js";
import { TarotCard } from "./tarot.js";
import { PowerTag } from "../config/power-tags.js";
import { StatusEffectId } from "../config/status-effects.js";
import { PowerType } from "../config/effect-types.js"
import { DamageType } from "../config/damage-types.js";
import { Trigger } from "../config/triggers.js";

export const PRECONDITIONLIST = [
	"always",
	"numeric",
	"boolean",
	"miss-all-targets",
	"save-versus",
	"on-trigger",
] as const;

export type PreconditionType = typeof PRECONDITIONLIST[number];

export const PRECONDITIONTYPES = Object.fromEntries( PRECONDITIONLIST.map(x=> [x, `persona.preconditions.${x}`]));


export type Precondition =
	{actorOwner ?: UniversalActorAccessor<PC | Shadow>}
	& (
	GenericPC | NumericComparisonPC | BooleanComparisonPC | SaveVersus | Triggered
	);

type GenericPC = {
	type: Exclude<PreconditionType, "numeric" | "boolean" | 'save-versus' | "on-trigger">;
	status ?: StatusEffectId | Record<StatusEffectId, boolean>,
	powerTag ?: PowerTag | Record<PowerTag, boolean>,
	powerType ?: PowerType,
	powerDamageType ?: (DamageType | "by-power"),
	num ?: number,
	flagId ?: string
	booleanState ?: boolean,
}

type SaveVersus = {
	type : "save-versus",
	status ?: StatusEffectId | MultiCheck<StatusEffectId>,
};

export type Triggered = { type: "on-trigger"} & TriggeredEvents;

type  TriggeredEvents = SimpleTrigger
| NonSimpleTrigger;
;

type SimpleTrigger = {
	trigger ?: Exclude<Trigger, NonSimpleTrigger["trigger"]>,
}

type NonSimpleTrigger =
	onInflictStatus
	| onTarotPerk
	| ClockTickTrigger
	;

type onInflictStatus = {
	trigger: "on-inflict-status",
	status : StatusEffectId | Record<StatusEffectId, boolean>,
}

type onTarotPerk = {
	trigger: "on-attain-tarot-perk";
	tarot: TarotCard,
}

type ClockTickTrigger = {
	trigger: "on-clock-tick";
	triggeringClockId: string;
}

export const CONDITION_TARGETS_LIST = [
	"target",
	"owner",
	"attacker",
	"user",
	"triggering-character",
	"cameo",
] as const;

export type ConditionTarget= typeof CONDITION_TARGETS_LIST[number];

export type ConsequenceTarget = ConditionTarget;

export const CONDITION_TARGETS = Object.fromEntries(
	CONDITION_TARGETS_LIST.map( x=> [x, `persona.preconditions.targets.${x}`])
);

const CONDITION_DICE_LIST= [
	"escalation",
	"activation",
	"save",
	"skill",
	"attack-roll"
] as const;

export type ConditionDice = typeof CONDITION_TARGETS_LIST[number];

export const CONDITION_DICE = Object.fromEntries(
	CONDITION_DICE_LIST.map( x=> [x, `persona.preconditions.dice.${x}`])
);


const USER_COMPARISON_TARGET_LIST = [
	"triggering-user",
	"current-user",
] as const;

export type UserComparisonTarget = typeof USER_COMPARISON_TARGET_LIST[number];

export const USER_COMPARISON_TARGETS = Object.fromEntries(
	USER_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.userComparison.${x}`])

);

export type MultiCheck<T extends string> = Record<T, boolean> ;

export const SOCIAL_LINK_OR_TAROT_OTHER = {
			"target": "current Social Target / Current Target",
			"" : "current Social Target (Deprecated)",
			"cameo": "Cameo",
			"SLSource": "Social Link Source",
			"attacker": "Attacker",
			"user": "User of Original Power",

} as const;

export type SocialLinkIdOrTarot = TarotCard
	| keyof typeof SOCIAL_LINK_OR_TAROT_OTHER
	|  AnyStringObject;

export type AnyStringObject = {__nonsensePhantomData: number}; // a placehodler to allow typescript to handle satisfies cases better, it represents any string without having the entire type turn to string
