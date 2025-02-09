import { SocialLinkIdOrTarot } from "./precondition-types.js";
import { ConditionTarget } from "./precondition-types.js";
import { ResistType } from "../config/damage-types.js";
import { ResistStrength } from "../config/damage-types.js";
import { SocialStat } from "../config/student-skills.js";


const NUMERIC_COMPARISON_TARGET_LIST = [
	"natural-roll",
	"activation-roll",
	"escalation",
	"opening-roll",
	"total-roll",
	"talent-level",
	"social-link-level",
	"total-SL-levels",
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
	"links-dating",
	"social-variable",
	"round-count",
] as const;

export type NumericComparisonTarget = typeof NUMERIC_COMPARISON_TARGET_LIST[number];

export const NUMERIC_COMPARISON_TARGET = Object.fromEntries(
	NUMERIC_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
);


type NumericComparator = BasicNumericComparator
| NonBasicComparator

type BasicNumericComparator = {
	comparator : Exclude<Comparator, NonBasicComparator["comparator"]>,
	num: number,
}

type NonBasicComparator =
	RangeComparator
| OddEvenComparator ;

type RangeComparator = {
	comparator : Extract<Comparator, "range">,
	num: number, //lowend of the range
	high: number,
}

type OddEvenComparator = {
	comparator : Extract<Comparator, "odd" | "even">,
};

/** Derived comparator gets its comparison number from somewhere else*/
type DerivedComparator = {
	comparator : BasicNumericComparator["comparator"],
}

type NumericComparisonBase = NumericComparator & {
	type: "numeric",
	comparisonTarget : NumericComparisonTarget,
}

export type NumericComparisonPC =
	GenericNumericComparison | NonGenericNumericComparison;

type NonGenericNumericComparison = ResistanceComparison
	| TargettedNumericComparison
	| ClockNumericComparison
	| HPMPComparison
	| EnergyComparison
	| InspirationNumericComparison
	| AmountOfItemComparison
	| SocialLinkLevelComparison
	| SocialVariableComparison
	| totalSLComparison
;

type SocialVariableComparison = NumericComparisonBase & {
	comparisonTarget:	"social-variable",
	variableId: string,
}

type EnergyComparison = NumericComparisonBase & {
	comparisonTarget : "energy",
	conditionTarget : ConditionTarget,
}

type GenericNumericComparison = NumericComparisonBase & {
	comparisonTarget : Exclude<NumericComparisonTarget, NonGenericNumericComparison["comparisonTarget"]>,
	studentSkill ?: SocialStat;
}

type SocialLinkLevelComparison = NumericComparisonBase & {
	comparisonTarget: "social-link-level",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
}

type InspirationNumericComparison = NumericComparisonBase & {
	conditionTarget : ConditionTarget,
	comparisonTarget: "inspirationWith",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
}

type AmountOfItemComparison = NumericComparisonBase & {
	conditionTarget : ConditionTarget,
	comparisonTarget: "itemCount",
	itemId: string,
}

type ResistanceComparison = DerivedComparator & {
	type: "numeric",
	comparisonTarget: "resistance-level"
	element: ResistType | "by-power",
	resistLevel : ResistStrength,
	conditionTarget : ConditionTarget,
}

type TargettedNumericComparison = NumericComparisonBase & {
	comparisonTarget: "health-percentage",
	conditionTarget: ConditionTarget,
}

type HPMPComparison = NumericComparisonBase & {
	comparisonTarget: "percentage-of-mp" | "percentage-of-hp",
	conditionTarget: ConditionTarget,
}

type ClockNumericComparison = NumericComparisonBase & {
	comparisonTarget: "clock-comparison",
	clockId: string,
}

const COMPARATORS_LIST = [
	"==",
	"!=",
	">=",
	">",
	"<",
	"<=",
	"odd",
	"even",
	"range",
] as const;

type Comparator = typeof COMPARATORS_LIST[number];

export const COMPARATORS = Object.fromEntries (
	COMPARATORS_LIST.map( x=> [x, x])
);

type totalSLComparison = NumericComparisonBase & {
	comparisonTarget:		"total-SL-levels",
	conditionTarget: ConditionTarget,
}

