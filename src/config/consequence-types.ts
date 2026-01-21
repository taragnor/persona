import { HTMLTools } from "../module/utility/HTMLTools.js";
import { PersonaItem } from "../module/item/persona-item.js";
import { PermaBuffType } from "./perma-buff-type.js";
import { EVENT_CHAIN_ACTIONS, INVENTORY_ACTION, SocialCardAction } from "./effect-types.js";
import { CardTag } from "./card-tags.js";
import { VariableType } from "../module/persona-variables.js";
import { CombatEffect } from "./effect-types.js";
import { ConsequenceType } from "./effect-types.js";
import { InternalCreatureTag } from "./creature-tags.js";
import { SaveType } from "./save-types.js";
import { StatusDurationType } from "./status-effects.js";
import { ConditionTarget, MultiCheckOrSingle, SocialLinkIdOrTarot } from "./precondition-types.js";
import { AlterMPSubtype } from "./effect-types.js";
import { ConsequenceTarget } from "./precondition-types.js";
import { DamageSubtype } from "./effect-types.js";
import { DamageType } from "./damage-types.js";
import { DungeonAction } from "./effect-types.js";
import { SlotType } from "./slot-types.js";
import { CONDITION_TARGETS_LIST } from "./precondition-types.js";

import { StudentSkill } from "./student-skills.js";
import { ResistType } from "./damage-types.js";
import { ResistStrength } from "./damage-types.js";
import { OtherConsequence } from "../module/datamodel/other-effects.js";
import { StatusDuration } from "../module/active-effect.js";
import { StatusEffectId } from "./status-effects.js";
import { ItemProperty, ModifierCategory, ModifierTarget } from "./item-modifiers.js";
import {AttackResult} from "../module/combat/combat-result.js";

type ExpendOtherEffect = {
	type: "expend-item";
	itemAcc: UniversalItemAccessor<Consumable | SkillCard>;
}

type SimpleOtherEffect = DeprecatedSimpleEffect;

export type SetFlagEffect = {
	type: "set-flag",
	flagId: string,
	state: boolean,
} & ( EnableFlagEffect | ClearFlagEffect);

type EnableFlagEffect = {
	state: true,
	flagName: string,
	duration: StatusDuration,
	embeddedEffects: readonly SourcedConditionalEffect[],
	clearOnDeath: boolean,
};

type ClearFlagEffect = {
	state: false,
};

export type ResistanceShiftEffect = {
	type: "raise-resistance" | "lower-resistance",
	element: MultiCheckOrSingle<keyof PC["system"]["combat"]["resists"]>,
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
	downgrade: boolean,
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

export type AlterTheurgyEffect = {
	type: "alter-theurgy",
	subtype: AlterMPSubtype,
	amount: number,
}

export type ExtraTurnEffect = {
	type: "extraTurn",
	activation: number,
};

type RecoveryEffect = {
	type: "apply-recovery",
}

export type OtherEffect =  AlterEnergyEffect | ExpendOtherEffect | SimpleOtherEffect | SetFlagEffect | ResistanceShiftEffect | InspirationChange | DisplayMessage | HPLossEffect | ExtraAttackEffect | ExecPowerEffect | ScanEffect | SocialCardActionConsequence | DungeonActionConsequence | AlterMPEffect | AlterTheurgyEffect | ExtraTurnEffect | AddPowerConsequence | CombatEffectConsequence | FatigueConsequence | AlterVariableOtherEffect | PermabuffConsequence	| PlaySoundConsequence | GainLevelConsequence | CancelRequestConsequence | SetHPOtherEffect | InventoryActionConsequence | RecoveryEffect | setRollResultConsequence;
;

type SetHPOtherEffect = {
	type: "set-hp",
	subtype: "set-to-percent",
	value: number,
} | {
	type: "set-hp",
	subtype: "set-to-const",
	value: number,
};

type AlterVariableOtherEffect = AlterVariableConsequence & {situation: Partial<Situation>} & SourcedConsequence<NonDeprecatedConsequence>;

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

export type EnhancedSourcedConsequence<C extends Consequence = Consequence> = SourcedConsequence<C> & {
	// modifiers?: ConsModifiers[];
}

type ConsModifiers = "blocked" | "absorbed" | "resisted";

export type Consequence =
	{
		actorOwner ?: UniversalActorAccessor<ValidAttackers>,
	} & (
		GenericConsequence | NonGenericConsequences
	);

type GenericConsequence = {
	type: Exclude<ConsequenceType, NonGenericConsequences["type"]>,
	itemAcc ?: UniversalItemAccessor<Usable>,
	slotType ?: SlotType,
	id ?: string,
	otherEffect ?: OtherConsequence,
	resistType ?: ResistType,
	resistanceLevel ?: ResistStrength,
	msg ?: string,
}

type NumberedConsequencePart = {
	amount: number;
}

type NonGenericConsequences = UsePowerConsequence
	| SocialCardActionConsequence
	| DungeonActionConsequence
	| ModifierConsequence
	| OldDamageConsequence
	| OldModifier
	| DisplayMessageConsequence
	| ExpendItemConsequence
	| AlterMPConsequence
	| ElementalResistanceAlterConsequence
	| StatusResistanceAlterConsequence
	| OtherEffectConsequence
	| AddPowerConsequence
	| AddTalentConsequence
	| InspirationChangeConsequence
	| SetFlagConsequence
	| AddTagConsequence
	| CombatEffectConsequence
	| FatigueConsequence
	| AlterVariableConsequence
	| PermabuffConsequence
	| PlaySoundConsequence
	| GainLevelConsequence
	| CancelRequestConsequence
	| setRollResultConsequence
	| InventoryActionConsequence
;

type InventoryActionConsequence = {
	type: "inventory-action",
} & InventoryActions;

type InventoryActions = {
	invAction : Extract<keyof typeof INVENTORY_ACTION, "add-item">;
	itemId: PersonaItem["id"];
	amount: ConsequenceAmount,
} | {
	invAction : Extract<keyof typeof INVENTORY_ACTION, "add-treasure">;
	treasureLevel: ConsequenceAmount,
	treasureModifier: number,
	minLevel: number,
	amount: ConsequenceAmount,
} | {
	invAction : Extract<keyof typeof INVENTORY_ACTION, "remove-item">;
	itemId: PersonaItem["id"];
	amount: ConsequenceAmount,
}



type CancelRequestConsequence = {
	type: "cancel";
}

type setRollResultConsequence = {
	type: "set-roll-result";
	result: AttackResult["result"];
}

type ExtraActionConsequence = {
	type: "extraTurn"
};

type BasicNumberedConsequence = {
	type: "alter-energy",
} & NumberedConsequencePart;


type ExtraAttackConsequence = {
	type: "extraAttack";
	iterativePenalty: number;
} & NumberedConsequencePart;

type GainLevelConsequence = {
	type: "gain-levels",
	value: number,
	gainTarget: LevelGainTarget,
}

type ScanConsequence = {
	type: "scan",
	amount: number,
	downgrade: boolean,
}

const LEVEL_GAIN_TARGETS_LIST = [
	"persona",
	"actor",
	"both"
] as const;

type LevelGainTarget = typeof LEVEL_GAIN_TARGETS_LIST[number];

export const LEVEL_GAIN_TARGETS = HTMLTools.createLocalizationObject(LEVEL_GAIN_TARGETS_LIST, "persona.effecttypes.targets.levelgain");


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

export type NonDeprecatedDamageCons = NonDeprecatedConsequence & {type: "combat-effect", combatEffect: "damage"};



type FatigueConsequence = {
	type: "alter-fatigue-lvl",
	amount:number,
};

type CombatEffectConsequence = {
	type: "combat-effect";
	applyTo : ConsequenceTarget,
	combatEffect: CombatEffect,
} & CombatEffectConsequencesList;

type CombatEffectConsequencesList =
	NewDamageConsequence
	| ({
		combatEffect : "addStatus",
		statusName: StatusEffect["id"],
	} & DurationComponent)
	| {
		combatEffect: "removeStatus",
		statusName: MultiCheckOrSingle<StatusEffect["id"]>,
	} | {
		combatEffect: "extraTurn",
	} | {
		combatEffect: "scan",
		amount: number,
		downgrade: boolean,
	} | {
		combatEffect: "auto-end-turn",
	} | ( {
		combatEffect : "extraAttack",
		iterativePenalty: number,
	} & NumberedConsequencePart)
	| {
		combatEffect: "alter-energy",
		amount: number,
	} | {
		combatEffect: "apply-recovery",
	} | {
		combatEffect: "alter-theurgy",
		applyTo : ConsequenceTarget,
		subtype: AlterMPSubtype,
		amount: number,
	}
;


export type NewDamageConsequence =
	{
		type: "combat-effect",
		combatEffect: "damage"
		applyTo: ConditionTarget,
	}
	& DamageConsequenceShared
	& DamageConsequenceSubtypes;


type AddTagConsequence = {
	type: "add-creature-tag",
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	creatureTag: InternalCreatureTag | Tag["id"];
}

type SetFlagConsequence = {
	type: "set-flag"
	flagId : string,
	flagState : boolean,
} & (
	{flagState: false}
	| {
		flagState : true,
		flagName : string,
		applyEmbedded: boolean,
		clearOnDeath: boolean,
	}
) & DurationComponent;

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
	type: "add-power-to-list",
	id: string, // id of power
} | {
	type:  "teach-power"
	id: string, // id of power
	randomPower: false,
} | {
	type:  "teach-power"
	randomPower: true,
};

type AddTalentConsequence = {
	type: "add-talent-to-list",
	id: string, //id of talent
}

type OtherEffectConsequence = {
	type: "other-effect",
	otherEffect : OtherConsequence,
}

type ElementalResistanceAlterConsequence = {
	type: "raise-resistance" | "lower-resistance";
	resistType : MultiCheckOrSingle<ResistType>,
	resistanceLevel : ResistStrength,
}

type StatusResistanceAlterConsequence = {
	type: "raise-status-resistance",
	statusName: MultiCheckOrSingle<StatusEffectId>,
	resistanceLevel: ResistStrength,
	lowerResist: boolean,
}

type AlterMPConsequence = {
	type: "alter-mp",
	applyTo : ConsequenceTarget,
	subtype: AlterMPSubtype,
	amount: number,
}


type ExpendItemConsequence = {
	type : "expend-item",
}

type DamageConsequenceSubtypes = SimpleDamageCons
	| ConstantDamageCons
	| DamageMultiplierCons

type DamageConsequenceShared = {
	damageSubtype: DamageSubtype,
	amount ?: ConsequenceAmount; //only added later for effects
	calc ?: unknown, //this is a DamageCalc but typescript doesn't like it
	damageType: DamageType,
	/** manually added as part of processing */
};

export type NonDeprecatedConsequence = Consequence & { type: Exclude<Consequence["type"], DeprecatedConsequence["type"]>}
	& {applyTo: U<ConditionTarget>};
//modifier doiesn't have an applyTo but we need to fix this later

type DeprecatedSimpleEffect = {
	type: "save-slot" | "half-hp-cost";
}


 type AddEscalationConsequence = {
	 type: "add-escalation"
 };

type OldDeprecatedStyle =
	{ applyToSelf : boolean} |
	{applyTo : U<ConsequenceTarget>}
;

export type DeprecatedConsequence =
	OldDeprecatedStyle & (
		OldDamageConsequence
		| DeprecatedSimpleEffect
		| AddEscalationConsequence
		| SlotRecoveryConsequence
		| EscalationManipulation
		| DamageConsequence
		| AddStatusConsequence
		| RemoveStatusConsequence
		| ExtraAttackConsequence
		| ExtraActionConsequence
		| ScanConsequence
		| BasicNumberedConsequence
	)
;

type EscalationManipulation = {
	type: "escalationManipulation";
}

type SlotRecoveryConsequence = {
	type: "recover-slot";
	amount?: number;
	slot?: number;
};


export type OldDamageConsequence = {
	type: "dmg-high" | "dmg-low" | "dmg-mult" | "absorb" | "dmg-allout-low" | "dmg-allout-high" | "revive" | "hp-loss" ;
	amount ?: number;
	damageType: DamageType,
	calc ?: unknown, //this is a DamageCalc but typescript doesn't like it
} & OldDeprecatedStyle;

export type DamageConsequence =
	{	type : "damage-new" }
	& DamageConsequenceShared
	& DamageConsequenceSubtypes
	& OldDeprecatedStyle
;

export type SimpleDamageCons = {
	damageSubtype: Extract<DamageSubtype, "high" | "low" | "allout"| "odd-even">,
}

type ConstantDamageCons = {
	damageSubtype: Extract<DamageSubtype, "constant" | "percentage" | "percentage-current" | "set-to-const" | "set-to-percent">;
	amount: ConsequenceAmount;
}


type DamageMultiplierCons = {
	damageSubtype: Extract<DamageSubtype, "multiplier" | "mult-stack">;
	amount: ConsequenceAmount;
}


// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _errorCheckDType : Expect<DamageConsequence["damageSubtype"], DamageSubtype> = true;

type ModifierConsequence = {
	type: "modifier-new",
	modifiedFields : Record<ModifierTarget,boolean>,
	modifierCategory: ModifierCategory,
	amount: ConsequenceAmount,
};

type OldModifier = {
	type: "modifier",
	modifierCategory: ModifierCategory,
	modifiedField : ModifierTarget,
	amount: ConsequenceAmount,
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
		cardAction: "inc-events" | "gain-money" | "modify-progress-tokens-cameo" ,
		amount: number,
	},{
		cardAction: "modify-progress-tokens",
		//older versions may not have this value filled out
		socialLinkIdOrTarot ?: SocialLinkIdOrTarot,
		amount : number,
	}, {
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
	}, {
		cardAction: "set-social-card-item",
		item: ItemSelector,
	},
	EventChainModification,
];

type EventChainModification = {
	cardAction: "event-chain",
	chainAction: keyof typeof EVENT_CHAIN_ACTIONS,
} & (
	{
		chainAction: "start-chain",
		chainId: string,
	} | {
		chainAction: "clear-chain",
	} | {
		chainAction: "modify-chain-count",
		delta: number,
	}
);

const ITEM_SELECTOR_TYPE_LIST = [
	"specific",
	"randomTreasure",
] as const;

type ItemSelectorType = typeof ITEM_SELECTOR_TYPE_LIST[number];

export const ITEM_SELECTOR_TYPE = HTMLTools.createLocalizationObject(ITEM_SELECTOR_TYPE_LIST, "persona.consequences.item-selector");

export type ItemSelector = {
	selectType: Extract<ItemSelectorType, "specific">,
	itemId: PersonaItem["id"],
} | {
	selectType: Extract<ItemSelectorType, "randomTreasure">,
	treasureLevel: number,
	rollModifier: number,
}

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
	| "disable-region"
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
	| ItemPropertyAmount
	| SituationPropertyAmount
	| ActorProperty
);

export type SituationPropertyAmount = {
	type : "situation-property",
	property: SituationProperty,
}

export type ItemPropertyAmount = {
	type : "item-property",
	itemTarget: "source",
	property: ItemProperty,

}

export type ActorProperty =
	{
	type : "actor-property",
	target:  ConditionTarget,
	property: ConsAmountActorProperty,
	} & (
	GenericActorProperty | SpecificActorProperty
	);

type GenericActorProperty = {
	property: Exclude<ConsAmountActorProperty, SpecificActorProperty["property"]>
}

type SpecificActorProperty = {
	property : "linkLevelWith",
	socialLinkIdOrTarot : SocialLinkIdOrTarot,
};


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
};

type ConstantAmount = {
	type: "constant",
	val: number
};

export type VariableAmount = {
	type: "variable-value",
	} & VariableTypeSpecifier;

const CONSEQUENCE_AMOUNT_TYPES_LIST = [
	"constant",
	"random-range",
	"operation",
	"variable-value",
	"item-property",
	"situation-property",
	"actor-property",
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

const CONSEQUENCE_AMOUNT_ACTOR_PROPERTIES_LIST = [
	"mhp",
	"hp",
	"baseClassHP",
	"level",
	"theurgyVal",
	"linkLevelWith",
	"batonPassLevel",
] as const;

type ConsAmountActorProperty = typeof CONSEQUENCE_AMOUNT_ACTOR_PROPERTIES_LIST[number];

 export const CONSEQUENCE_AMOUNT_ACTOR_PROPERTIES = HTMLTools.createLocalizationObject(CONSEQUENCE_AMOUNT_ACTOR_PROPERTIES_LIST, "persona.consequenceAmount.actorProperties");


const CONSEQUENCE_AMOUNT_SITUATION_PROPERTIES_LIST = [
	"damage-dealt",
] as const;

type SituationProperty = typeof CONSEQUENCE_AMOUNT_SITUATION_PROPERTIES_LIST[number];

 export const SITUATION_PROPERTIES = HTMLTools.createLocalizationObject( CONSEQUENCE_AMOUNT_SITUATION_PROPERTIES_LIST, "persona.consequenceAmount.actorProperties");


