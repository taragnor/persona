import { PowerTag } from "./power-tags.js";
import { CardTag } from "./card-tags.js";
import { Persona } from "../module/persona-class.js";
import { RollTag } from "./roll-tags.js";
import { SocialStat } from "../config/student-skills.js";
import { TarotCard } from "../config/tarot.js";
import { StatusEffectId } from "./status-effects";
import { AttackResult} from "../module/combat/combat-result.js";
import { CombatTriggerTypes } from "./triggers.js";
import {RealDamageType} from "./damage-types.js";
import {FinalizedCombatResult} from "../module/combat/finalized-combat-result.js";
import {EnchantedTreasureFormat} from "../module/exploration/treasure-system.js";
import {AttackRollType} from "../module/combat/combat-engine.js";
import {PersonaAE} from "../module/persona-ae.js";

export type UserSituation = {
	user: UniversalActorAccessor<ValidAttackers>;
};

type TriggerSituation = TriggerSituation_base & (
	CombatTrigger
	| PresenceCheckTrigger
	| EnterRegionTrigger
	| ExplorationTrigger
	| ClockTrigger
	| OnRollTrigger
	| OnAETimeoutTrigger
	| OnPowerUsageCheckTrigger
  | StartSocialTurnTrigger
);

type ExplorationTrigger = {
	trigger: "on-open-door" | "on-search-end" | "on-attain-tarot-perk" | "enter-metaverse" | "exit-metaverse" | "on-metaverse-turn" | "on-active-scene-change";
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

type StartSocialTurnTrigger ={
  trigger: "on-social-turn-start",
  triggeringCharacter: UniversalActorAccessor<PC>,
};


type OnPowerUsageCheckTrigger = UserSituation & {
	trigger: "on-power-usage-check",
	usedPower : UniversalItemAccessor<UsableAndCard>;
}

type OnAETimeoutTrigger = {
	trigger: "on-active-effect-time-out" | "on-active-effect-end",
	activeEffect: UniversalAEAccessor<PersonaAE>,
	user: UniversalActorAccessor<ValidAttackers>,
	triggeringCharacter: UniversalActorAccessor<ValidAttackers>,
	activeDuration: U<number>,  //number of turns active
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
	| CombatEndIndividual
	| PreDamageTrigger
	| StartEventTrigger
	| EndEventTrigger
;

type StartEventTrigger = {
	trigger: "on-event-start" ;
	event: UniversalItemAccessor<PersonaEvent>;
}

type EndEventTrigger = {
	trigger: "on-event-end" ;
	event: UniversalItemAccessor<PersonaEvent>;
}

type PreDamageTrigger = UserSituation & {
	trigger: "pre-take-damage",
	triggeringCharacter: UniversalActorAccessor<ValidAttackers>, // the one who was damaged
	attacker: UniversalActorAccessor<ValidAttackers>,
	amt: number,
	target: UniversalActorAccessor<ValidAttackers>, //same as triggering character
	usedPower ?: UniversalItemAccessor<UsableAndCard>;
	damageType: RealDamageType,
}

type KillTargetTrigger = UserSituation & {
	trigger: "on-kill-target",
	triggeringCharacter: UniversalActorAccessor<ValidAttackers>,
}


type UsePowerTrigger = UserSituation & {
	trigger: "on-use-power",
	triggeringCharacter: UniversalActorAccessor<ValidAttackers>;
	combatResult: FinalizedCombatResult,
}

type InflictStatusTrigger_Generic = {
	// trigger: "on-inflict-status" | "pre-inflict-status",
	statusEffect: StatusEffectId,
	usedPower : U<UniversalItemAccessor<UsableAndCard>>;
	/**  The one recieving the status */
	triggeringCharacter: UniversalActorAccessor<ValidAttackers>,
	/**  The one recieving the status */
	target: UniversalActorAccessor<ValidAttackers>,

};

type OnInflictStatusTrigger = UserSituation & InflictStatusTrigger_Generic & {
	trigger: "on-inflict-status",
	/** The one who inflicted the status */
	attacker: UniversalActorAccessor<ValidAttackers>,
};

type OnPreInflictStatusTrigger =  UserSituation & InflictStatusTrigger_Generic & {
	trigger :"pre-inflict-status",
};

type InflictStatusTrigger = 
	OnInflictStatusTrigger
	| OnPreInflictStatusTrigger;


type CombatGlobalTrigger = CombatEndGlobal | CombatStartGlobal;

type CombatEndGlobal = {
	trigger: "on-combat-end-global",
}

type CombatStartGlobal = {
	trigger: "on-combat-start-global",

}

type CombatEndIndividual = {
	trigger: "on-combat-end",
	triggeringCharacter: UniversalActorAccessor<ValidAttackers>,
	hit: boolean,
  combatOutcome: "win" | "draw" | "lose",
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
	TriggerSituation  | NonTriggerUserSituation | SocialCardSituation | CombatTypeSituation);

type NonTriggerUserSituation =
	PowerOnlySituation |
	(UserSituation & {trigger?: never});

type PowerOnlySituation = {
	usedPower : UniversalItemAccessor<Usable>;
	trigger?: never;
	user?: never;
};

export type SocialCardSituation = UserSituation & {
	attacker : UniversalActorAccessor<ValidSocialTarget>;
	socialRandom :number;
	socialTarget ?: UniversalActorAccessor<ValidSocialTarget>;
	target ?: UniversalActorAccessor<ValidSocialTarget>;
	isSocial: true;
	cameo : UniversalActorAccessor<ValidSocialTarget> | undefined;
	trigger ?: never;
	cardEventItem ?: U<EnchantedTreasureFormat>,
};

//CHANGED THIS SO THAT IT WOULD force roll data when needed
export type RollSituation = {
	// activationRoll ?: boolean;
	// openingRoll ?: number,
	naturalRoll : number,
	rollTags : (RollTag | CardTag | Tag)[],
	rollTotal : number;
	criticalHit ?: boolean;
	DC ?: number;
	addedTags ?: PowerTag[],
}

export type BaseAttackRollSituation = RollSituation & {
	rollType: AttackRollType,
	DC ?: number;
	attacker :UniversalActorAccessor<ValidAttackers>;
	target : UniversalActorAccessor<ValidAttackers>;
}

type CombatTypeSituation = UserSituation & (BaseAttackRollSituation | AttackRollSituation | PostAttackRollSituation);


export type AttackRollSituation = BaseAttackRollSituation & {
	withinAilmentRange ?: boolean;
	withinInstantKillRange ?: boolean;
	withinCritRange ?: boolean;
	ailmentRange ?: AttackResult["ailmentRange"],
	instantKillRange ?: AttackResult["instantKillRange"],
	critRange ?: AttackResult["critRange"],
	DC : number;
	result ?: AttackResult["result"],
}

export type PostAttackRollSituation = AttackRollSituation & {
	withinAilmentRange : boolean;
	withinInstantKillRange : boolean;
	withinCritRange : boolean;
	ailmentRange ?: AttackResult["ailmentRange"],
	instantKillRange ?: AttackResult["instantKillRange"],
	critRange ?: AttackResult["critRange"],
	result : AttackResult["result"],
	DC : number;
	resisted : boolean;
	struckWeakness : boolean;
}

type NonRollSituation = {
	naturalRoll ?: undefined,
	rollTags ?: (RollTag | CardTag | Tag)[];
	rollTotal ?: undefined;
}

type SituationUniversal = {
	//more things can be added here all should be optional
	user?: UniversalActorAccessor<ValidAttackers>;
	persona?: Persona;
	usedPower ?: UniversalItemAccessor<UsableAndCard>;
	usedSkill ?: SocialStat;
	activeCombat ?: boolean ;
	target ?: UniversalActorAccessor<ValidAttackers>;
	attacker ?:UniversalActorAccessor<ValidAttackers>;
	saveVersus ?: StatusEffectId;
	statusEffect ?: StatusEffectId;
	eventCard ?: UniversalItemAccessor<SocialCard>,
	isSocial?: boolean,
	result ?: AttackResult["result"],
	tarot ?: TarotCard,
	socialTarget ?: UniversalActorAccessor<ValidSocialTarget>;
	cameo ?: UniversalActorAccessor<ValidSocialTarget>;
	"triggering-character" ?: never;
} & (RollSituation | NonRollSituation);

declare global {
	type Situation = SituationType;
}
