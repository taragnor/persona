import { PersonaError } from "../module/persona-error.js";
import { HTMLTools } from "../module/utility/HTMLTools.js";
import { VariableTypeSpecifier } from "./consequence-types.js";
import { VariableType } from "../module/persona-variables.js";
import { Precondition } from "./precondition-types.js";
import { SocialLinkIdOrTarot } from "./precondition-types.js";
import { ConditionTarget } from "./precondition-types.js";
import { ResistType } from "../config/damage-types.js";
import { ResistStrength } from "../config/damage-types.js";
import { SocialStat } from "../config/student-skills.js";

const DEPRECATED_OPERANDS = [
	"escalation",
	"social-variable",
] as const;

const COMMON_COMPARISON_TARGET_LIST = [
	"clock-comparison",
	"socialRandom",
	"round-count",
	"combat-result-based",
	"num-of-others-with",
	"variable-value",
] as const;

const FOLDED_COMPARISON_TARGETS = [
	"natural-roll",
	"activation-roll",
	"opening-roll",
	"total-roll",
] as const;

const ACTOR_STAT_LIST = [
	"inspirationWith",
	"itemCount",
	"links-dating",
	"energy",
	"percentage-of-mp",
	"percentage-of-hp",
	"student-skill",
	"character-level",
	"talent-level",
	"social-link-level",
	"total-SL-levels",
	"progress-tokens-with",
	"has-resources",
	"health-percentage",
	"resistance-level",
	"scan-level",
] as const;

const NUMERIC_COMPARISON_TARGET_LIST = [
	...FOLDED_COMPARISON_TARGETS,
	...ACTOR_STAT_LIST,
	...COMMON_COMPARISON_TARGET_LIST,
	...DEPRECATED_OPERANDS,
] as const;


const V2_OPERANDS = [
	"constant",
	"roll-comparison",
	"odd-even",
	"actor-stat",
] as const;

const CONSTANT_SUBTYPE = [
	"number",
	"range",
	"resistance-level",
] as const;


const NUMERIC_V2_COMPARISON_TARGET_LIST= [
	...V2_OPERANDS,
	...COMMON_COMPARISON_TARGET_LIST,
	"deprecated",
] as const;

export type NumericComparisonTarget = typeof NUMERIC_COMPARISON_TARGET_LIST[number];

export const NUMERIC_COMPARISON_TARGET = Object.fromEntries(
	NUMERIC_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
);

export const NUMERIC_V2_COMPARISON_TARGETS = HTMLTools.createLocalizationObject(NUMERIC_V2_COMPARISON_TARGET_LIST, "persona.preconditions.comparison");

export type NumericComparator = BasicNumericComparator
| NonBasicComparator

export const NUMERIC_V2_ACTOR_STATS = HTMLTools.createLocalizationObject(ACTOR_STAT_LIST, "persona.preconditions.comparison");

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
} & (
	ResistanceLevelComparator
);

type ResistanceLevelComparator = {
	resistLevel : ResistStrength,
}

type NumericComparisonBase = NumericComparator & {
	type: "numeric",
	comparisonTarget : NumericComparisonTarget,
}

export type NumericComparisonPC =
	NumericComparisonOld | NumericComparisonV2;

export type NumericComparisonOld =
	{
		type : "numeric",
		comparisonTarget: NumericComparisonTarget,
	} & (
		GenericNumericComparison | NonGenericNumericComparison
	);

type NonGenericNumericComparison =
	(DerivedComparator & DerivedNumericComparisons) | (BaseNumericComparisons & NumericComparator);

type DerivedNumericComparisons =
	ResistanceComparison
;

type BaseNumericComparisons =
	ConstantComparison
	| OddEvenComparison
	| SimpleComparison
	| ResistanceLevelConstant
	| TargettedNumericComparison
	| ClockNumericComparison
	| HPMPComparison
	| EnergyComparison
	| InspirationNumericComparison
	| AmountOfItemComparison
	| SocialLinkLevelComparison
	| ProgressTokensComparison
	| SocialVariableComparison
	| totalSLComparison
	| CombatResultComparison
	| NumberOfOthersWithComparison
	| VariableComparison
	| RollComparison
	| StudentSkillComparison
	| DeprecatedComparison
	| ScanLevelComparison
	| V2SpecificComparisons
;


type V2SpecificComparisons =
	ActorStatComparion

type ScanLevelComparison = {
	comparisonTarget: "scan-level",
	conditionTarget: ConditionTarget,
}


type ActorStatComparion = {
	comparisonTarget: "actor-stat",
	subtype: typeof ACTOR_STAT_LIST[number]
} & (
	SimpleActorStatComparison
	| TargettedActorStatComparison
	| ActorStatComparisonSocialLinkLevelComparison
	| ActorStatsInspirationNumericComparison
	| ActorStatStudentSkillComparison
	| ActorStatResistanceComparison
	| ActorStatAmountOfItemComparison
)

type TargettedActorStatComparison = {
	subtype: "health-percentage"
	| "percentage-of-mp"
	| "percentage-of-hp"
	| "energy"
	| "total-SL-levels"
	| "progress-tokens-with"
	| "scan-level",
	conditionTarget: ConditionTarget,
}

type ActorStatComparisonSocialLinkLevelComparison =  {
	subtype: "social-link-level",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
}

type ActorStatsInspirationNumericComparison =  {
	subtype: "inspirationWith",
	conditionTarget : ConditionTarget,
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
}

type SimpleActorStatComparison = {
	subtype :"talent-level" | "has-resources" | "character-level" | "links-dating",
}

type ActorStatStudentSkillComparison = {
	subtype: "student-skill",
	studentSkill : SocialStat;
}

type ActorStatResistanceComparison =  {
	type: "numeric",
	subtype: "resistance-level"
	element: ResistType | "by-power",
	// resistLevel : ResistStrength,
	conditionTarget : ConditionTarget,
}

type ActorStatAmountOfItemComparison =  {
	subtype: "itemCount",
	conditionTarget : ConditionTarget,
	itemId: string,
}

type SimpleComparison = {
	comparisonTarget: "talent-level" |  "has-resources"  | "character-level" | "socialRandom" | "links-dating" | "round-count"
};

type StudentSkillComparison = {
	comparisonTarget: "student-skill",
	studentSkill ?: SocialStat;
}

type DeprecatedComparison = {
	comparisonTarget: "deprecated",
	deprecatedType : typeof DEPRECATED_OPERANDS[number];
	variableId ?: string,
}





type ConstantComparison = {
	comparisonTarget: "constant",
	subtype: typeof CONSTANT_SUBTYPE[number],
} & (
	NumericConstant
| ResistanceLevelConstant
| RangeConstant
)
	;

type NumericConstant = {
	comparisonTarget: "constant",
	subtype: "number",
	num: number,
}

type OddEvenComparison = {
	comparisonTarget: "odd-even",
	oddEven: "odd" | "even",
}

type ResistanceLevelConstant = {
	comparisonTarget: "constant",
	subtype: "resistance-level",
	resistLevel : ResistStrength,
};

type RangeConstant = {
	comparisonTarget: "constant",
	subtype: "range",
	low: number,
	high: number,
}

type RollComparison = {
	comparisonTarget: "roll-comparison",
	rollType: typeof ROLL_TYPE[number];
}

type VariableComparison =  {
	comparisonTarget: "variable-value",
	varType: VariableType,
} & VariableTypeSpecifier;

type SocialVariableComparison =  {
	comparisonTarget:	"social-variable",
	variableId: string,
}

type EnergyComparison =  {
	comparisonTarget : "energy",
	conditionTarget : ConditionTarget,
}

type GenericNumericComparison =  NumericComparisonBase & {
	comparisonTarget : Exclude<NumericComparisonTarget, NonGenericNumericComparison["comparisonTarget"] | "constant" | "">,
	studentSkill ?: SocialStat;
}

type SocialLinkLevelComparison =  {
	comparisonTarget: "social-link-level",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
}

type InspirationNumericComparison =  {
	conditionTarget : ConditionTarget,
	comparisonTarget: "inspirationWith",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
}

type AmountOfItemComparison =  {
	conditionTarget : ConditionTarget,
	comparisonTarget: "itemCount",
	itemId: string,
}

type ResistanceComparison =  {
	type: "numeric",
	comparisonTarget: "resistance-level"
	element: ResistType | "by-power",
	// resistLevel : ResistStrength,
	conditionTarget : ConditionTarget,
}

type TargettedNumericComparison =  {
	comparisonTarget: "health-percentage",
	conditionTarget: ConditionTarget,
}

type HPMPComparison =  {
	comparisonTarget: "percentage-of-mp" | "percentage-of-hp",
	conditionTarget: ConditionTarget,
}

type ClockNumericComparison =  {
	comparisonTarget: "clock-comparison",
	clockId: string,
}

const SIMPLE_COMPARATORS_LIST = [
	"==",
	"!=",
	">=",
	">",
	"<",
	"<=",
] as const;

const COMPARATORS_LIST = [
	...SIMPLE_COMPARATORS_LIST,
	"odd",
	"even",
	"range",
] as const;

export const SIMPLE_COMPARATORS = Object.fromEntries (
	SIMPLE_COMPARATORS_LIST.map( x=> [x, x])
);

type Comparator = typeof COMPARATORS_LIST[number];

export const COMPARATORS = Object.fromEntries (
	COMPARATORS_LIST.map( x=> [x, x])
);

type totalSLComparison = {
	comparisonTarget:		"total-SL-levels",
	conditionTarget: ConditionTarget,
}


type ProgressTokensComparison = {
	comparisonTarget: "progress-tokens-with",
	conditionTarget: ConditionTarget,
}

export type CombatResultComparison =  {
	comparisonTarget:	"combat-result-based",
	resultSubtypeComparison: CombatResultSubtypeComparison,
	invertComparison: boolean,
}

const RESULT_SUBTYPE_COMPARISON_LIST = [
	"total-hits",
	"total-knocks-down",
] as const;

type CombatResultSubtypeComparison = typeof RESULT_SUBTYPE_COMPARISON_LIST[number];

export type NumberOfOthersWithComparison =  {
	comparisonTarget:		"num-of-others-with",
	group: ComparisonGroup,
	otherComparison: Precondition,
	conditionTarget : ConditionTarget,
}

export const COMPARISON_GROUP_LIST = [
	"allies",
	"enemies",
	"both",
] as const;

type ComparisonGroup = typeof COMPARISON_GROUP_LIST[number];

export const COMPARISON_GROUPS = Object.fromEntries(
	COMPARISON_GROUP_LIST.map( x => [x, `persona.preconditions.comparison.comparison-groups.${x}`])

);



export const RESULT_SUBTYPE_COMPARISON = Object.fromEntries(
	RESULT_SUBTYPE_COMPARISON_LIST.map( x=> [x, `persona.preconditions.combat-result-subtype.${x}`])
);

//new form
export type NumericComparisonV2 = {
	type: "numeric-v2",
} & {op1: NumericOperand}
	& ComparatorNew
	& {
		op2: NumericOperand,
	};

type ComparatorNew =  {
		comparator: BasicNumericComparator["comparator"]
};


type NumericOperand =
	{
	comparisonTarget: typeof NUMERIC_V2_COMPARISON_TARGET_LIST[number]
	} & (
	BaseNumericComparisons | DerivedNumericComparisons
	)
;

;

export function convertNumericV1toV2(old: NumericComparisonPC) : NumericComparisonV2 {
	if (old.type == "numeric-v2") {return old;}
	const op1 : NumericOperand = DeriveOperand1(old);
	const op2 = deriveConstant(old);
	const comparator = deriveComparator(old);
	const ret : NumericComparisonV2 = {
		type: "numeric-v2",
		comparator,
		op1,
		op2,
	};
	return ret;
}

function DeriveOperand1 (old: NumericComparisonOld) : NumericOperand {
	switch (old.comparisonTarget) {
		case "natural-roll":
		case "activation-roll":
		case "opening-roll":
		case "total-roll":
			return {
				comparisonTarget: "roll-comparison",
				rollType : old.comparisonTarget,
			};
		case "social-link-level":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
				socialLinkIdOrTarot : old.socialLinkIdOrTarot,
			};
		case "scan-level":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
				conditionTarget: old.conditionTarget,
			};
		case "total-SL-levels":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
				conditionTarget: old.conditionTarget,
			};
		case "progress-tokens-with":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
				conditionTarget: old.conditionTarget,
			};
		case "socialRandom":
		case "round-count":
			return {
				comparisonTarget: old.comparisonTarget,
			};
		case "student-skill":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
				studentSkill: old.studentSkill!,
			};
		case "character-level":
		case "has-resources":
		case "talent-level":
		case "links-dating":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
			};
		case "resistance-level":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
				type: old.type,
				element: old.element,
				conditionTarget: old.conditionTarget,
			};
		case "percentage-of-mp":
		case "percentage-of-hp":
		case "health-percentage":
		case "energy":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
				conditionTarget: old.conditionTarget,
			};
		case "clock-comparison":
			return {
				comparisonTarget: old.comparisonTarget,
				clockId: old.clockId,
			};
		case "inspirationWith":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
				conditionTarget: old.conditionTarget,
				socialLinkIdOrTarot: old.socialLinkIdOrTarot,
			};
		case "itemCount":
			return {
				comparisonTarget: "actor-stat",
				subtype: old.comparisonTarget,
				conditionTarget: old.conditionTarget,
				itemId: old.itemId,
			};
		case "social-variable":
			return {
				comparisonTarget: "variable-value",
				varType: "social-temp",
				variableId: old.variableId,
			};
		case "combat-result-based":
			return {
				comparisonTarget: old.comparisonTarget,
				resultSubtypeComparison: old.resultSubtypeComparison,
				invertComparison: old.invertComparison,
			};
		case "num-of-others-with":
			return {
				comparisonTarget: old.comparisonTarget,
				conditionTarget: old.conditionTarget,
				group: old.group,
				otherComparison: old.otherComparison,
			};
		case "variable-value":
			switch (old.varType) {
				case "global":
					return {
						comparisonTarget: old.comparisonTarget,
						varType: old.varType,
						variableId: old.variableId,
					};
				case "scene":
					return {
						comparisonTarget: old.comparisonTarget,
						varType: old.varType,
						variableId: old.variableId,
						sceneId: old.sceneId,
					};
				case "actor":
					return {
						comparisonTarget: old.comparisonTarget,
						varType: old.varType,
						variableId: old.variableId,
						applyTo: old.applyTo,
					};
				case "social-temp":
					return {
						comparisonTarget: old.comparisonTarget,
						varType: old.varType,
						variableId: old.variableId,
					};
			}
		case "escalation":
			return {
				comparisonTarget: "deprecated",
				deprecatedType: old.comparisonTarget,
			};
		default:
			old satisfies never;
			throw new PersonaError(`Unhandled choice -- ${(old as any)?.comparisonTarget}`);
	}
}

function deriveConstant (oldC: NumericComparator | DerivedComparator) : NumericOperand & (ConstantComparison | OddEvenComparison)  {
	switch (oldC.comparator) {
		case "odd":
		case "even":
			return {
				comparisonTarget: "odd-even",
				oddEven: oldC.comparator,
			};
		case "range":
			return  {
				comparisonTarget:"constant",
				subtype: "range",
				low: oldC.num,
				high: oldC.high,
			};
	}
	if ("num" in oldC) {
		return  {
			comparisonTarget:"constant",
			subtype: "number",
			num: oldC.num,
		};
	}
	if ("resistLevel" in oldC) {
		return  {
			comparisonTarget: "constant",
			subtype: "resistance-level",
			resistLevel: oldC.resistLevel,
		};
	}
	oldC satisfies never;
	return {
		comparisonTarget:"constant",
		subtype: "number",
		num: 0,
	};
}

function deriveComparator(oldC: NumericComparator | DerivedComparator) : ComparatorNew["comparator"]  {
	switch (oldC.comparator) {
		case "odd":
		case "range":
		case "even":
			return "==";
	}
	return oldC.comparator;
}


const ROLL_TYPE = [
	"natural-roll",
	"activation-roll",
	"opening-roll",
	"total-roll",
] as const;


//Future stuff
//replaces the basic number in the num field
type LegacyNumericAmount = number;
type NumericAmount  =
	LegacyNumericAmount
	| NewNumericAmount;


type NewNumericAmount = {

}
