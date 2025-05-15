import { CardTag } from "./card-tags.js";
import { SocialCard } from "../module/item/persona-item.js";
import { UsableAndCard } from "../module/item/persona-item.js";
import { Persona } from "../module/persona-class.js";
import { RollTag } from "./roll-tags.js";
import { ValidSocialTarget } from "../module/social/persona-social.js";
import { SocialStat } from "../config/student-skills.js";
import { TarotCard } from "../config/tarot.js";
import { StatusEffectId } from "./status-effects";
import { CombatResult } from "../module/combat/combat-result.js";
import { CombatTriggerTypes } from "./triggers.js";
import { ValidAttackers } from "../module/combat/persona-combat.js";
import { UniversalActorAccessor } from "../module/utility/db-accessor.js";
import { UniversalItemAccessor } from "../module/utility/db-accessor.js";

type UserSituation = {
	user: UniversalActorAccessor<ValidAttackers>;
};

type TriggerSituation = TriggerSituation_base & (
	CombatTrigger
	| PresenceCheckTrigger
	| EnterRegionTrigger
	| ExplorationTrigger
	| ClockTrigger
	| OnRollTrigger
);

type ExplorationTrigger = {
	trigger: "on-open-door" | "on-search-end" | "on-attain-tarot-perk" | "enter-metaverse" | "exit-metaverse" | "on-metaverse-turn";
	triggeringCharacter?:  UniversalActorAccessor<ValidAttackers>;
}

export type OnRollTrigger = {
	trigger: "on-roll",
	triggeringCharacter: UniversalActorAccessor<ValidAttackers>,
	user: UniversalActorAccessor<ValidAttackers>,
} & RollSituation;

type ClockTrigger = {
	trigger: "on-clock-tick" | "on-clock-change",
	triggeringClockId: string,
}

type CombatTrigger = (
	GenericCombatTrigger
	| NonGenericCombatTrigger
);


type GenericCombatTrigger = UserSituation & {
	trigger: Exclude<CombatTriggerTypes, NonGenericCombatTrigger["trigger"]>;
	triggeringCharacter?:  UniversalActorAccessor<ValidAttackers>;
}

type NonGenericCombatTrigger =
	InflictStatusTrigger
	| CombatGlobalTrigger
	| UsePowerTrigger
	| KillTargetTrigger
;

type KillTargetTrigger = UserSituation & {
	trigger: "on-kill-target",
	triggeringCharacter: UniversalActorAccessor<ValidAttackers>,
}


type UsePowerTrigger = UserSituation & {
	trigger: "on-use-power",
	triggeringCharacter: UniversalActorAccessor<ValidAttackers>;
	combatResult: CombatResult,
}

type InflictStatusTrigger = UserSituation & {
	trigger: "on-inflict-status",
	statusEffect: StatusEffectId,
}

type CombatGlobalTrigger = {
	trigger: "on-combat-end-global",
}

type TriggerSituation_base = {
	triggeringUser : FoundryUser,
}

type PresenceCheckTrigger = {
	trigger: "on-presence-check",
	triggeringRegionId : string,
}

type EnterRegionTrigger = {
	trigger: "on-enter-region",
	triggeringRegionId : string,
	triggeringCharacter ?:  UniversalActorAccessor<ValidAttackers>;
}

type SituationType = SituationUniversal & (
	TriggerSituation  | NonTriggerUserSituation | SocialCardSituation);

type NonTriggerUserSituation = UserSituation & {trigger ?: never};

export type SocialCardSituation = UserSituation & {
	attacker : UniversalActorAccessor<ValidSocialTarget>;
	socialRandom :number;
	socialTarget ?: UniversalActorAccessor<ValidSocialTarget>;
	target ?: UniversalActorAccessor<ValidSocialTarget>;
	isSocial: true;
	cameo : UniversalActorAccessor<ValidSocialTarget> | undefined;
	trigger ?: never;
};

//CHANGED THIS SO THAT IT WOULD force roll data when needed
export type RollSituation = {
	// activationRoll ?: boolean;
	// openingRoll ?: number,
	naturalRoll : number,
	rollTags : (RollTag | CardTag)[],
	rollTotal : number;
	hit?: boolean;
	criticalHit ?: boolean;
	DC ?: number;
}

type NonRollSituation = {
	// activationRoll ?: undefined;
	naturalRoll ?: undefined,
	// openingRoll ?: undefined,
	criticalHit ?: undefined;
	rollTags ?: (RollTag | CardTag)[];
	rollTotal ?: undefined;
}

type SituationUniversal = {
	//more things can be added here all should be optional
	user?: UniversalActorAccessor<ValidAttackers>;
	persona?: Persona;
	usedPower ?: UniversalItemAccessor<UsableAndCard>;
	usedSkill ?: SocialStat;
	activeCombat ?: boolean ;
	hit ?: boolean; // Todo change the wording of this to success since it funcitons in for universal succes
	resisted ?: boolean;
	struckWeakness ?: boolean;
	isAbsorbed ?: boolean;
	target ?: UniversalActorAccessor<ValidAttackers>;
	attacker ?:UniversalActorAccessor<ValidAttackers>;
	saveVersus ?: StatusEffectId;
	statusEffect ?: StatusEffectId;
	eventCard ?: UniversalItemAccessor<SocialCard>,
	isSocial?: boolean,
	tarot ?: TarotCard,
	socialTarget ?: UniversalActorAccessor<ValidSocialTarget>;
	socialRandom ?: number;
	cameo ?: UniversalActorAccessor<ValidSocialTarget>;
} & (RollSituation | NonRollSituation);




declare global {
	type Situation = SituationType;
}
