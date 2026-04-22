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



type SituationType = SituationTypes.AllSituations;

declare global{

namespace SituationTypes {

export type AllSituations =
  TriggerSituation  | MinorSituation | SocialCardSituation | AllRollSituations | BonusQuerySituation | PowerPricing
  ;

  export type MinorSituation = MinorPowerUseSituation
    | UserOnlySituation;

  type AllRollSituations = SituationComponent.Roll | SituationComponent.PreRoll;

  export type Roll = SituationComponent.Roll;
  export type PreRoll = SituationComponent.PreRoll;

  export type SocialCardSituation = SituationComponent.SocialCard;

  export type TriggerSituation = TriggeredSituation.TriggerSituation;

  export type BonusQuerySituation = (OffensiveBonusSituation | DefensiveBonusSituation | PowerPricing | UserOnlyBonusSituation)
    &  Partial<BonusQueryAdds>;

  type MinorPowerUseSituation = SituationComponent.PowerUse & Partial<SituationComponent.User>;

  type UserOnlySituation = SituationComponent.User;

  type UserOnlyBonusSituation  = SituationComponent.User;

  type OffensiveBonusSituation  = SituationComponent.User & SituationComponent.Attacker & Partial<SituationComponent.PowerUse>;

  type DefensiveBonusSituation  = SituationComponent.User & SituationComponent.Targetted & Partial<SituationComponent.PowerUse>;

  type PowerPricing = SituationComponent.UsedPower & Partial<SituationComponent.PowerUse>;

  type BonusQueryAdds = {
    statusEffect: StatusEffectId;
  }
}

namespace SituationComponent {
  export type User =  {
    user: UniversalActorAccessor<ValidAttackers>;
  }

  export type Attacker  = User & {
    attacker: UniversalActorAccessor<ValidAttackers>;
  }

  export type Targetted =  {
    target: UniversalActorAccessor<ValidAttackers>,
  };

  export type TriggeringCharacter = Partial<User> & {
    triggeringCharacter:  UniversalActorAccessor<ValidAttackers>;
  }

  export type SocialCard = AddedTags & User & {
    socialRandom: number;
    cameo : U<UniversalActorAccessor<ValidSocialTarget>>;
    cardEventItem ?: U<EnchantedTreasureFormat>,
    target : U<UniversalActorAccessor<ValidSocialTarget>>;
  }

  export type AddedTags = {
    addedTags : (RollTag | CardTag |  Tag | PowerTag)[];
  }

  export type UsedPower = {
    usedPower : UniversalItemAccessor<UsableAndCard>;
  }

  export type PowerUse = User & Targetted & AddedTags
    & UsedPower;

  type Roll = RollParts.RollSituation;
  type PreRoll = RollParts.PreRollSituation;

  export namespace RollParts {
    export type RollSituation = CompletedRoll;
    export type PreRollSituation = PreRoll;

    export type CompletedRoll = PreRollCore & CompletedRollPart & (MinorRollSubtypes | CombatReportPart | OpeningRoll);

    type CompletedRollPart =  {
      naturalRoll : number,
      rollTotal : number;
      result : AttackResult["result"];
    };

    type OpeningRoll = User & Exclude<CompletedRollPart, "result"> & {
      rollType: "opener"
    }

    type PreRollCore = User & {
      rollTags : (RollTag | CardTag | Tag)[],
      DC : U<number>;
      rollType ?: U<AttackRollType | "opener">;
    } & AddedTags

    export type PreRoll = User & PreRollCore
      &  Partial<MinorRollSubtypes | CombatPreRollPart>;

    type MinorRollSubtypes = SkillRollPart | SavingThrowPart | PowerUsePart;

    type SavingThrowPart = {
      saveVersus : N<StatusEffectId>;
    }

    type SkillRollPart = {
      usedSkill : SocialStat;
    };

    type PowerUsePart = SituationComponent.User & SituationComponent.Attacker & SituationComponent.Targetted & {
      usedPower : UniversalItemAccessor<UsableAndCard>;
      rollType: AttackRollType,
    }


    type CombatPreRollPart = PowerUsePart & {
      ailmentRange : AttackResult["ailmentRange"],
      instantKillRange : AttackResult["instantKillRange"],
      critRange : AttackResult["critRange"],
      attackerPersona: Persona,
      targetPersona: Persona,
    }

    type CombatReportPart = Partial<CombatPreRollPart> & PowerUsePart & CompletedRollPart & {
      withinAilmentRange : boolean;
      withinInstantKillRange : boolean;
      withinCritRange : boolean;
      resisted : boolean;
      struckWeakness : boolean;
      attackerPersona: Persona,
      targetPersona: Persona,
    }

  }

}

namespace TriggeredSituation {
  export type TriggerSituation = TriggerSituation_base &( 
    ExplorationTrigger
    | OnRollTrigger
    | ClockTrigger
    | StartSocialTurnTrigger
    | OnPowerUsageCheckTrigger
    | CombatTrigger
  );

  type ExplorationTrigger =  GenericExplorationTrigger
    | EnterMetaverseTrigger
    | EnterRegionTrigger
    | PresenceCheckTrigger
    | TarotPerkTrigger
  ;

  type GenericExplorationTrigger = Partial<SituationComponent.TriggeringCharacter> & {
    trigger: "on-open-door" | "on-search-end" | "exit-metaverse" | "on-metaverse-turn" | "on-active-scene-change";
  }

  type TarotPerkTrigger = SituationComponent.User &  {
    trigger: "on-attain-tarot-perk";
    tarot : TarotCard;
    target : U<UniversalActorAccessor<ValidSocialTarget>>;
  }

  type EnterMetaverseTrigger = SituationComponent.User
    & SituationComponent.TriggeringCharacter
    & {
    trigger : "enter-metaverse";
  }

  type OnRollTrigger = SituationComponent.TriggeringCharacter &{
    trigger: "on-roll",
  } & SituationComponent.RollParts.CompletedRoll;

  type ClockTrigger = {
    trigger: "on-clock-tick" | "on-clock-change",
    triggeringClockId: string,
  }

  type StartSocialTurnTrigger =SituationComponent.TriggeringCharacter  & {
    trigger: "on-social-turn-start",
  };


  type OnPowerUsageCheckTrigger = SituationComponent.User &
    SituationComponent.PowerUse & {
      trigger: "on-power-usage-check",
    }

  type OnPowerStartUse = SituationComponent.User &
    SituationComponent.Targetted
    & SituationComponent.PowerUse
    & SituationComponent.TriggeringCharacter
    & {
      trigger: "get-added-power-tags",
    }

  type NonGenericCombatTrigger =
    InflictStatusTrigger
    | CombatGlobalTrigger
    | UsePowerTrigger
    | KillTargetTrigger
    | CombatEndIndividual
    | PreDamageTrigger
    | DamageTrigger
    | StartEventTrigger
    | EndEventTrigger
    | OnPowerStartUse
    | OnAETimeoutTrigger
  ;

  type OnAETimeoutTrigger = SituationComponent.TriggeringCharacter & {
    trigger: "on-active-effect-time-out" | "on-active-effect-end",
    activeEffect: UniversalAEAccessor<PersonaAE>,
    user: UniversalActorAccessor<ValidAttackers>,
    activeDuration: U<number>,  //number of turns active
  }

  type CombatTrigger = (
    GenericCombatTrigger
    | NonGenericCombatTrigger
  );

  type GenericCombatTrigger = SituationComponent.User
    & Partial<SituationComponent.TriggeringCharacter>
    & {
    trigger: Exclude<CombatTriggerTypes, NonGenericCombatTrigger["trigger"]>;
  }


  type StartEventTrigger = {
    trigger: "on-event-start" ;
    event: UniversalItemAccessor<PersonaEvent>;
  }

  type EndEventTrigger = {
    trigger: "on-event-end" ;
    event: UniversalItemAccessor<PersonaEvent>;
  }

  type DamageTrigger =SituationComponent.User
    & SituationComponent.Targetted & {
      trigger: "on-damage",
    }

  type PreDamageTrigger = SituationComponent.User
    & SituationComponent.Targetted //target is same as triggering character
    & SituationComponent.TriggeringCharacter
    & {
      trigger: "pre-take-damage",
      amt: number,
      damageType: RealDamageType,
    }

  type KillTargetTrigger = SituationComponent.User & SituationComponent.Targetted & SituationComponent.Attacker & SituationComponent.TriggeringCharacter &{
    trigger: "on-kill-target",
  }


  type UsePowerTrigger = SituationComponent.User &
   SituationComponent.TriggeringCharacter
    & {
    trigger: "on-use-power",
    combatResult: FinalizedCombatResult,
  } & SituationComponent.Targetted;

  type InflictStatusTrigger_Generic =
    SituationComponent.Targetted
    & Partial<SituationComponent.PowerUse>
    /** one recieving the status*/
    & SituationComponent.TriggeringCharacter
    & {
      // trigger: "on-inflict-status" | "pre-inflict-status",
      statusEffect: StatusEffectId,
      /**  The one recieving the status */
      // target: UniversalActorAccessor<ValidAttackers>,
    };

  type OnInflictStatusTrigger = SituationComponent.User & InflictStatusTrigger_Generic & {
    trigger: "on-inflict-status",
    /** The one who inflicted the status */
    attacker: UniversalActorAccessor<ValidAttackers>,
  };

  type OnPreInflictStatusTrigger =  SituationComponent.User & InflictStatusTrigger_Generic & {
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

  type CombatEndIndividual = SituationComponent.User
    & SituationComponent.TriggeringCharacter
    & {
      trigger: "on-combat-end",
      result : AttackResult["result"],
      combatOutcome: "win" | "draw" | "lose",
    }

  type TriggerSituation_base = {
    triggeringUser : FoundryUser,
  }

  type PresenceCheckTrigger = {
    trigger: "on-presence-check",
    triggeringRegionId : string,
  }

  type EnterRegionTrigger =
    Partial<SituationComponent.TriggeringCharacter> & {
      trigger: "on-enter-region",
      triggeringRegionId : string,
    }

}








export type PowerOnlySituation =
  {
    usedPower : UniversalItemAccessor<UsableAndCard>;//this is special due to consstraints
    user?: undefined;
  };


// export type BaseAttackRollSituation<T extends object = object> =  RollSituation<T>
//   & TargettedSituation & {
//     rollType: AttackRollType,
//     DC ?: U<number>;
//   }

// type CombatTypeSituation = UserSituation &
//   {type: "combat"} & (
//     BaseAttackRollSituation
//     | AttackRollSituation
//     | PostAttackRollSituation
//   );


// export type AttackRollSituation = BaseAttackRollSituation & {
//   withinAilmentRange ?: boolean;
//   withinInstantKillRange ?: boolean;
//   withinCritRange ?: boolean;
//   ailmentRange ?: AttackResult["ailmentRange"],
//   instantKillRange ?: AttackResult["instantKillRange"],
//   critRange ?: AttackResult["critRange"],
//   DC : number;
//   result ?: AttackResult["result"],
// }

// export type PostAttackRollSituation = AttackRollSituation & {
//   withinAilmentRange : boolean;
//   withinInstantKillRange : boolean;
//   withinCritRange : boolean;
//   ailmentRange ?: AttackResult["ailmentRange"],
//   instantKillRange ?: AttackResult["instantKillRange"],
//   critRange ?: AttackResult["critRange"],
//   result : AttackResult["result"],
//   DC : number;
//   resisted : boolean;
//   struckWeakness : boolean;
// }


//type SituationUniversal = {
//	//more things can be added here all should be optional
//	user?: UniversalActorAccessor<ValidAttackers>;
//	persona?: Persona;
//	usedPower ?: UniversalItemAccessor<UsableAndCard>;
//	usedSkill ?: SocialStat;
//	activeCombat ?: boolean ;
//	target ?: UniversalActorAccessor<ValidAttackers>;
//	attacker ?:UniversalActorAccessor<ValidAttackers>;
//	saveVersus ?: StatusEffectId;
//	statusEffect ?: StatusEffectId;
//	eventCard ?: UniversalItemAccessor<SocialCard>,
//	isSocial?: boolean,
//	result ?: AttackResult["result"],
//	tarot ?: TarotCard,
//	socialTarget ?: UniversalActorAccessor<ValidSocialTarget>;
//	cameo ?: UniversalActorAccessor<ValidSocialTarget>;
//	"triggering-character" ?: never;
//} & (RollSituation | NonRollSituation);

  type Situation = SituationType;
}


type v = Prettify<HasKey<Situation, "attacker"> & {usedPower: never}>





