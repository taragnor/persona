import { HTMLTools } from "../module/utility/HTMLTools.js";
import { NumericComparisonPC } from "./numeric-comparison.js";
import { BooleanComparisonPC } from "./boolean-comparison.js";
import { TarotCard } from "./tarot.js";
import { StatusEffectId } from "../config/status-effects.js";
import { Trigger } from "../config/triggers.js";

export const PRECONDITIONLIST = [
	"always",
	"is-hit",
	"numeric",
	// "numeric-v2",
	"boolean",
	"miss-all-targets",
	"save-versus",
	"on-trigger",
	"never",
	"disable-on-debug",
	"diagnostic",
] as const;

export type PreconditionType = typeof PRECONDITIONLIST[number];

export const PRECONDITIONTYPES = Object.fromEntries( PRECONDITIONLIST.map(x=> [x, `persona.preconditions.${x}`]));


declare global {
	type Precondition = PreconditionComparison ;
}

export type PreconditionComparison =
	{type: PreconditionType} &
	(GenericPC  | NonGenericPCComparison);

type NonGenericPCComparison = NumericComparisonPC | BooleanComparisonPC | RollSuccessShortcutComparison | SaveVersus | Triggered;

type RollSuccessShortcutComparison = {
	type : "is-hit";
	booleanState: boolean;
}

export type DeprecatedPrecondition<T extends object> = T & {
	___deprecated: true;
}

export type NonDeprecatedPrecondition<T extends object> = T & {
	___deprecated ?: never;
}

type GenericPC = {
	type: Exclude<PreconditionType, NonGenericPCComparison["type"]>;
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
	trigger : Exclude<Trigger, NonSimpleTrigger["trigger"]>,
}

type NonSimpleTrigger =
	onInflictStatus
	| onTarotPerk
	| ClockTickTrigger
	| StatusTimeOut
	| EventTrigger
;


type EventTrigger = {
	trigger: "on-event-start" | "on-event-end",
}

type StatusTimeOut = {
	trigger: "on-active-effect-time-out" | "on-active-effect-end",
} & (
	OwningAETimeout
	| StatusTimeout
	| FlagTimeout
);

type OwningAETimeout = {
	timeoutTarget: "self",
}

type StatusTimeout = {
	timeoutTarget: "status",
	statusId: StatusEffectId,
}

type FlagTimeout = {
	timeoutTarget: "flag";
	flagId: string;
}

type onInflictStatus = {
	trigger: "on-inflict-status" | "pre-inflict-status",
	status : MultiCheckOrSingle<StatusEffectId>,
}

type onTarotPerk = {
	trigger: "on-attain-tarot-perk";
	tarot: TarotCard,
}

type ClockTickTrigger = {
	trigger: "on-clock-tick" | "on-clock-change";
	triggeringClockId: string;
}

export const CONDITION_TARGETS_LIST = [
	"target",
	"owner",
	"attacker",
	"user",
	"triggering-character",
	"cameo",
	"all-allies",
	"all-foes",
	"all-in-region",
	"navigator",
] as const;

export type ConditionTarget= typeof CONDITION_TARGETS_LIST[number];

export type ConsequenceTarget = ConditionTarget;

export const CONDITION_TARGETS = HTMLTools.createLocalizationObject(CONDITION_TARGETS_LIST, "persona.preconditions.targets");

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
export type MultiCheckOrSingle<T extends string> = T | MultiCheck<T>;

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


