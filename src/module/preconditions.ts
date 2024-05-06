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
		case "natural+":
			return nat != undefined && nat >= condition.num! ;
		case "natural-":
			return nat != undefined && nat <= condition.num! ;
		case "natural-odd":
			return nat != undefined && nat % 2 == 1;
		case "natural-even":
			return nat != undefined && nat % 2 == 0;
		case "critical":
			return situation.criticalHit ?? false;
		case "miss":
				return situation.hit === false;
		case "hit":
				return situation.hit === true;
		case "miss-all-targets":
			return false; //placeholder
		case "escalation+":
			return situation.escalationDie != undefined && situation.escalationDie >= condition.num!;
		case "escalation-":
			return situation.escalationDie != undefined && situation.escalationDie <= condition.num!;
		case "escalation-odd":
			return situation.escalationDie != undefined && situation.escalationDie % 2 == 1 && !!situation.activeCombat;
		case "escalation-even":
			return situation.escalationDie != undefined && situation.escalationDie % 2 == 0 && situation.escalationDie >0 && !!situation.activeCombat;
		case "activation+":
			return !!situation.activationRoll && nat! >= condition.num!;
		case "activation-":
			return !!situation.activationRoll && nat! <= condition.num!;
		case "activation-odd":
			return !!situation.activationRoll && nat! % 2 == 1;
		case "activation-even":
			return !!situation.activationRoll && nat! % 2 == 0; case "in-battle":
			return situation.activeCombat != undefined;
		case "non-combat":
			return situation.activeCombat == undefined;
		case "talent-level+":
			if (!situation.user) return false
			const id = source ? source.id! : "";
			return !user.system.talents.some( x=> x.talentId == id && x.talentLevel < (condition.num ?? 0))
		case "power-damage-type-is": {
			if (!situation.usedPower) return false;
			const power = PersonaDB.findItem(situation.usedPower);
			return condition.powerDamageType == power.system.dmg_type;
		}
		case "has-tag": {
			if (!situation.usedPower) return false;
			const power = PersonaDB.findItem(situation.usedPower);
			return power.system.tags.includes(condition.powerTag!);
		}
		case "not-tag": {
			if (!situation.usedPower) return false;
			const power = PersonaDB.findItem(situation.usedPower);
			return !power.system.tags.includes(condition.powerTag!);
		}
		case "user-has-status":
			return (user.statuses.has(condition.status!));
		case "user-not-status":
			return (!user.statuses.has(condition.status!));
		case "target-has-status": {
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			return (target.actor.statuses.has(condition.status!));
		}
		case "target-not-status": {
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			return (!target.actor.statuses.has(condition.status!));
		}
		case "user-is-pc":
			return user.system.type == "pc";
		case "user-is-shadow":
			return user.system.type == "shadow";
		case "is-engaged": {
			if (!situation.activeCombat ) return false;
			const combat = PersonaCombat.ensureCombatExists();
			return combat.isEngaged(situation.userToken!);
		}
		case "is-engaged-with-target": {
			if (!situation.activeCombat ) return false;
			const combat = PersonaCombat.ensureCombatExists();
			if (!situation.target || !situation.userToken) return false;
			return combat.isEngagedWith(situation.userToken, situation.target);
		}
		case "is-not-engaged-with-target": {
			if (!situation.activeCombat ) return true;
			if (!situation.target || !situation.userToken) return true;
			const combat = PersonaCombat.ensureCombatExists();
			return !combat.isEngagedWith(situation.userToken, situation.target);
		}
		case "metaverse-enhanced":
			return Metaverse.isEnhanced();
		case "metaverse-normal":
			return !Metaverse.isEnhanced();
		case "power-type-is":
			if (!situation.usedPower) return false;
			const power = PersonaDB.findItem(situation.usedPower);
			return power.system.type == "power" && power.system.subtype == condition.powerType;
		case "is-resistant-to": {
			const resist =user.elementalResist(condition.powerDamageType!);
			switch (resist)  {
				case "resist": case "block": case "absorb": case "reflect": return true;
				case "weakness": case "normal": return false;
				default:
					resist satisfies never;
					return false;
			}
		}
		case "not-resistant-to": {
			const resist =user.elementalResist(condition.powerDamageType!);
			switch (resist)  {
				case "resist": case "block": case "absorb": case "reflect": return false;
				case "weakness": case "normal": return true;
				default:
					resist satisfies never;
					return true;
			}
		}
		case "target-is-resistant-to": {
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			const resist =target.actor.elementalResist(condition.powerDamageType!);
			switch (resist) {
				case "resist": case "block": case "absorb": case "reflect": return true;
				case "weakness": case "normal": return false;
				default:
					resist satisfies never;
					return false;
			}
		}
		case "target-is-not-resistant-to": {
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			const resist =target.actor.elementalResist(condition.powerDamageType!);
			switch (resist) {
				case "resist": case "block": case "absorb": case "reflect": return false;
				case "weakness": case "normal": return true;
				default:
					resist satisfies never;
					return true;
			}
		}
		case "struck-weakness":{
			if (!situation.target) return false;
			if (!situation.usedPower) return false;
			const target = PersonaDB.findToken(situation.target);
			const power = PersonaDB.findItem(situation.usedPower);
			const resist = target.actor.elementalResist(power.system.dmg_type);
			return (resist == "weakness");
		}
		case "requires-social-link-level":
			if (!situation.user) return false;
			const actor = PersonaDB.findActor(situation.user);
			if (!actor  || actor.system.type =="shadow") return false;
			return actor.socialLinks.some(
				link => {
					const benefit= link.linkBenefits.socialBenefits
						.find( x=> x.focus == source);
					if (!benefit) return false;
					return link.linkLevel >= benefit.lvl_requirement;
				});
		case "save-versus":
			if (!situation.saveVersus) return false;
			return situation.saveVersus == condition.status;
		case "target-is-dead":
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			return target.actor.hp <= 0;
		case "on-trigger":
			if (!situation.trigger) return false;
			return (condition.trigger == situation.trigger);
		case "is-a-consumable":  {
			if (!situation.usedPower) return false;
			const power = PersonaDB.findItem(situation.usedPower);
			return power.system.type == "consumable";
		}
		case "target-is-same-arcana": {
			const actor = PersonaDB.findActor(situation.user);
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			return actor.system.tarot == target.actor.system.tarot;
		}
		case "flag-state": {
			let subject = getSubject(situation, condition);
			if (!subject) return false;
			if (subject instanceof Token)  {
				subject  = subject.actor;
			}
			if (condition.flagId) {
				return subject.getFlagState(condition.flagId) == condition.booleanState;
			}
			else return false;
		}
		case "numeric": {
			return numericComparison(condition, situation, source);
		}
		default:
			condition.type satisfies never;
			PersonaError.softFail(`Unexpected Condition: ${condition.type}`);
			return false;
	}
}

function numericComparison(condition: Precondition, situation: Situation, source:Option<PowerContainer>) : boolean {
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

function getSubject(situation: Situation, cond: Precondition)  {
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

export type Precondition = {
	type : PreconditionType,
	num ?: number,
	powerType ?: PowerType,
	powerDamageType ?: DamageType,
	powerTag ?: PowerTag,
	status ?: StatusEffectId,
	trigger ?: Trigger,
	conditionTarget ?: ConditionTarget,
	comparisonTarget ?: ComparisonTarget,
	flagId ?: string
	comparator ?: Comparator;
	booleanState ?: boolean;
	studentSkill ?: SocialStat;
}

const COMPARISON_TARGET_LIST = [
	"natural-roll",
	"activation-roll",
	"escalation",
	"total-roll",
	"talent-level",
	"social-link-level",
	"student-skill",
] as const;

export type ComparisonTarget = typeof COMPARISON_TARGET_LIST[number];

export const COMPARISON_TARGET = Object.fromEntries( 
	COMPARISON_TARGET_LIST.map( x=> [x, `persona.preconditions.comparison.${x}`])
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
	"owner",
	"target",
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
	eventCard ?: UniversalItemAccessor<Job | SocialCard>
}



