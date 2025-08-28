import { HTMLTools } from "../module/utility/HTMLTools.js";
import { ValidAttackers } from "../module/combat/persona-combat.js";
import { TargettingContextList } from "../module/combat/persona-combat.js";
import { PowerContainer } from "../module/item/persona-item.js";
import { PermaBuffType } from "./perma-buff-type.js";
import { SocialCardAction } from "./effect-types.js";
import { CardTag } from "./card-tags.js";
import { VariableType } from "../module/persona-variables.js";
import { CombatEffect } from "./effect-types.js";
import { Consumable } from "../module/item/persona-item.js";
import { SkillCard } from "../module/item/persona-item.js";
import { ConsequenceType } from "./effect-types.js";
import { CreatureTag } from "./creature-tags.js";
import { SaveType } from "./save-types.js";
import { StatusDurationType } from "./status-effects.js";
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

import { StudentSkill } from "./student-skills.js";
import { ResistType } from "./damage-types.js";
import { ResistStrength } from "./damage-types.js";
import { Usable } from "../module/item/persona-item.js";
import { OtherConsequence } from "../module/datamodel/other-effects.js";
import { StatusDuration } from "../module/active-effect.js";
import { StatusEffectId } from "./status-effects.js";
import { ModifierTarget } from "./item-modifiers.js";
import { PC } from "../module/actor/persona-actor.js";

type ExpendOtherEffect = {
	type: "expend-item";
	itemAcc: UniversalItemAccessor<Consumable | SkillCard>;
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
	newAttacker: UniversalActorAccessor<ValidAttackers>
	powerId: string,
	target: ConsTarget,
}

type ScanEffect = {
	type: "scan",
	level: number,
}

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

export type OtherEffect =  AlterEnergyEffect | ExpendOtherEffect | SimpleOtherEffect | RecoverSlotEffect | SetFlagEffect | ResistanceShiftEffect | InspirationChange | DisplayMessage | HPLossEffect | ExtraAttackEffect | ExecPowerEffect | ScanEffect | SocialCardActionConsequence | DungeonActionConsequence | AlterMPEffect | ExtraTurnEffect | AddPowerConsequence | CombatEffectConsequence | FatigueConsequence | AlterVariableOtherEffect | PermabuffConsequence	| PlaySoundConsequence
;

type AlterVariableOtherEffect = AlterVariableConsequence & {contextList: TargettingContextList}

export type StatusEffect = StatusEffect_Basic | StatusEffect_NonBasic;

type StatusEffect_Basic = {
	id: Exclude<StatusEffectId, StatusEffect_NonBasic["id"] >,
	potency ?: number,
	duration: StatusDuration,
};

type StatusEffect_NonBasic =
	StatusEffect_FollowUp
;

type StatusEffect_FollowUp = {
	id: Extract<StatusEffectId, "bonus-action">;
	potency ?: undefined,
	duration: StatusDuration & {
		dtype: "UEoT";
	},
	activationRoll: number,
}

export type SourcedConsequence<C extends Consequence = Consequence> = C & {
	source: {displayedName: string} | PowerContainer | null;
	modifiers?: ConsModifiers[];
}

type ConsModifiers = "blocked" | "absorbed" | "resisted";

export type Consequence =
	{
		applyToSelf ?: boolean,
		applyTo ?: ConsequenceTarget,
		actorOwner ?: UniversalActorAccessor<ValidAttackers>,
	} & (
		GenericConsequence | NonGenericConsequences

	);

type GenericConsequence = {
	type: Exclude<ConsequenceType, NonGenericConsequences["type"]>,
	amount ?: number,
	iterativePenalty ?: number,
	modifiedField ?: ModifierTarget,
	itemAcc ?: UniversalItemAccessor<Usable>,
	slotType ?: SlotType,
	id ?: string,
	otherEffect ?: OtherConsequence,
	resistType ?: ResistType,
	resistanceLevel ?: ResistStrength,
	msg ?: string,
}

type NonGenericConsequences = UsePowerConsequence
	| SocialCardActionConsequence
	| DungeonActionConsequence
	| ModifierConsequence
	| OldDamageConsequence
	| DamageConsequence
	| DisplayMessageConsequence
	| ExpendItemConsequence
	| AlterMPConsequence
	| ElementalResistanceAlterConsequence
	| StatusResistanceAlterConsequence
	| OtherEffectConsequence
	| AddPowerConsequence
	| InspirationChangeConsequence
	| AddStatusConsequence
	| RemoveStatusConsequence
	| SetFlagConsequence
	| AddTagConsequence
	| CombatEffectConsequence
	| FatigueConsequence
	| AlterVariableConsequence
	| PermabuffConsequence
	| PlaySoundConsequence
;


export type PlaySoundConsequence = {
	type: "play-sound",
	volume: number,
	soundSrc: string,
	waitUntilFinished: boolean,
}

export type PermabuffConsequence = {
	type: "perma-buff",
	buffType: PermaBuffType,
	value: number,
}

export type AlterVariableConsequence = {
	type: "alter-variable",
}  & VariableOperators
& VariableTypeSpecifier;

type VariableOperators = {
	operator: Extract<VariableAction, "set" | "add" | "multiply">,
	value: ConsequenceAmount,
} | {
	operator: Extract<VariableAction, "set-range">,
	min: number,
	max: number,
};


export type VariableTypeSpecifier =
	{
		variableId: string,
		varType: VariableType
	}
	& VariableTypes;

type VariableTypes = ({
		varType: "global",
	} | {
		varType: "scene",
		sceneId: string,
	} | {
		varType: "actor",
		applyTo : ConsequenceTarget,
	} | {
		varType: "social-temp",
	});




type FatigueConsequence = {
	type: "alter-fatigue-lvl",
	amount:number,
};

type CombatEffectConsequence = {
	type: "combat-effect";
	combatEffect: CombatEffect
};

type AddTagConsequence = {
	type: "add-creature-tag",
	creatureTag: CreatureTag;
}

type SetFlagConsequence = {
	type: "set-flag",
	flagName : string,
	flagId : string,
	flagState : boolean,
} & DurationComponent;

type AddStatusConsequence = {
	type : "addStatus",
	statusName: StatusEffect["id"],
} & DurationComponent;

type DurationComponent = {
	amount ?: number,
	durationApplyTo ?: ConsequenceTarget,
	statusDuration: StatusDurationType,
	saveType ?: SaveType,
}

type RemoveStatusConsequence = {
	type: "removeStatus",
	statusName: StatusEffect["id"],
};

type InspirationChangeConsequence = {
	type: "inspiration-cost",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
	amount: number,
}

type AddPowerConsequence = {
	type: "add-power-to-list" | "teach-power",
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
	lowerResist: boolean,
}

type AlterMPConsequence = {
	type: "alter-mp",
	subtype: AlterMPSubtype,
	amount: number,
}

type ExpendItemConsequence = {
	type : "expend-item",
	itemId: string,
	itemAcc ?: UniversalItemAccessor<Consumable | SkillCard>,
	sourceItem ?: UniversalItemAccessor<Consumable | SkillCard>,
}

type DamageConsequenceShared = {
	type : "damage-new",
	damageSubtype: DamageSubtype,
	amount ?: number; //only added later for effects
	calc ?: unknown, //this is a DamageCalc but typescript doesn't like it
	damageType: DamageType | "by-power",
	/** manually added as part of processing */
};

export type NonDeprecatedConsequences = Exclude<Consequence, DeprecatedConsequences>;

type DeprecatedConsequences =
	OldDamageConsequence
;



export type OldDamageConsequence = {
	type: "dmg-high" | "dmg-low" | "dmg-mult" | "absorb" | "dmg-allout-low" | "dmg-allout-high" | "revive" | "hp-loss" ;
	amount ?: number;
	damageType: DamageType | "by-power",
	calc ?: unknown, //this is a DamageCalc but typescript doesn't like it
}
export type DamageConsequence = DamageConsequenceShared & (
	SimpleDamageCons
	| ConstantDamageCons
	| DamageMultiplierCons
);

export type SimpleDamageCons = {
	damageSubtype: "high" | "low" | "allout-high" | "allout-low" | "odd-even",
}

type ConstantDamageCons = {
	damageSubtype: "constant" | "percentage";
	amount: number;
}


type DamageMultiplierCons = {
	damageSubtype: "multiplier" | "mult-stack";
	amount: number;
}


const _errorCheckDType : Expect<DamageConsequence["damageSubtype"], DamageSubtype> = true;

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
	{ type: "social-card-action", cardAction: SocialCardAction} & CardActionTypes[number];

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
		cardAction:	"add-card-events-to-list",
		cardId : string,
	}, {
		cardAction:	"replace-card-events",
		cardId : string,
		keepEventChain: boolean,
	}, {
		cardAction:	"set-temporary-variable",
		operator: Extract<VariableAction, "set" | "add" | "multiply">,
		variableId: string,
		value: number,
	}, {
		cardAction:	"set-temporary-variable",
		variableId: string,
		operator: Extract<VariableAction, "set-range">,
		min: number,
		max: number,
	}, {
		cardAction: "card-response",
		text: string,
	}, {
		cardAction: "append-card-tag",
		cardTag: CardTag,
	}, {
		cardAction: "remove-cameo",
	}
];

export const VARIABLE_ACTION_LIST =  [
	"set",
	"add",
	"multiply",
	"set-range",
] as const;

export type VariableAction = typeof VARIABLE_ACTION_LIST[number];

export const VARIABLE_ACTIONS = Object.fromEntries(
	VARIABLE_ACTION_LIST.map( x=> [x, `persona.effecttypes.variableActions.${x}`])
);


export type DungeonActionConsequence = {
	type: "dungeon-action",
	dungeonAction: DungeonAction,
} & (
	GenericDungeonAction
	| ClockDungeonActionCons
	| WeatherChangeDungeonEvent
	| AlterSceneClockProperties
);

type GenericDungeonAction = {
	amount: number,
	dungeonAction: "roll-tension-pool"
	| "modify-tension-pool"
	| "close-all-doors"
}

type ClockDungeonActionCons = {
	dungeonAction: "modify-clock" | "set-clock",
	clockId: string,
	amount: number,
}

type AlterSceneClockProperties = {
	dungeonAction: "rename-scene-clock",
	clockNewName: string,
	cyclicClock: boolean,
	hideOnZero: boolean,
	clockMax: number,
}

type WeatherChangeDungeonEvent = {
	dungeonAction: "change-scene-weather",
	sceneWeatherType: Scene["weather"],
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

type LegacyConsequenceAmount = number;

export type ConsequenceAmount = LegacyConsequenceAmount | ConsequenceAmountV2;

export type ConsequenceAmountV2 =
	{ type : ConsequenceAmountType}
& (
	VariableAmount
	| ConstantAmount
	| AmountOperation
	| RandomRangeAmount
);

export type AmountOperation = {
	type: "operation",
	amt1: ConsequenceAmountV2,
	amt2: ConsequenceAmountV2,
	operator: ArithmeticOperator,
}

type RandomRangeAmount = {
   type: "random-range",
   min: number,
   max: number
}

type ConstantAmount = {
	type: "constant",
	val: number
}

export type VariableAmount = {
	type: "variable-value",
	} & VariableTypeSpecifier
// & { varType : Exclude<VariableTypeSpecifier["varType"], "actor">;};

const CONSEQUENCE_AMOUNT_TYPES_LIST = [
	"constant",
	"random-range",
	"operation",
	"variable-value",
] as const;

		type ConsequenceAmountType = typeof CONSEQUENCE_AMOUNT_TYPES_LIST[number];

export const CONSEQUENCE_AMOUNT_TYPES = HTMLTools.createLocalizationObject(CONSEQUENCE_AMOUNT_TYPES_LIST, "persona.consequences.consequences-amount");


const ARITHMETIC_OPERATOR_LIST = [
	"add",
	"subtract",
	"divide",
	"multiply",
	"modulus",
] as const;

type ArithmeticOperator = typeof ARITHMETIC_OPERATOR_LIST[number];

export const ARITHMETIC_OPERATORS = HTMLTools.createLocalizationObject(ARITHMETIC_OPERATOR_LIST, "persona.consequences.consequences-operators");

