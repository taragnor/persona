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
import { CClass, Power, Tag } from "../module/item/persona-item.js";

const BASIC_BOOLEAN_COMPARISON_LIST = [
	"in-combat",
	"is-critical",
	"is-hit",
	"is-within-ailment-range",
	"is-within-instant-death-range",
	"is-consumable",
	"cameo-in-scene",
] as const;

const ACTIVE_BOOLEAN_COMPARISON_TARGET_LIST = [
	...BASIC_BOOLEAN_COMPARISON_LIST,
	"actor-exists",
	"engaged",
	"engaged-with",
	"is-shadow",
	"is-pc",
	"is-enemy",
	"has-tag",//universal tag finder
	"is-dead",
	"power-has",
	"target-owner-comparison",
	"has-status",
	"status-to-be-inflicted",
	"struck-weakness",
	"is-resistant-to",
	"is-same-arcana",
	"flag-state",
	"weather-is",
	"weekday-is",
	"social-target-is",
	"social-target-is-multi", //can have multiple
	"shadow-role-is",
	"is-distracted",
	"active-scene-is",
	"is-gm",
	"has-item-in-inventory",
	"creature-type-is",
	"social-availability",
	"arcana-is",
	"logical-or",
	"scene-clock-name-is",
	"using-meta-pod",
	"knows-power",
	"has-class",
] as const;

const DEPRECATED_BOOLEAN_COMPARISON_LIST = [
	"has-creature-tag", // Deprecated
	"metaverse-enhanced", // Deprecated
	"power-target-type-is",
	"power-type-is",
	"power-slot-is",
	"damage-type-is",
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
] as const;

export type BooleanComparisonTarget = typeof BOOLEAN_COMPARISON_TARGET_LIST[number];

export const POWER_COMPARISON_SUBLIST = HTMLTools.createLocalizationObject(POWER_COMPARISON_SUBLIST_LIST, "persona.preconditions.comparison");

export const BOOLEAN_COMPARISON_TARGET = Object.fromEntries(
	BOOLEAN_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
);

export const NONDEPBOOLEAN_COMPARISON_TARGET = HTMLTools.createLocalizationObject(ACTIVE_BOOLEAN_COMPARISON_TARGET_LIST, "persona.preconditions.comparison");


type BasicComparisonTargets=  typeof BASIC_BOOLEAN_COMPARISON_LIST[number];

export type BooleanComparisonPC = {
	type : "boolean",
	booleanState : boolean,
	// boolComparisonTarget: BooleanComparisonTarget,
} & (BooleanComparisionSpecifics);

type BooleanComparisionSpecifics =
	NonDeprecatedPrecondition<NonDeprecatedBoolComparisons> | DeprecatedPrecondition<DeprecatedBoolComparisons>;

type NonDeprecatedBoolComparisons = BasicBComparisonPC | NonBasicBoolComparison;

	type BasicBComparisonPC = {
	boolComparisonTarget:BasicComparisonTargets,
}

type NonBasicBoolComparison =
StatusComparisonPC | TagComparisonPC | FlagComparisonPC | TargettedBComparisonPC | ResistanceCheck |  WeatherComparison | WeekdayComparison | SocialTargetIsComparison | SocialTargetIsComparisonMulti |  ShadowRoleComparison | SceneComparison | PlayerTypeCheckComparison | HasItemCheckComparison | CreatureTypeCheckComparion | SocialComparison | ArcanaComparison | GeneralActorComparison | IsEnemyComparison | OrComparison | SceneClockNameComparison | ActorExistsComparison | KnowsPowerComparison | HasClassComparison | StatusInflictComparisonPC | PowerComparison
;

type PowerComparison = {
	boolComparisonTarget: "power-has",
} & PowerComparisonsSub;

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
	MetaverseEnhancedComparison | PowerTypeComparison | PowerTypeComparisonPC | DeprecatedTagComparisons | SlotTypeComparison | DamageTypeComparisonPC;
;

type MetaverseEnhancedComparison = {
	boolComparisonTarget: "metaverse-enhanced",
};


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


type OrComparison = {
	boolComparisonTarget: "logical-or",
	comparison1: Precondition,
	comparison2: Precondition,
}

