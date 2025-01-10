import { SocialLinkIdOrTarot } from "./precondition-types.js";
import { AlterMPSubtype } from "./effect-types.js";
import { ConsequenceTarget } from "./precondition-types.js";
import { DamageSubtype } from "./effect-types.js";
import { DamageType } from "./damage-types.js";
import { ModifierVariable } from "./effect-types.js";
import { ModifierConsType } from "./effect-types.js";
import { DungeonAction } from "./effect-types.js";
import { SlotType } from "./slot-types.js";
import { CONDITION_TARGETS_LIST } from "./precondition-types.js";

import { SocialCardAction } from "./effect-types.js";
import { StudentSkill } from "./student-skills.js";
import { ResistType } from "./damage-types.js";
import { ResistStrength } from "./damage-types.js";
import { Usable } from "../module/item/persona-item.js";
import { OtherConsequence } from "../module/datamodel/other-effects.js";
import { StatusDuration } from "./status-effects.js";
import { ConsequenceType } from "./effect-types.js";
import { StatusEffectId } from "./status-effects.js";
import { ModifierTarget } from "./item-modifiers.js";
import { PC } from "../module/actor/persona-actor.js";
import { UniversalActorAccessor } from "../module/utility/db-accessor.js";
import { Shadow } from "../module/actor/persona-actor.js";
import { STATUS_EFFECT_DURATIONS_LIST } from "./status-effects.js";
import { UniversalItemAccessor } from "../module/utility/db-accessor.js";

type ExpendOtherEffect = {
	type: "expend-item";
	itemAcc: UniversalItemAccessor<Usable>;
	itemId: string;
}

export type RecoverSlotEffect = {
	type: "recover-slot",
	slot: SlotType;
	amt: number;
}

type SimpleOtherEffect = {
	type: "save-slot" | "half-hp-cost";
}

export type SetFlagEffect = {
	type: "set-flag",
	flagId: string,
	flagName: string,
	state: boolean,
	duration: StatusDuration
}

export type ResistanceShiftEffect = {
	type: "raise-resistance" | "lower-resistance",
	element: keyof PC["system"]["combat"]["resists"],
	level: PC["system"]["combat"]["resists"]["physical"],
	duration: StatusDuration,
}

export type InspirationChange = {
	type: "inspiration-cost",
	linkId : string,
	amount: number,
}

export type DisplayMessage = {
	type : "display-message",
	msg: string,
	newChatMsg: boolean,
}

export type HPLossEffect = {
	type: "hp-loss",
	amount: number,
}

export type ExtraAttackEffect = {
	type : "extra-attack",
	maxChain: number,
	iterativePenalty: number,
}

type ExecPowerEffect = {
	type: "use-power",
	newAttacker: UniversalActorAccessor<PC | Shadow>
	powerId: string,
	target: ConsTarget,
}

type ScanEffect = {
	type: "scan",
	level: number,
}

// export type SocialCardActionEffect = {
// 	type: "social-card-action",
// 	action: SocialCardAction,
// 	eventLabel: string | undefined,
// 	amount: number | undefined,
// 	studentSkill : StudentSkill | undefined,
// 	// socialActor: UniversalActorAccessor<PC | Shadow>,
// }

export type AlterEnergyEffect = {
	type: "alter-energy",
	amount: number,
}

export type AlterMPEffect = {
	type: "alter-mp",
	subtype: AlterMPSubtype,
	amount: number,
}

export type ExtraTurnEffect = {
	type: "extraTurn",
	activation: number,
};

export type OtherEffect =  AlterEnergyEffect | ExpendOtherEffect | SimpleOtherEffect | RecoverSlotEffect | SetFlagEffect | ResistanceShiftEffect | InspirationChange | DisplayMessage | HPLossEffect | ExtraAttackEffect | ExecPowerEffect | ScanEffect | SocialCardActionConsequence | DungeonActionConsequence | AlterMPEffect | ExtraTurnEffect;

export type StatusEffect = StatusEffect_Basic | StatusEffect_NonBasic;
// export type StatusEffect = {
// 	id: StatusEffectId,
// 	potency ?: number,
// 	duration : typeof STATUS_EFFECT_DURATIONS_LIST[number],
// 	other ?: any;
// };

type StatusEffect_Basic = {
	id: Exclude<StatusEffectId, StatusEffect_NonBasic["id"] >,
	potency ?: number,
	duration : typeof STATUS_EFFECT_DURATIONS_LIST[number],
}

type StatusEffect_NonBasic =
StatusEffect_FollowUp
;

type StatusEffect_FollowUp = {
	id: Extract<StatusEffectId, "bonus-action">;
	potency ?: undefined,
	duration: "UEoT";
	activationRoll: number;
}

export type Consequence =
	{
		applyToSelf ?: boolean,
		applyTo ?: ConsequenceTarget,
		actorOwner ?: UniversalActorAccessor<PC | Shadow>,
		sourceItem ?: UniversalItemAccessor<Usable>,
	} & (
		GenericConsequence | NonGenericConsequences

	);

type GenericConsequence = {
	type: Exclude<ConsequenceType, NonGenericConsequences["type"]>,
	amount ?: number,
	iterativePenalty ?: number,
	modifiedField ?: ModifierTarget,
	statusName ?: StatusEffectId,
	statusDuration ?: StatusDuration,
	itemAcc ?: UniversalItemAccessor<Usable>,
	slotType ?: SlotType,
	id ?: string,
	otherEffect ?: OtherConsequence,
	flagName ?: string,
	flagId ?: string,
	flagState ?: boolean,
	resistType ?: ResistType,
	resistanceLevel ?: ResistStrength,
	msg ?: string,
}

type NonGenericConsequences = UsePowerConsequence
	| SocialCardActionConsequence
	| DungeonActionConsequence
	| ModifierConsequence
	| DamageConsequence
	| DisplayMessageConsequence
	| ExpendItemConsequence
	| AlterMPConsequence
	| ElementalResistanceAlterConsequence
	| StatusResistanceAlterConsequence
	| OtherEffectConsequence
	| AddPowerConsequence
	| InspirationChangeConsequence
;

type InspirationChangeConsequence = {
	type: "inspiration-cost",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
	amount: number,
}

type AddPowerConsequence = {
	type: "add-power-to-list",
	id: string, // id of power
}

type OtherEffectConsequence = {
	type: "other-effect",
	otherEffect : OtherConsequence,
}

type ElementalResistanceAlterConsequence = {
	type: "raise-resistance" | "lower-resistance";
	resistType : ResistType,
	resistanceLevel : ResistStrength,
}

type StatusResistanceAlterConsequence = {
	type: "raise-status-resistance",
	statusName: StatusEffectId,
	resistanceLevel: ResistStrength,
}

type AlterMPConsequence = {
	type: "alter-mp",
	subtype: AlterMPSubtype,
	amount: number,
}

type ExpendItemConsequence = {
	type : "expend-item",
	itemId: string,
	itemAcc ?: UniversalItemAccessor<Usable>,
}

type DamageConsequenceShared = {
	type : "damage-new",
	damageSubtype: DamageSubtype
	amount ?: number; //only added later for effects
};

export type DamageConsequence = DamageConsequenceShared & (
	SimpleDamageCons
	| ConstantDamageCons
	| DamageMultiplierCons
);

type SimpleDamageCons = {
	damageSubtype: "high" | "low" | "allout-high" | "allout-low",
	damageType: DamageType | "by-power",
}

type ConstantDamageCons = {
	damageSubtype: "constant" | "percentage";
	damageType: DamageType | "by-power",
	amount: number;
}


type DamageMultiplierCons = {
	damageSubtype: "multiplier";
	amount: number;
}

type ModifierConsequence = {
	type: "modifier-new",
	modifiedFields : Record<ModifierTarget,boolean>,
	modifierType: ModifierConsType
} & ModifierData;

type ModifierData = ConstantModifier
	| SystemVariableModifier;

type ConstantModifier = {
	modifierType: "constant",
	amount: number
}

type SystemVariableModifier = {
	modifierType : "system-variable",
	varName : ModifierVariable,
	makeNegative: boolean,
}

export type SocialCardActionConsequence =
	{ type: "social-card-action" } & CardActionTypes[number];

type CardActionTypes = [
	{
		cardAction: "stop-execution"
	}, {
		cardAction: "exec-event",
		eventLabel: string,
	}, {
		cardAction: "inc-events" | "gain-money" | "modify-progress-tokens-cameo" | "modify-progress-tokens",
		amount: number,
	},{
		cardAction: "alter-student-skill",
		studentSkill: StudentSkill,
		amount : number,
	}, {
		cardAction:	"replace-card-events" | "add-card-events-to-list",
		cardId : string,
	}
];


export type DungeonActionConsequence = {
	type: "dungeon-action",
	dungeonAction: DungeonAction,
} & (
	GenericDungeonAction
	| ClockDungeonActionCons
);

type GenericDungeonAction = {
	amount: number,
	dungeonAction: "roll-tension-pool"
	| "modify-tension-pool"
	| "close-all-doors"
}

type ClockDungeonActionCons = {
	dungeonAction: "modify-clock",
	clockId: string,
	amount: number,
}

type DisplayMessageConsequence = {
	type: "display-msg",
	msg: string,
	newChatMsg: boolean,
};

type UsePowerConsequence = {
	type: "use-power",
	powerId: string,
	target: ConsTarget,
}

export const CONS_TARGET_LIST = [
	...CONDITION_TARGETS_LIST,
	"all-enemies",
	"all-allies",
	"all-combatants",
] as const;

export type ConsTarget = typeof CONS_TARGET_LIST[number];

export const CONS_TARGETS = Object.fromEntries(
	CONS_TARGET_LIST.map( x=> [x, `persona.consequence.targets.${x}`])
);


