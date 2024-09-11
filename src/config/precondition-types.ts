import { ShadowRole } from "./shadow-types.js";
import { UniversalActorAccessor } from "../module/utility/db-accessor.js";
import { PC } from "../module/actor/persona-actor.js";
import { Shadow } from "../module/actor/persona-actor.js";
import { ResistType } from "../config/damage-types.js";
import { ResistStrength } from "../config/damage-types.js";
import { DAYS_LIST } from "./days.js";
import { WeatherType } from "./weather-types.js";
import { Power } from "../module/item/persona-item.js";
import { TarotCard } from "./tarot.js";
import { PowerTag } from "../config/power-tags.js";
import { StatusEffectId } from "../config/status-effects.js";
import { PowerType } from "../config/effect-types.js"
import { DamageType } from "../config/damage-types.js";
import { Trigger } from "../config/triggers.js";
import { SocialStat } from "../config/student-skills.js";

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
	powerDamageType ?: DamageType | "by-power",
	num ?: number,
	flagId ?: string
	booleanState ?: boolean,
}

type SaveVersus = {
	type : "save-versus",
	status ?: StatusEffectId | Record<StatusEffectId, boolean>,
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


type NumericComparisonBase = {
	type: "numeric",
	comparator : Comparator;
	comparisonTarget : NumericComparisonTarget,
}

type NumericComparisonPC = GenericNumericComparison 
	| ResistanceComparison
	| TargettedNumericComparison
	| ClockNumericComparison
;

type GenericNumericComparison = NumericComparisonBase & {
	comparisonTarget : Exclude<NumericComparisonTarget, "resistance-level" | "health-percentage" | "clock-comparison" >,
	studentSkill ?: SocialStat;
	num ?: number,
	socialLinkIdOrTarot ?: TarotCard | string;
}

type ResistanceComparison = NumericComparisonBase & {
	comparisonTarget: "resistance-level"
	element: ResistType | "by-power",
	resistLevel : ResistStrength
	conditionTarget : ConditionTarget,
}

type TargettedNumericComparison = NumericComparisonBase & {
	comparisonTarget: "health-percentage",
	conditionTarget: ConditionTarget,
	num : number
}

type ClockNumericComparison = NumericComparisonBase & {
	comparisonTarget:"clock-comparison",
	clockId: string,
}

export type BooleanComparisonPC = {
	type : "boolean",
	booleanState : boolean,
	boolComparisonTarget: BooleanComparisonTarget,
} & (BasicBComparisonPC | NonBasicBoolComparison);

	type BasicBComparisonPC = {
	boolComparisonTarget: Exclude<BooleanComparisonTarget,
	NonBasicBoolComparison["boolComparisonTarget"]>
}

type NonBasicBoolComparison =
StatusComparisonPC | TagComparisonPC | DamageTypeComparisonPC | PowerTypeComparisonPC | FlagComparisonPC | TargettedBComparisonPC | ResistanceCheck | PowerTypeComparison | WeatherComparison | WeekdayComparison | SocialTargetIsComparison | ShadowRoleComparison | SceneComparison | PlayerTypeCheckComparison | HasItemCheckComparison
;

export type TargettedBComparisonPC = SingleTargetComparison | TwoTargetComparison;

type ShadowRoleComparison = {
	boolComparisonTarget: "shadow-role-is",
	conditionTarget: ConditionTarget,
	shadowRole: ShadowRole,
}

export type SingleTargetComparison = {
	boolComparisonTarget: "engaged" | "is-dead" | "struck-weakness" | "is-shadow" | "is-pc" | "is-same-arcana" | "is-distracted";
	conditionTarget : ConditionTarget,
};

type TwoTargetComparison = {
	boolComparisonTarget:	"target-owner-comparison" | "engaged-with"
	conditionTarget : ConditionTarget,
	conditionTarget2: ConditionTarget,
}

type HasItemCheckComparison = {
	boolComparisonTarget: "has-item-in-inventory",
	itemId: string,
	conditionTarget: ConditionTarget,
}

type SocialTargetIsComparison = {
	boolComparisonTarget: "social-target-is",
	conditionTarget : ConditionTarget,
	socialLinkIdOrTarot ?: TarotCard | string;
}

type WeekdayComparison = {
	boolComparisonTarget: "weekday-is",
	booleanState: false,
	days: { [k in typeof DAYS_LIST[number]]: boolean},
}

type PowerTypeComparison = {
	boolComparisonTarget:  "power-target-type-is",
	powerTargetType: Power["system"]["targets"],
}

type StatusComparisonPC = {
	boolComparisonTarget: "has-status",
	status : StatusEffectId | Record<StatusEffectId, boolean>,
	conditionTarget : ConditionTarget,
}

type TagComparisonPC = {
	boolComparisonTarget: "has-tag",
	powerTag : PowerTag | Record<PowerTag, boolean>,
}

type DamageTypeComparisonPC= {
	boolComparisonTarget: "damage-type-is" ,
	powerDamageType : DamageType | "by-power",
}

type ResistanceCheck = {
	boolComparisonTarget:  "is-resistant-to",
	powerDamageType : DamageType | "by-power",
	conditionTarget : ConditionTarget,
}

type PowerTypeComparisonPC = {
	boolComparisonTarget: "power-type-is",
	powerType : PowerType,
};

type FlagComparisonPC = {
	boolComparisonTarget: "flag-state",
	flagId : string
	conditionTarget : ConditionTarget,
};

type WeatherComparison = {
	boolComparisonTarget: "weather-is",
	weatherComparison: WeatherType | Record<WeatherType, boolean>,
};

type SceneComparison = {
	boolComparisonTarget: "active-scene-is",
	sceneId: string,
}

type PlayerTypeCheckComparison = {
	boolComparisonTarget: "is-gm",
	userComparisonTarget: UserComparisonTarget,
}

const BOOLEAN_COMPARISON_TARGET_LIST = [
	"engaged",
	"engaged-with",
	"metaverse-enhanced",
	"is-shadow",
	"is-pc",
	"has-tag",
	"in-combat",
	"is-critical",
	"is-hit",
	"is-dead",
	"target-owner-comparison",
	"damage-type-is",
	"power-type-is",
	"has-status",
	"struck-weakness",
	"is-resistant-to",
	"is-same-arcana",
	"flag-state",
	"is-consumable",
	"power-target-type-is",
	"weather-is",
	"weekday-is",
	"social-target-is",
	"shadow-role-is",
	"is-distracted",
	"active-scene-is",
	"is-gm",
	"has-item-in-inventory"
] as const;


export type BooleanComparisonTarget = typeof BOOLEAN_COMPARISON_TARGET_LIST[number];

export const BOOLEAN_COMPARISON_TARGET = Object.fromEntries(
	BOOLEAN_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
);

const NUMERIC_COMPARISON_TARGET_LIST = [
	"natural-roll",
	"activation-roll",
	"escalation",
	"total-roll",
	"talent-level",
	"social-link-level",
	"student-skill",
	"character-level",
	"has-resources",
	"resistance-level",
	"health-percentage",
	"clock-comparison",
] as const;

export type NumericComparisonTarget = typeof NUMERIC_COMPARISON_TARGET_LIST[number];

export const NUMERIC_COMPARISON_TARGET = Object.fromEntries(
	NUMERIC_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
);

const COMPARATORS_LIST = [
	"==",
	"!=",
	">=",
	">",
	"<",
	"<=",
	"odd",
	"even",
] as const;

type Comparator = typeof COMPARATORS_LIST[number];

export const COMPARATORS = Object.fromEntries (
	COMPARATORS_LIST.map( x=> [x, x])
);

export const CONDITION_TARGETS_LIST = [
	"target",
	"owner",
	"attacker",
	"user",
	"triggering-character",
] as const;

export type ConditionTarget= typeof CONDITION_TARGETS_LIST[number];

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

