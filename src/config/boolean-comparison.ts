import { RollTag } from "./roll-tags.js";
import { CardTag } from "./card-tags.js";
import { HTMLTools } from "../module/utility/HTMLTools.js";
import { DeprecatedPrecondition, NonDeprecatedPrecondition, UserComparisonTarget } from "./precondition-types.js";
import { PowerType } from "./effect-types.js";
import { DamageType } from "./damage-types.js";
import { TarotCard } from "./tarot.js";
import { PowerTag } from "./power-tags.js";
import { StatusEffectId } from "./status-effects.js";
import { SocialLinkIdOrTarot } from "./precondition-types.js";
import { ConditionTarget } from "./precondition-types.js";
import { MultiCheck } from "./precondition-types.js";
import { MultiCheckOrSingle } from "./precondition-types.js";
import { CreatureType } from "./shadow-types.js";
import { ShadowRole } from "./shadow-types.js";
import { DAYS_LIST } from "./days.js";
import { WeatherType } from "./weather-types.js";
import {Defense} from "./defense-types.js";

const BASIC_BOOLEAN_COMPARISON_LIST = [
	"cameo-in-scene",
] as const;

const ACTIVE_BOOLEAN_COMPARISON_TARGET_LIST = [
	"power-has",
	"roll-property-is",
	"combat-comparison",
	"is-shadow",
	"is-pc",
	"has-tag",//universal tag finder
	"target-owner-comparison",
	"has-status",
	"status-to-be-inflicted",
	"is-same-arcana",
	"flag-state",
	"weather-is",
	"weekday-is",
	"social-target-is",
	"social-target-is-multi", //can have multiple
	"shadow-role-is",
	"active-scene-is",
	"is-gm",
	"has-item-in-inventory",
	"creature-type-is",
	"social-availability",
	"arcana-is",
	"logical-or",
	"logical-and",
	"scene-clock-name-is",
	"using-meta-pod",
	"knows-power",
	"has-class",
	"actor-exists",
	...BASIC_BOOLEAN_COMPARISON_LIST,
] as const;

const DEPRECATED_BOOLEAN_COMPARISON_LIST = [
	"has-creature-tag", // Deprecated
	"metaverse-enhanced", // Deprecated
	"power-target-type-is",
	"power-type-is",
	"power-slot-is",
	"damage-type-is",
	"is-consumable",
	"is-critical",
	"is-hit",
	"is-within-ailment-range",
	"is-within-instant-death-range",
	"in-combat",
	"is-dead",
	"engaged",
	"engaged-with",
	"is-enemy",
	"struck-weakness",
	"is-resistant-to",
	"is-distracted",
] as const;

const BOOLEAN_COMPARISON_TARGET_LIST = [
	...ACTIVE_BOOLEAN_COMPARISON_TARGET_LIST,
	...DEPRECATED_BOOLEAN_COMPARISON_LIST,
] as const;

const POWER_COMPARISON_SUBLIST_LIST = [
	"power-target-type-is",
	"power-type-is",
	"power-slot-is",
	"damage-type-is",
	"has-tag",
	"power-name-is",
	"is-consumable",
	"power-targets-defense",
] as const;

const ROLL_COMPARISON_SUBLIST_LIST = [
	"is-hit",
	"is-critical",
	"is-within-ailment-range",
	"is-within-instant-death-range",
] as const;

const COMBAT_COMPARISON_SUBLIST_LIST = [
	"in-combat",
	"engaged",
	"is-dead",
	"engaged-with",
	"is-enemy",
	"struck-weakness",
	"is-resistant-to",
	"is-distracted",
] as const;

export const COMBAT_COMPARISON_SUBLIST = HTMLTools.createLocalizationObject(COMBAT_COMPARISON_SUBLIST_LIST, "persona.preconditions.comparison");

export const ROLL_COMPARISON_SUBLIST = HTMLTools.createLocalizationObject(ROLL_COMPARISON_SUBLIST_LIST, "persona.preconditions.comparison");

export type BooleanComparisonTarget = typeof BOOLEAN_COMPARISON_TARGET_LIST[number];

export const POWER_COMPARISON_SUBLIST = HTMLTools.createLocalizationObject(POWER_COMPARISON_SUBLIST_LIST, "persona.preconditions.comparison");

export const BOOLEAN_COMPARISON_TARGET = HTMLTools.createLocalizationObject(BOOLEAN_COMPARISON_TARGET_LIST,"persona.preconditions.comparison");

export const NONDEPBOOLEAN_COMPARISON_TARGET = HTMLTools.createLocalizationObject(ACTIVE_BOOLEAN_COMPARISON_TARGET_LIST, "persona.preconditions.comparison");


type BasicComparisonTargets=  typeof BASIC_BOOLEAN_COMPARISON_LIST[number];

export type BooleanComparisonPC = {
	type : "boolean",
	booleanState : boolean,
	// boolComparisonTarget: BooleanComparisonTarget,
} & (BooleanComparisionSpecifics);

type BooleanComparisionSpecifics =
	NonDeprecatedPrecondition<NonDeprecatedBoolComparisons> | DeprecatedPrecondition<DeprecatedBoolComparisons>;

type NonDeprecatedBoolComparisons = BasicBComparisonPC | NonBasicBoolComparison ;

	type BasicBComparisonPC = {
	boolComparisonTarget:BasicComparisonTargets,
}

type NonBasicBoolComparison =
StatusComparisonPC | TagComparisonPC | FlagComparisonPC | TargettedBComparisonPC |   WeatherComparison | WeekdayComparison | SocialTargetIsComparison | SocialTargetIsComparisonMulti |  ShadowRoleComparison | SceneComparison | PlayerTypeCheckComparison | HasItemCheckComparison | CreatureTypeCheckComparion | SocialComparison | ArcanaComparison | GeneralActorComparison | BinaryLogicalComparison | SceneClockNameComparison | ActorExistsComparison | KnowsPowerComparison | HasClassComparison | StatusInflictComparisonPC | PowerComparison | RollPropertyComparison | CombatComparison;
;

type PowerComparison = {
	boolComparisonTarget: "power-has",
} & PowerComparisonsSub;

type CombatComparison = { boolComparisonTarget: "combat-comparison"} & CombatComparisonSub;

type CombatComparisonSub = {
	combatProp: 	"engaged-with"  | "is-enemy",
	conditionTarget : ConditionTarget,
	conditionTarget2: ConditionTarget,
} | {
	combatProp: "engaged" | "is-dead" | "struck-weakness" | "is-distracted";
	conditionTarget : ConditionTarget,
} |  {
	combatProp: "in-combat",
} | {
	combatProp:  "is-resistant-to",
	powerDamageType : DamageType,
	conditionTarget : ConditionTarget,
};


type RollPropertyComparison = {
	boolComparisonTarget: "roll-property-is",
	rollProp:  typeof ROLL_COMPARISON_SUBLIST_LIST[number];
} & (
	SimpleRollComparison
);

type SimpleRollComparison = {
	//simple Roll Comparisons
	rollProp: Extract< typeof ROLL_COMPARISON_SUBLIST_LIST[number], "is-critical" | "is-hit" | "is-within-ailment-range" | "is-within-instant-death-range">;
};

type PowerComparisonsSub = {
	powerProp: "power-target-type-is",
	powerTargetType: MultiCheck<Power["system"]["targets"]>,
} | {
	powerProp: "power-type-is",
	powerType : PowerType,
} | {
	powerProp: "power-slot-is",
	slotType: MultiCheck<string>,
} | {
	powerProp: "damage-type-is",
	powerDamageType : (DamageType) | MultiCheck<DamageType>,
} | {
	powerProp: "has-tag",
	powerTag: MultiCheckOrSingle<Exclude<PowerTag, Tag>>,
} | {
	powerProp: "power-name-is",
	powerId: Power["id"],
} | {
	powerProp: "is-consumable",

} | {
	powerProp: "power-targets-defense",
	defense: Defense,
};

type HasClassComparison = {
	boolComparisonTarget: "has-class",
	classId: MultiCheck<CClass["id"]>;
	conditionTarget: ConditionTarget;
};

type KnowsPowerComparison = {
	boolComparisonTarget: "knows-power";
	powerId: string;
	conditionTarget: ConditionTarget,
};

type ActorExistsComparison =  {
	boolComparisonTarget: "actor-exists";
	conditionTarget: ConditionTarget,
};

type DeprecatedBoolComparisons =
	DeprecatedSimpleComparisons | PowerTypeComparison | PowerTypeComparisonPC | DeprecatedTagComparisons | SlotTypeComparison | DamageTypeComparisonPC | DeprecatedSingleTargetComparison | DeprecatedTwoTargetComparisons | ResistanceCheck | IsEnemyComparison ;

type DeprecatedSimpleComparisons = {
	boolComparisonTarget: "is-critical" | "is-hit" | "is-within-ailment-range" | "is-within-instant-death-range" | "metaverse-enhanced" | "is-consumable"|	"in-combat";
}

type GeneralActorComparison = {
	boolComparisonTarget: "is-pc" | "is-shadow" | "using-meta-pod",
	conditionTarget: ConditionTarget,
};

type SceneClockNameComparison = {
	boolComparisonTarget: "scene-clock-name-is";
	clockName: string;
};

type IsEnemyComparison = {
	boolComparisonTarget: "is-enemy",
	conditionTarget: ConditionTarget,
	conditionTarget2: ConditionTarget,
}

export const SOCIAL_CHECKS_LIST = [
	"relationship-type-check",
	"is-social-disabled",
	"is-available",
	"is-dating",
] as const;

export type SocialCheck = typeof SOCIAL_CHECKS_LIST[number];

export const SOCIAL_CHECKS = Object.fromEntries(
	SOCIAL_CHECKS_LIST.map( x=> [x, `persona.preconditions.socialChecks.${x}`])
);

export type SocialComparisonBase = {
	boolComparisonTarget : "social-availability",
	conditionTarget: ConditionTarget,
	socialTypeCheck: SocialCheck,
};

export type SocialComparison = (SocialComparisonBase) &
	(RelationshipTypeComparison | SimpleSocialComparison | TwoPartSocialComparison);

export type TwoPartSocialComparison = {
	socialTypeCheck : "is-available" | "is-dating",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
};

export type SimpleSocialComparison = {
	socialTypeCheck : "is-social-disabled",
};

export type RelationshipTypeComparison = {
	socialTypeCheck: "relationship-type-check",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
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
	boolComparisonTarget: "is-shadow" | "is-pc" | "is-same-arcana";
	conditionTarget : ConditionTarget,
};

export type DeprecatedSingleTargetComparison = {
	boolComparisonTarget: "engaged" | "is-dead" | "struck-weakness" | "is-distracted";
	conditionTarget : ConditionTarget,
};

type TwoTargetComparison = {
	boolComparisonTarget:	"target-owner-comparison",
	conditionTarget : ConditionTarget,
	conditionTarget2: ConditionTarget,
}

type DeprecatedTwoTargetComparisons = {
	boolComparisonTarget: 	"engaged-with",
	conditionTarget : ConditionTarget,
	conditionTarget2: ConditionTarget,
}

type HasItemCheckComparison = {
	boolComparisonTarget: "has-item-in-inventory",
	itemId: string,
	conditionTarget: ConditionTarget,
	equipped: boolean,
}

type SocialTargetIsComparisonMulti = {
	boolComparisonTarget: "social-target-is-multi",
	conditionTarget : ConditionTarget,
	socialLinkIdOrTarot : MultiCheck<string>,
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
	powerTargetType: MultiCheck<Power["system"]["targets"]>,
}

type StatusComparisonPC = {
	boolComparisonTarget: "has-status",
	status : StatusEffectId | Record<StatusEffectId, boolean>,
	conditionTarget : ConditionTarget,
}

type StatusInflictComparisonPC = {
	boolComparisonTarget: "status-to-be-inflicted",
	status : StatusEffectId | Record<StatusEffectId, boolean>,
};

type TagComparisonPC = GeneralTagComparison;

type DeprecatedTagComparisons =  CreatureTagComparison;

const TAG_COMPARISON_TYPE_LIST = [
	"power",
	"actor",
	"roll",
	"weapon",
] as const;

type TagComparisonType = typeof TAG_COMPARISON_TYPE_LIST[number];

export const TAG_COMPARISON_TYPES = HTMLTools.createLocalizationObject(TAG_COMPARISON_TYPE_LIST, "persona.comparison.tagType");

type GeneralTagComparison = {
	boolComparisonTarget: "has-tag",
	tagComparisonType : TagComparisonType | undefined,
} & (
	{
	tagComparisonType: "power" | undefined,
	powerTag: MultiCheckOrSingle<Exclude<PowerTag, Tag>>,
} | {
	tagComparisonType: "actor",
	creatureTag : MultiCheckOrSingle<string>,
	conditionTarget : ConditionTarget,
} | {
	tagComparisonType: "roll",
	rollTag: MultiCheckOrSingle<RollTag | CardTag>,
} | {
	tagComparisonType: "weapon",
	rollTag: MultiCheckOrSingle<Tag["id"]>,
	conditionTarget : ConditionTarget,
}
);

type CreatureTagComparison = {
	boolComparisonTarget: "has-creature-tag",
	creatureTag : MultiCheckOrSingle<string>,
	conditionTarget : ConditionTarget,
}

type ArcanaComparison = {
	boolComparisonTarget: "arcana-is",
	conditionTarget: ConditionTarget,
	tarot: TarotCard;
}

type DamageTypeComparisonPC = {
	boolComparisonTarget: "damage-type-is" ,
	powerDamageType : (DamageType) | MultiCheck<DamageType>,
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


type BinaryLogicalComparison = {
	boolComparisonTarget: "logical-or" | "logical-and",
	comparison1: Precondition,
	comparison2: Precondition,
}

