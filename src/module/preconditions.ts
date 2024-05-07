import { PersonaActor } from "./actor/persona-actor.js";
import { SocialCard } from "./item/persona-item.js";
import { Job } from "./item/persona-item.js";
import { NPC } from "./actor/persona-actor.js";
import { SocialStat } from "../config/student-skills.js";
import { Trigger } from "../config/triggers.js";
import {Metaverse} from "./metaverse.js";
import { PreconditionType } from "../config/effect-types.js";
import { PowerType } from "../config/effect-types.js"
import { PowerContainer } from "./item/persona-item.js";
import { UniversalItemAccessor } from "./utility/db-accessor.js";
import { UniversalTokenAccessor } from "./utility/db-accessor.js";
import { UniversalActorAccessor } from "./utility/db-accessor.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaError } from "./persona-error.js";
import { Usable } from "./item/persona-item.js";
import { PToken } from "./combat/persona-combat.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";
import { DamageType } from "../config/damage-types.js";
import { PowerTag } from "../config/power-tags.js";
import { StatusEffectId } from "../config/status-effects.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { ConditionalEffect } from "./datamodel/power-dm.js";
import { Consequence } from "./combat/combat-result.js";

export function getActiveConsequences(condEffect: ConditionalEffect, situation: Situation, source: Option<PowerContainer>) : Consequence[] {
	if (condEffect.conditions.some(
		cond=>!testPrecondition(cond, situation, source)
	)) return [];
	return condEffect.consequences;
}

export function testPrecondition (condition: Precondition, situation:Situation, source: Option<PowerContainer>) : boolean {
	const nat = situation.naturalAttackRoll;
	const user = PersonaDB.findActor(situation.user);
	switch (condition.type) {
		case "always":
			return true;
		case "miss-all-targets":
			return false; //placeholder
		case "save-versus":
			if (!situation.saveVersus) return false;
			return situation.saveVersus == condition.status;
		case "on-trigger":
			if (!situation.trigger) return false;
			return (condition.trigger == situation.trigger);
		case "numeric": {
			return numericComparison(condition, situation, source);
		}
		case "boolean": {
			return booleanComparison(condition, situation, source);
		}
		default:
			condition satisfies never;
			PersonaError.softFail(`Unexpected Condition: ${(condition as any)?.type}`);
			return false;
	}
}

function numericComparison(condition: Precondition, situation: Situation, source:Option<PowerContainer>) : boolean {
	if (condition.type != "numeric") throw new PersonaError("Not a numeric comparison");
	let target: number;
	switch (condition.comparisonTarget) {
		case "natural-roll":
			if (situation.naturalAttackRoll == undefined)
				return false;
			target = situation.naturalAttackRoll;
			break;
		case "activation-roll":
			if (!situation.activationRoll)
				return false;
			target = situation.naturalAttackRoll!;
			break;
		case "escalation":
			if (situation.escalationDie == undefined)
				return false;
			target = situation.escalationDie;
			break;
		case "total-roll":
			if (situation.rollTotal == undefined)
				return false;
			target = situation.rollTotal;
			break;
		case "talent-level": {
			if (!situation.user) return false
			const user = PersonaDB.findActor(situation.user);

			const id = source ? source.id! : "";
			const talent = user.system.talents.find( x=> x.talentId == id);
			if (!talent) return false;
			target = talent.talentLevel;
			break;
		}
		case "social-link-level": {
			if (!situation.user) return false;
			const actor = PersonaDB.findActor(situation.user);
			if (!actor  || actor.system.type =="shadow") return false;
			const benefits = actor.socialLinks.flatMap(
				link => link.linkBenefits.socialBenefits
			);
			const benefit = benefits.find(x=> x.focus == source);
			if (!benefit) return false;
			target = benefit.lvl_requirement;
		}
		case "student-skill":
			if (!situation.user) return false;
			const actor = PersonaDB.findActor(situation.user);
			if (actor.system.type != "pc") return false;
			target = actor.system.skills[condition.studentSkill!];
			break;
		default:
			condition.comparisonTarget satisfies undefined;
			PersonaError.softFail(`Unknwon numeric comparison type ${condition.comparisonTarget}`)
			return false;
	}
	const testCase = condition.num;
	switch (condition.comparator) {
		case "!=" : return target != testCase;
		case "==" : return target == testCase;
		case ">=": return target >= (testCase ?? Infinity);
		case ">": return target > (testCase ?? Infinity) ;
		case "<": return target < (testCase ?? -Infinity);
		case "<=": return target <= (testCase ?? -Infinity);
		case "odd": return target %2 != 0;
		case "even": return target %2 == 0;
		default:
				condition.comparator satisfies undefined;
	}
	return false;
}


function getToken(condition: TargettedBComparionPC, situation: Situation) {
	let condTarget ="conditionTarget" in condition ?  condition.conditionTarget : "target";
	switch (condTarget) {
		case "owner":
			if (!situation.userToken) return undefined;
			return situation.userToken;
		case  "target":
			if (!situation.target) return undefined;
			return situation.target;
		case "attacker":
			if (!situation.attacker) return undefined;
			return situation.attacker;
	}

}

function booleanComparison(condition: Precondition, situation: Situation, _source:Option<PowerContainer>): boolean {
	if (condition.type != "boolean") throw new PersonaError("Not a boolean comparison");

	let targetState = condition.booleanState;

	switch(condition.boolComparisonTarget) {
		case "engaged": {
			const target = getToken(condition, situation);
			if (!situation.activeCombat || !target ) {
				return targetState == false;
			}
			const combat = PersonaCombat.ensureCombatExists();
			return combat.isEngaged(target);
		}
		case "engaged-with": {
			const target = getToken(condition, situation);
			if (!situation.activeCombat || !target ) {
				return targetState == false;
			}
			const combat = PersonaCombat.ensureCombatExists();
			if (!situation.target || !situation.userToken) {
				return targetState == false;
			}
			return combat.isEngagedWith(situation.userToken, target);
		}
		case "metaverse-enhanced":
			return Metaverse.isEnhanced() == targetState;
		case "is-shadow": {
			const target = getSubject(condition, situation);
			if (!target) return targetState == false;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return (targetActor.system.type == "shadow") == targetState;
		}
		case "is-pc": {
			const target = getSubject(condition, situation);
			if (!target) return targetState == false;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return (targetActor.system.type == "pc") == targetState;
		}
		case "has-tag": {
			if (!situation.usedPower) {
				return targetState == false;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			return power.system.tags.includes(condition.powerTag!) == targetState;
		}
		case "power-type-is": {
			if (!situation.usedPower) {
				return targetState == false;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			return targetState == (power.system.type == "power" && power.system.subtype == condition.powerType);
		}
		case "in-combat": {
			return targetState  == (situation.activeCombat != undefined);
		}
		case "is-critical": {
			return targetState == (situation.criticalHit ?? false);
		}
		case "is-hit": {
			return targetState == (situation.hit === true);
		}
		case "damage-type-is": {
			if (!situation.usedPower) {
				return targetState == false;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			return targetState == (condition.powerDamageType == power.system.dmg_type);
		}
		case "has-status" : {
			if(!situation.target) {
				return targetState == false;
			}
			const target = getSubject(condition, situation);
			if (!target) return targetState == false;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return targetState == targetActor.statuses.has(condition.status);
		}
		case  "struck-weakness": {
			if (!situation.target) {
				return targetState == false;
			}
			if (!situation.usedPower) {
				return targetState == false;
			}
			const target = getSubject(condition, situation);
			if (!target) return targetState == false;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			const power = PersonaDB.findItem(situation.usedPower);
			const resist = targetActor.elementalResist(power.system.dmg_type);
			return targetState == (resist == "weakness");
		}
		case "is-resistant-to": {
			const target = getSubject(condition, situation);
			if (!target) return targetState == false;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			const resist =targetActor.elementalResist(condition.powerDamageType);
			switch (resist) {
				case "resist": case "block": case "absorb": case "reflect": return targetState == true;
				case "weakness": case "normal": return targetState == false;
				default:
					resist satisfies never;
					return false;
			}
		}
		case "flag-state": {
			let actor = PersonaDB.findActor(situation.user);
				return targetState == (actor.getFlagState(condition.flagId) == condition.booleanState);
		}
		case "is-same-arcana": {
			const actor = PersonaDB.findActor(situation.user);
			if(!situation.target) {
				return targetState == false;
			}
			const target = getSubject(condition, situation);
			if (!target) return targetState == false;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return targetState == (actor.system.tarot == targetActor.system.tarot);
		}
		case "is-dead": {
			const target = getSubject(condition, situation);
			if (!target) return targetState == false;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return targetState == targetActor.hp <= 0;
		}
		case "is-consumable": {
			if (!situation.usedPower) {
				return targetState == false;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			return targetState == (power.system.type == "consumable");
		}
		default :
			condition satisfies never;
			return false;
	}
}

function getSubject( cond: Precondition & {conditionTarget: ConditionTarget}, situation: Situation, )  {
	if (!("conditionTarget" in cond)) throw new PersonaError("No conditon target");
	const condTarget = cond.conditionTarget;
	switch (condTarget) {
		case "owner":
			if (situation.userToken)
				return PersonaDB.findToken(situation.userToken);
			else return PersonaDB.findActor(situation.user);
		case "attacker":
			if (situation.attacker)
				return PersonaDB.findToken(situation.attacker);
			else return undefined;
		case "target":
			if (situation.target)
				return PersonaDB.findToken(situation.target);
			else return undefined;
		default:
			condTarget satisfies undefined;
			if (situation.target)
				return PersonaDB.findToken(situation.target);
			else return PersonaDB.findActor(situation.user);
	}
}


export type Precondition = GenericPC | NumericComparisonPC | BooleanComparisonPC | SaveVersus | Triggered;

type GenericPC = {
	type: Exclude<PreconditionType, "numeric" | "boolean" | 'save-versus' | "on-trigger">;
	status ?: StatusEffectId,
	powerTag ?: PowerTag,
	powerType ?: PowerType,
	powerDamageType ?: DamageType,
	num ?: number,
	flagId ?: string
	booleanState ?: boolean,
}

type SaveVersus = {
	type : "save-versus",
	status ?: StatusEffectId,
};

type Triggered = {
	type: "on-trigger",
	trigger ?: Trigger,
}

type NumericComparisonPC = {
	type: "numeric",
	comparator : Comparator;
	comparisonTarget : NumericComparisonTarget,
	studentSkill ?: SocialStat;
	num ?: number,
}

type BooleanComparisonPC = {
	type : "boolean",
	booleanState : boolean,
} & (StatusComparisonPC | TagComparisonPC |  BasicBComparisonPC | DamageTypeComparisonPC | PowerTypeComparisonPC | FlagComparisonPC | TargettedBComparionPC | ResistanceCheck);

	type BasicBComparisonPC ={
	boolComparisonTarget: Exclude<BooleanComparisonTarget,
	"has-status" | "has-tag" | "damage-type-is" | "power-type-is" | "flag-state" | "is-resistant-to" | TargettedBComparionPC["boolComparisonTarget"]>,
	// powerTag ?: PowerTag,
	// powerType ?: PowerType,
	// powerDamageType ?: DamageType,
	// flagId ?: string
}

type TargettedBComparionPC = {
	boolComparisonTarget: "engaged" | "engaged-with" | "is-dead" | "struck-weakness" | "is-shadow" | "is-pc" | "is-same-arcana";
	conditionTarget : ConditionTarget,

}

type StatusComparisonPC = {
	boolComparisonTarget: "has-status",
	status : StatusEffectId,
	conditionTarget : ConditionTarget,
}

type TagComparisonPC = {
	boolComparisonTarget: "has-tag",
	powerTag : PowerTag,

}

type DamageTypeComparisonPC= {
	boolComparisonTarget: "damage-type-is" ,
	powerDamageType : DamageType,
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


const BOOLEAN_COMPARISON_TARGET_LIST = [
	"engaged",
	"engaged-with",
	"metaverse-enhanced",
	"is-shadow",
	"is-pc",
	"has-tag",
	"in-combat",
	"is-critical",
	"is-hit",
	"is-dead",
	"damage-type-is",
	"power-type-is",
	"has-status",
	"struck-weakness",
	"is-resistant-to",
	"is-same-arcana",
	"flag-state",
	"is-consumable",
] as const;

export type BooleanComparisonTarget = typeof BOOLEAN_COMPARISON_TARGET_LIST[number];

export const BOOLEAN_COMPARISON_TARGET = Object.fromEntries(
	BOOLEAN_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
);

const NUMERIC_COMPARISON_TARGET_LIST = [
	"natural-roll",
	"activation-roll",
	"escalation",
	"total-roll",
	"talent-level",
	"social-link-level",
	"student-skill",
] as const;

export type NumericComparisonTarget = typeof NUMERIC_COMPARISON_TARGET_LIST[number];

export const NUMERIC_COMPARISON_TARGET = Object.fromEntries(
	NUMERIC_COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
);



const COMPARATORS_LIST = [
	"==",
	"!=",
	">=",
	">",
	"<",
	"<=",
	"odd",
	"even",
] as const;

type Comparator = typeof COMPARATORS_LIST[number];

export const COMPARATORS = Object.fromEntries ( 
	COMPARATORS_LIST.map( x=> [x, x])
);

const CONDITION_TARGETS_LIST = [
	"target",
	"owner",
	"attacker",
] as const;

type ConditionTarget= typeof CONDITION_TARGETS_LIST[number];

export const CONDITION_TARGETS = Object.fromEntries( 
	CONDITION_TARGETS_LIST.map( x=> [x, `persona.preconditions.targets.${x}`])
);

const CONDITION_DICE_LIST= [
	"escalation",
	"activation",
	"save",
	"skill",
	"attack-roll"
] as const;

export type ConditionDice = typeof CONDITION_TARGETS_LIST[number];

export const CONDITION_DICE = Object.fromEntries(
	CONDITION_DICE_LIST.map( x=> [x, `persona.preconditions.dice.${x}`])
);

export type Situation = {
	//more things can be added here all should be optional
	user: UniversalActorAccessor<PC | Shadow>;
	usedPower ?: UniversalItemAccessor<Usable>;
	usedSkill ?: SocialStat;
	activeCombat ?: boolean ;
	naturalAttackRoll ?: number;
	rollTotal ?: number;
	criticalHit ?: boolean;
	hit?: boolean;
	resisted ?: boolean;
	struckWeakness ?: boolean;
	isAbsorbed ?: boolean;
	escalationDie ?: number;
	activationRoll ?: boolean;
	target ?: UniversalTokenAccessor<PToken>;
	attacker ?:UniversalTokenAccessor<PToken>;
	userToken ?: UniversalTokenAccessor<PToken>;
	saveVersus ?: StatusEffectId;
	trigger ?: Trigger,
	socialTarget ?: UniversalActorAccessor<PC | NPC>,
	eventCard ?: UniversalItemAccessor<Job | SocialCard>,
	isSocial?: boolean,
	socialId?: string,
}



