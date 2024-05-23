import { BooleanComparisonPC } from "../config/precondition-types.js";
import { Triggered } from "../config/precondition-types.js";
import { PToken } from "./combat/persona-combat.js";
import { UniversalTokenAccessor } from "./utility/db-accessor.js";
import { TarotCard } from "../config/tarot.js";
import { ConditionTarget } from "../config/precondition-types.js";
import { TargettedBComparionPC } from "../config/precondition-types.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { SocialCard } from "./item/persona-item.js";
import { Job } from "./item/persona-item.js";
import { NPC } from "./actor/persona-actor.js";
import { SocialStat } from "../config/student-skills.js";
import { Trigger } from "../config/triggers.js";
import {Metaverse} from "./metaverse.js";
import { PowerContainer } from "./item/persona-item.js";
import { UniversalItemAccessor } from "./utility/db-accessor.js";
import { Precondition } from "../config/precondition-types.js";
import { UniversalActorAccessor } from "./utility/db-accessor.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaError } from "./persona-error.js";
import { Usable } from "./item/persona-item.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";
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
	// const nat = situation.naturalAttackRoll;
	// const user = PersonaDB.findActor(situation.user);
	switch (condition.type) {
		case "always":
			return true;
		case "miss-all-targets":
			return false; //placeholder
		case "save-versus":
			if (!situation.saveVersus) return false;
			return situation.saveVersus == condition.status;
		case "on-trigger":
			return triggerComparison(condition, situation, source);
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
			if (!talent) {
				console.log(`COuldn't find Talent ${id}`);
				console.log(source);
				return false;
			}
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
			break;
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


function getToken(condition: TargettedBComparionPC, situation: Situation) : UniversalTokenAccessor<PToken> | undefined{
	let condTarget ="conditionTarget" in condition ?  condition.conditionTarget : "target";
	switch (condTarget) {
		case "owner":
			if (situation.activeCombat) {
				const combat = PersonaCombat.ensureCombatExists();
				return combat.getToken(situation.user);
			}
			return situation.user.token;
		case  "target":
			if (situation.activeCombat) {
				const combat = PersonaCombat.ensureCombatExists();
				return combat.getToken(situation.target!);
			}
			if (!situation.target?.token) return undefined;
			return situation.target.token;
		case "attacker":
			if (situation.activeCombat) {
				const combat = PersonaCombat.ensureCombatExists();
				return combat.getToken(situation.attacker!);
			}
			if (!situation.attacker?.token) return undefined;
			return situation.attacker.token;
	}
}


function triggerComparison(condition: Triggered, situation: Situation, _source:Option<PowerContainer>) : boolean {
	if (!situation.trigger) return false;
	if (condition.trigger != situation.trigger) return false;
	switch (condition.trigger) {
		case "on-attain-tarot-perk":
			return condition.tarot == situation.tarot;
		case "on-inflict-status":
			return condition.status == situation.statusEffect;
		case "exit-metaverse":
		case "enter-metaverse":
		case "on-use-power":
		case "on-combat-end":
		case "on-combat-start":
		case "on-kill-target":
		case "on-damage":
			return true;
		default:
			condition.trigger satisfies never;
			return false;
	}
}

/** returns undefined in case of a state that just shouldn't be analzyed at all*/
function getBoolTestState(condition: BooleanComparisonPC, situation: Situation, source: Option<PowerContainer>): boolean | undefined {
	switch(condition.boolComparisonTarget) {
		case "engaged": {
			if (!situation.activeCombat){
				return undefined;
			}
			const subject = getSubject(condition, situation, source);
			if (!subject) {
				PersonaError.softFail(`Can't find Subject of ${source?.name} check for: ${condition.boolComparisonTarget}`);
				return undefined;

			}
			const combat = PersonaCombat.ensureCombatExists();
			const subjectToken = subject instanceof Token ? PersonaDB.getUniversalTokenAccessor(subject) : combat.getToken(subject.accessor);
			if (!subjectToken) {
				PersonaError.softFail(`Can't find token for ${subject?.name}`);
				return undefined;
			}
			return combat.isEngaged(subjectToken);
		}
		case "engaged-with": {
			if (!situation.activeCombat){
				return undefined;
			}
			const subject = getSubject(condition, situation, source);
			if (!subject) {
				PersonaError.softFail(`Can't find Subject of ${source?.name} check for: ${condition.boolComparisonTarget}`);
				return undefined;
			}

			const combat = PersonaCombat.ensureCombatExists();
			const subjectToken = subject instanceof Token ? PersonaDB.getUniversalTokenAccessor(subject) : combat.getToken(subject.accessor);
			if (!subjectToken) {
				PersonaError.softFail(`Can't find token for ${subject?.name}`);
				return undefined;
			}
			const attackerToken = combat.getToken(situation.attacker!);
			if (!attackerToken || !subjectToken) {
				PersonaError.softFail(`Can't find tokens for attacker`);
				return undefined;
			}
			return combat.isEngagedWith(attackerToken, subjectToken);
		}
		case "metaverse-enhanced":
			return Metaverse.isEnhanced();
		case "is-shadow": {
			const target = getSubject(condition, situation, source);
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return  targetActor.system.type == "shadow";
		}
		case "is-pc": {
			const target = getSubject(condition, situation, source);
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return targetActor.system.type == "pc";
		}
		case "has-tag": {
			if (!situation.usedPower) {
				return undefined;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			return power.system.tags.includes(condition.powerTag!);
		}
		case "power-type-is": {
			if (!situation.usedPower) {
				return undefined;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			return power.system.type == "power" && power.system.subtype == condition.powerType;
		}
		case "in-combat": {
			return !!situation.activeCombat;
		}
		case "is-critical": {
			return situation.criticalHit ?? false;
		}
		case "is-hit": {
			return situation.hit === true;
		}
		case "damage-type-is": {
			if (!situation.usedPower) {
				return undefined;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			return condition.powerDamageType == power.system.dmg_type;
		}
		case "has-status" : {
			const target = getSubject(condition, situation, source);
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return targetActor.statuses.has(condition.status);
		}
		case  "struck-weakness": {
			if (!situation.usedPower) {
				return false;
			}
			const target = getSubject(condition, situation, source);
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			const power = PersonaDB.findItem(situation.usedPower);
			const resist = targetActor.elementalResist(power.system.dmg_type);
			return resist == "weakness";
		}
		case "is-resistant-to": {
			const target = getSubject(condition, situation, source);
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			const resist = targetActor.elementalResist(condition.powerDamageType);
			switch (resist) {
				case "resist": case "block": case "absorb": case "reflect": return true;
				case "weakness": case "normal": return  false;
				default:
					resist satisfies never;
					return false;
			}
		}
		case "flag-state": {
			let actor = PersonaDB.findActor(situation.user);
			return actor.getFlagState(condition.flagId) == condition.booleanState;
		}
		case "is-same-arcana": {
			const actor = PersonaDB.findActor(situation.user);
			if(!situation.target) {
				return undefined;
			}
			const target = getSubject(condition, situation, source);
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return actor.system.tarot == targetActor.system.tarot;
		}
		case "is-dead": {
			const target = getSubject(condition, situation, source);
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return targetActor.hp <= 0;
		}
		case "is-consumable": {
			if (!situation.usedPower) {
				return undefined;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			return power.system.type == "consumable";
		}
		default :
			condition satisfies never;
			return undefined;
	}
}

function booleanComparison(condition: Precondition, situation: Situation, source:Option<PowerContainer>): boolean {
	if (condition.type != "boolean") throw new PersonaError("Not a boolean comparison");
	const testState = getBoolTestState(condition, situation, source);
	if (testState === undefined) return false;
	const targetState = condition.booleanState;
	return targetState == testState;
}

function getSubject( cond: Precondition & {conditionTarget: ConditionTarget}, situation: Situation, source: Option<PowerContainer>) : PToken | PC| Shadow | undefined {
	if (!("conditionTarget" in cond)) {
		PersonaError.softFail(`No conditon target in ${source?.name}`)
		return undefined;
	}
	const condTarget = cond.conditionTarget;
	switch (condTarget) {
		case "owner":
			if (situation.user.token)
				return PersonaDB.findToken(situation.user.token);
			else return PersonaDB.findActor(situation.user);
		case "attacker":
			if (situation.attacker?.token)
				return PersonaDB.findToken(situation.attacker.token);
			else return situation.attacker ? PersonaDB.findActor(situation.attacker): undefined;
		case "target":
			if (situation.target?.token)
				return PersonaDB.findToken(situation.target.token);
			else return situation.target ? PersonaDB.findActor(situation.target): undefined;
		default:
			condTarget satisfies undefined;
			if (situation.target?.token)
				return PersonaDB.findToken(situation.target.token);
			else return PersonaDB.findActor(situation.user);
	}
}

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
	target ?: UniversalActorAccessor<PC | Shadow>;
	attacker ?:UniversalActorAccessor<PC | Shadow>;
	// userToken ?: UniversalTokenAccessor<PToken>;
	saveVersus ?: StatusEffectId;
	statusEffect ?: StatusEffectId;
	trigger ?: Trigger,
	socialTarget ?: UniversalActorAccessor<PC | NPC>,
	eventCard ?: UniversalItemAccessor<Job | SocialCard>,
	isSocial?: boolean,
	socialId?: string,
	tarot ?: TarotCard,
}



