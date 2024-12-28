import { CreatureTag } from "./creature-tags.js";
import { CreatureType } from "./shadow-types.js";
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

type NumericComparisonBase = {
	type: "numeric",
	comparator : Comparator;
	comparisonTarget : NumericComparisonTarget,
}

type NumericComparisonPC =
	GenericNumericComparison
	| ResistanceComparison
	| TargettedNumericComparison
	| ClockNumericComparison
	| HPMPComparison
	| EnergyComparison
	| InspirationNumericComparison
	| AmountOfItemComparison
	| SocialLinkLevelComparison
;

type EnergyComparison = NumericComparisonBase & {
	comparisonTarget : "energy",
	num: number,
	conditionTarget : ConditionTarget,
}

type GenericNumericComparison = NumericComparisonBase & {
	comparisonTarget : Exclude<NumericComparisonTarget, "resistance-level" | "health-percentage" | "clock-comparison" | "percentage-of-mp" | "percentage-of-hp" | "energy" | "inspirationWith" | "itemCount" | "social-link-level" >,
	studentSkill ?: SocialStat;
	num ?: number,
	// socialLinkIdOrTarot ?: SocialLinkIdOrTarot,
}

type SocialLinkLevelComparison = NumericComparisonBase & {
	comparisonTarget: "social-link-level",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
	num: number,
}

type InspirationNumericComparison = NumericComparisonBase & {
	conditionTarget : ConditionTarget,
	comparisonTarget: "inspirationWith",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
	num: number,
}

type AmountOfItemComparison = NumericComparisonBase & {
	conditionTarget : ConditionTarget,
	comparisonTarget: "itemCount",
	itemId: string,
	num: number,
}

type ResistanceComparison = NumericComparisonBase & {
	comparisonTarget: "resistance-level"
	element: ResistType | "by-power",
	resistLevel : ResistStrength,
	conditionTarget : ConditionTarget,
}

type TargettedNumericComparison = NumericComparisonBase & {
	comparisonTarget: "health-percentage",
	conditionTarget: ConditionTarget,
	num : number,
}

type HPMPComparison = NumericComparisonBase & {
	comparisonTarget: "percentage-of-mp" | "percentage-of-hp",
	conditionTarget: ConditionTarget,
	num: number,
}

type ClockNumericComparison = NumericComparisonBase & {
	comparisonTarget: "clock-comparison",
	clockId: string,
	num: number,
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
StatusComparisonPC | TagComparisonPC | DamageTypeComparisonPC | PowerTypeComparisonPC | FlagComparisonPC | TargettedBComparisonPC | ResistanceCheck | PowerTypeComparison | WeatherComparison | WeekdayComparison | SocialTargetIsComparison | ShadowRoleComparison | SceneComparison | PlayerTypeCheckComparison | HasItemCheckComparison | CreatureTypeCheckComparion | SlotTypeComparison | SocialComparison | ArcanaComparison
;

export const SOCIAL_CHECKS_LIST = [
	"relationship-type-check",
	"is-social-disabled",
	"is-available",
] as const;

export type SocialCheck = typeof SOCIAL_CHECKS_LIST[number];

export const SOCIAL_CHECKS = Object.fromEntries(
	SOCIAL_CHECKS_LIST.map( x=> [x, `persona.preconditions.socialChecks.${x}`])
);

export type SocialComparisonBase = {
	boolComparisonTarget : "social-availability",
	socialCheckType: SocialCheck,
};

export type SocialComparison = (SocialComparisonBase) &
	(RelationshipTypeComparison | SimpleSocialComparison);

export type SimpleSocialComparison = {
	socialCheckType : "is-social-disabled" | "is-available",
};

export type RelationshipTypeComparison = {
	socialCheckType: "relationship-type-check",
	relationshipType: string;
};

export type TargettedBComparisonPC = SingleTargetComparison | TwoTargetComparison;

type SlotTypeComparison = {
	boolComparisonTarget: "power-slot-is",
	slotType: MultiCheck<string>,
}

type ShadowRoleComparison = {
	boolComparisonTarget: "shadow-role-is",
	conditionTarget: ConditionTarget,
	shadowRole: ShadowRole | MultiCheck<ShadowRole>,
}

type CreatureTypeCheckComparion = {
	boolComparisonTarget : "creature-type-is",
	conditionTarget: ConditionTarget,
	creatureType: MultiCheck<CreatureType>,
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
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
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

type TagComparisonPC = PowerTagComparison | CreatureTagComparison;

type PowerTagComparison = {
	boolComparisonTarget: "has-tag",
	powerTag : PowerTag | Record<PowerTag, boolean>,
}

type CreatureTagComparison = {
	boolComparisonTarget: "has-creature-tag",
	creatureTag : CreatureTag | Record<CreatureTag, boolean>,
	conditionTarget : ConditionTarget,
}

type ArcanaComparison = {
	boolComparisonTarget: "arcana-is",
	conditionTarget: ConditionTarget,
	tarot: TarotCard;
}

type DamageTypeComparisonPC= {
	boolComparisonTarget: "damage-type-is" ,
	powerDamageType : (DamageType | "by-power") | MultiCheck<DamageType | "by-power">,
}

type ResistanceCheck = {
	boolComparisonTarget:  "is-resistant-to",
	powerDamageType : (DamageType | "by-power"),
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
	"has-tag",//power-has-tag
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
	"has-item-in-inventory",
	"creature-type-is",
	"power-slot-is",
	"social-availability",
	"has-creature-tag",
	"cameo-in-scene",
	"arcana-is",
] as const;


export type BooleanComparisonTarget = typeof BOOLEAN_COMPARISON_TARGET_LIST[number];

export const BOOLEAN_COMPARISON_TARGET = Object.fromEntries(
	BOOLEAN_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
);

const NUMERIC_COMPARISON_TARGET_LIST = [
	"natural-roll",
	"activation-roll",
	"escalation",
	"opening-roll",
	"total-roll",
	"talent-level",
	"social-link-level",
	"student-skill",
	"character-level",
	"has-resources",
	"resistance-level",
	"health-percentage",
	"clock-comparison",
	"percentage-of-mp",
	"percentage-of-hp",
	"energy",
	"socialRandom",
	"inspirationWith",
	"itemCount",
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


export type SocialLinkIdOrTarot = TarotCard | "" | "cameo" | "target" | "SLSource" | string;
//NOTE: TS can't do a satsifies here so have to be careufl adding new types

