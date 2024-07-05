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


export type Precondition = GenericPC | NumericComparisonPC | BooleanComparisonPC | SaveVersus | Triggered;

type GenericPC = {
	type: Exclude<PreconditionType, "numeric" | "boolean" | 'save-versus' | "on-trigger">;
	status ?: StatusEffectId,
	powerTag ?: PowerTag,
	powerType ?: PowerType,
	powerDamageType ?: DamageType,
	num ?: number,
	flagId ?: string
	booleanState ?: boolean,
}

type SaveVersus = {
	type : "save-versus",
	status ?: StatusEffectId,
};

export type Triggered = { type: "on-trigger"} & TriggeredEvents;

type  TriggeredEvents = SimpleTrigger
| onInflictStatus
| onTarotPerk
;

type SimpleTrigger = {
	trigger ?: Exclude<Trigger, "on-attain-tarot-perk" |  "on-inflict-status" >,
}

type onInflictStatus = {
	trigger: "on-inflict-status",
	status : StatusEffectId,
}

type onTarotPerk = {
	trigger: "on-attain-tarot-perk";
	tarot: TarotCard,
}


type NumericComparisonPC = {
	type: "numeric",
	comparator : Comparator;
	comparisonTarget : NumericComparisonTarget,
	studentSkill ?: SocialStat;
	num ?: number,
	socialLinkIdOrTarot ?: TarotCard | string;
}

export type BooleanComparisonPC = {
	type : "boolean",
	booleanState : boolean,
	boolComparisonTarget: BooleanComparisonTarget,
} & (StatusComparisonPC | TagComparisonPC |  BasicBComparisonPC | DamageTypeComparisonPC | PowerTypeComparisonPC | FlagComparisonPC | TargettedBComparisonPC | ResistanceCheck | PowerTypeComparison | WeatherComparison | WeekdayComparison | SocialTargetIsComparison);

	type BasicBComparisonPC ={
	boolComparisonTarget: Exclude<BooleanComparisonTarget,
	"has-status" | "has-tag" | "damage-type-is" | "power-type-is" | "weekday-is" | "flag-state" | "is-resistant-to" | "social-target-is" | TargettedBComparisonPC["boolComparisonTarget"] | "power-target-type-is" | "weather-is">,
}

export type TargettedBComparisonPC = SingleTargetComparison | TwoTargetComparison;

export type SingleTargetComparison = {
	boolComparisonTarget: "engaged" | "engaged-with" | "is-dead" | "struck-weakness" | "is-shadow" | "is-pc" | "is-same-arcana";
	conditionTarget : ConditionTarget,
};

type TwoTargetComparison = {
	boolComparisonTarget:	"target-owner-comparison" ,
	conditionTarget : ConditionTarget,
	conditionTarget2: ConditionTarget,
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
	status : StatusEffectId,
	conditionTarget : ConditionTarget,
}

type TagComparisonPC = {
	boolComparisonTarget: "has-tag",
	powerTag : PowerTag,
}

type DamageTypeComparisonPC= {
	boolComparisonTarget: "damage-type-is" ,
	powerDamageType : DamageType,
}

type ResistanceCheck = {
	boolComparisonTarget:  "is-resistant-to",
	powerDamageType : DamageType,
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
	weatherComparison: WeatherType,
};


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
	"has-resources"
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

const CONDITION_TARGETS_LIST = [
	"target",
	"owner",
	"attacker",
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

