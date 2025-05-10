import { Precondition } from "./precondition-types.js";
import { UserComparisonTarget } from "./precondition-types.js";
import { PowerType } from "./effect-types.js";
import { DamageType } from "./damage-types.js";
import { TarotCard } from "./tarot.js";
import { PowerTag } from "./power-tags.js";
import { StatusEffectId } from "./status-effects.js";
import { SocialLinkIdOrTarot } from "./precondition-types.js";
import { ConditionTarget } from "./precondition-types.js";
import { MultiCheck } from "./precondition-types.js";
import { CreatureTag } from "./creature-tags.js";
import { CreatureType } from "./shadow-types.js";
import { ShadowRole } from "./shadow-types.js";
import { DAYS_LIST } from "./days.js";
import { WeatherType } from "./weather-types.js";
import { Power } from "../module/item/persona-item.js";

const BOOLEAN_COMPARISON_TARGET_LIST = [
	"engaged",
	"engaged-with",
	"metaverse-enhanced",
	"is-shadow",
	"is-pc",
	"is-enemy",
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
	"social-target-is-multi", //can have multiple
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
	"logical-or",
] as const;


export type BooleanComparisonTarget = typeof BOOLEAN_COMPARISON_TARGET_LIST[number];

export const BOOLEAN_COMPARISON_TARGET = Object.fromEntries(
	BOOLEAN_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
);

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
StatusComparisonPC | TagComparisonPC | DamageTypeComparisonPC | PowerTypeComparisonPC | FlagComparisonPC | TargettedBComparisonPC | ResistanceCheck | PowerTypeComparison | WeatherComparison | WeekdayComparison | SocialTargetIsComparison | SocialTargetIsComparisonMulti |  ShadowRoleComparison | SceneComparison | PlayerTypeCheckComparison | HasItemCheckComparison | CreatureTypeCheckComparion | SlotTypeComparison | SocialComparison | ArcanaComparison | GeneralActorComparison | IsEnemyComparison | OrComparison;
;

type GeneralActorComparison = {
	boolComparisonTarget: "is-PC" | "is-shadow",
	conditionTarget: ConditionTarget,
}

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


type OrComparison = {
	boolComparisonTarget: "logical-or",
	comparison1: Precondition,
	comparison2: Precondition,
}

