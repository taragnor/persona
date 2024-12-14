import { ConditionalEffectManager } from "./conditional-effect-manager.js";
import { MultiCheck } from "../config/precondition-types.js";
import { UserComparisonTarget } from "../config/precondition-types.js";
import { ProgressClock } from "./utility/progress-clock.js";
import { PowerTag } from "../config/power-tags.js";
import { DamageType } from "../config/damage-types.js";
import { RESIST_STRENGTH_LIST } from "../config/damage-types.js";
import { PersonaCalendar } from "./social/persona-calendar.js";
import { ArrayCorrector } from "./item/persona-item.js";
import { BooleanComparisonPC } from "../config/precondition-types.js";
import { Triggered } from "../config/precondition-types.js";
import { PToken } from "./combat/persona-combat.js";
import { TarotCard } from "../config/tarot.js";
import { ConditionTarget } from "../config/precondition-types.js";
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
import { Consequence } from "../config/consequence-types.js";

export function getActiveConsequences(condEffect: ConditionalEffect, situation: Situation, source: PowerContainer | null) : Consequence[] {
	if (ArrayCorrector(condEffect.conditions).some(
		cond=>!testPrecondition(cond, situation, source)
	)) return [];
	return ArrayCorrector(condEffect.consequences);
}

export function testPreconditions(conditionArr: Precondition[] | DeepNoArray<Precondition[]>, situation: Situation, source : PowerContainer | null) : boolean {
	return ConditionalEffectManager.getConditionals(conditionArr,source, null)
		.every( cond => testPrecondition(cond, situation, source));
}


export function testPrecondition (condition: Precondition, situation:Situation, source: PowerContainer| null) : boolean {
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
	let testCase = ("num" in condition) ? condition.num : 0;
	switch (condition.comparisonTarget) {
		case "natural-roll":
			if (situation.naturalRoll == undefined)
				return false;
			target = situation.naturalRoll;
			break;
		case "activation-roll":
			if (!situation.activationRoll)
				return false;
			target = situation.naturalRoll!;
			break;
		case "escalation":
			const combat = game.combat as PersonaCombat | undefined;
			if (!combat) return false;
			const die = combat.getEscalationDie();
			target = die;
			break;
		case "total-roll":
			if (situation.rollTotal == undefined)
				return false;
			target = situation.rollTotal;
			break;
		case "talent-level": {
			if (!situation.user) return false;
			const user = PersonaDB.findActor(situation.user);
			//@ts-ignore
			const sourceItem = "sourceItem" in condition ? PersonaDB.findItem(condition.sourceItem) : "";
			const id = sourceItem ? sourceItem.id : undefined;
			if (!id) {
				return false;
			}
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

			let specifiedTarget : PersonaActor | null = null;
			if (condition.socialLinkIdOrTarot) {
				const targetActor  = PersonaDB.allActors()
					.find( x=> x.id == condition.socialLinkIdOrTarot)
					?? PersonaDB.socialLinks()
					.find(x=> x.tarot?.name  == condition.socialLinkIdOrTarot);
				if (targetActor) {
					target = actor.system.social.find(x=> x.linkId == targetActor.id)?.linkLevel ?? 0;
					break;
				} else {
					target =  0;
					break;
				}
			}
			if (!source && !situation.socialTarget)  return false;
			const socialTarget = specifiedTarget ??
			source?.parent
			?? (
				situation.socialTarget
				? PersonaDB.findActor(situation?.socialTarget)
				: null
			);
			if (!socialTarget) return false;
			let targetId: string;
			if (socialTarget.type == "tarot") {
				const tarotName = socialTarget.name;
				if (!tarotName)  {
					PersonaError.softFail("Can't find tarot card for ${source.name}");
					return false;
				}
				const sourceActor =
					(game.actors.contents as PersonaActor[])
					.find( x=>
						(x.system.type == "npc" || x.system.type == "pc") && x.system.tarot == tarotName);
				if (!sourceActor) {
					PersonaError.softFail("No one holds tarot ${tarotName}");
					return false;
				}
				targetId = sourceActor.id;
			} else if (socialTarget.id == PersonaDB.personalSocialLink().id) {
				//personal link
				targetId = actor.id;
			} else {
				//NPCs
				targetId = socialTarget.id;
			}
			const link = actor.system.social.find(data=> data.linkId == targetId);
			if (!link) return false;
			target= link.linkLevel;
			break;
		}
		case "student-skill":
			if (!situation.user) return false;
			const actor = PersonaDB.findActor(situation.user);
			if (actor.system.type != "pc") return false;
			target = actor.system.skills[condition.studentSkill!];
			break;
		case "character-level": {
			if (!situation.user) return false;
			const actor = PersonaDB.findActor(situation.user);
			target= actor.system.combat.classData.level;
			break;
		}
		case "has-resources": {
			if (!situation.user) return false;
			const actor = PersonaDB.findActor(situation.user);
			if (actor.system.type != "pc") return false;
			target = actor.system.money;
			break;
		}
		case "resistance-level" : {
			const subject = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!subject) return false;
			testCase = RESIST_STRENGTH_LIST.indexOf(condition.resistLevel);
			let element : DamageType | "by-power" = condition.element;
			if (element == "by-power") {
				if (!situation.usedPower) {return false;}
				const power = PersonaDB.findItem(situation.usedPower);
				element = power.system.dmg_type;
				if (element == "healing" || element == "untyped" || element == "all-out" || element =="none" ) return false;

			}
		const targetResist = subject.system.combat.resists[element] ?? "normal";
			target = RESIST_STRENGTH_LIST.indexOf(targetResist);
			break;
		}
		case "health-percentage":
			const subject = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!subject) return false;
			target = (subject.hp / subject.mhp) * 100;
			break;
		case "clock-comparison":
			const clock = ProgressClock.getClock(condition.clockId);
			if (!clock) return false;
			target = clock.amt;
			break;
		case "percentage-of-hp": {
			const subject = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!subject) return false;
			target = subject.hp / subject.mhp;
			break;
		}
		case "percentage-of-mp": {
			const subject = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!subject) return false;
			target = subject.mp / subject.mmp;
			break;
		}
		case "energy": {
			const subject = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!subject) return false;
			if (subject.system.type != "shadow") return false;
			target = subject.system.combat.energy.value;
			break;
		}
		default:
			condition satisfies never;
			PersonaError.softFail(`Unknwon numeric comparison type ${condition["comparisonTarget"]}`)
			return false;
	}
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
function triggerComparison(condition: Triggered, situation: Situation, _source:Option<PowerContainer>) : boolean {
	if (!situation.trigger) return false;
	if (condition.trigger != situation.trigger) return false;
	switch (condition.trigger) {
		case "on-attain-tarot-perk":
			return condition.tarot == situation.tarot;
		case "on-inflict-status":
			return condition.status == situation.statusEffect;
		case "on-combat-end":
		case "exit-metaverse":
		case "enter-metaverse":
		case "on-use-power":
		case "on-combat-start":
		case "on-kill-target":
		case "on-damage":
		case "start-turn":
		case "end-turn":
		case "on-combat-end-global":
		case "on-search-end":
		case "on-open-door":
			return true;
		case "on-clock-tick":
			if (!("triggeringClockId" in situation)) {
				return false;
			}
			return situation.triggeringClockId == condition.triggeringClockId;
		default:
			condition.trigger satisfies never;
			return false;
	}
}

/** returns undefined in case of a state that just shouldn't be analzyed at all*/
function getBoolTestState(condition: Precondition & BooleanComparisonPC, situation: Situation, source: Option<PowerContainer>): boolean | undefined {
	switch(condition.boolComparisonTarget) {
		case "engaged": {
			if (!situation.activeCombat){
				return undefined;
			}
			const subject = getSubject(condition, situation, source, "conditionTarget");
			if (!subject) {
				PersonaError.softFail(`Can't find Subject of ${source?.name} check for: ${condition.boolComparisonTarget}`);
				return undefined;

			}
			const combat = PersonaCombat.ensureCombatExists();
			const subjectToken = subject instanceof TokenDocument ? PersonaDB.getUniversalTokenAccessor(subject) : combat.getToken(subject.accessor);
			if (!subjectToken) {
				PersonaError.softFail(`Can't find token for ${subject?.name}`);
				return undefined;
			}
			return combat.isEngagedByAnyFoe(subjectToken);
		}
		case "engaged-with": {
			//return true if X is engaging Y
			if (!situation.activeCombat){
				return undefined;
			}
			const target = getSubjectToken(condition, situation, source, "conditionTarget");
			const target2 = getSubjectToken(condition, situation, source, "conditionTarget2");
			if (!target || !target2) return undefined;

			const combat = PersonaCombat.ensureCombatExists();
			const tok1 = PersonaDB.getUniversalTokenAccessor(target);
			const tok2 = PersonaDB.getUniversalTokenAccessor(target2);
			return combat.isEngaging(tok1, tok2);
		}
		case "metaverse-enhanced":
			return Metaverse.isEnhanced();
		case "is-shadow": {
			const target = getSubject(condition, situation, source,  "conditionTarget");
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			return  targetActor.system.type == "shadow";
		}
		case "is-pc": {
			const target = getSubjectActor(condition, situation, source,  "conditionTarget");
			if (!target) return undefined;
			return target.system.type == "pc";
		}
		case "has-tag": {
			if (!situation.usedPower) {
				return undefined;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			if (typeof condition.powerTag == "string") {
				return power.system.tags.includes(condition.powerTag!);
			}
			return Object.entries(condition.powerTag)
			.filter( ([_, val]) => val == true)
			.some (([tag, _]) => power.system.tags.includes(tag as PowerTag));
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
			return multiCheckContains(condition.powerDamageType, [power.system.dmg_type]);
			// return condition.powerDamageType == power.system.dmg_type;
		}
		case "has-status" : {
			const target = getSubject(condition, situation, source,  "conditionTarget");
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			if (typeof condition.status == "string") {
				return targetActor.statuses.has(condition.status);
			} else {
				return Object.entries(condition.status)
					.filter( ([_, val]) => val== true)
					.some( ([sname,_]) => targetActor.statuses.has(sname as StatusEffectId));
			}
		}
		case  "struck-weakness": {
			if (!situation.usedPower) {
				return false;
			}
			const target = getSubject(condition, situation, source,  "conditionTarget");
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			const power = PersonaDB.findItem(situation.usedPower);
			const resist = targetActor.elementalResist(power.system.dmg_type);
			return resist == "weakness";
		}
		case "is-resistant-to": {
			const target = getSubject(condition, situation, source,  "conditionTarget");
			if (!target) return undefined;
			const targetActor = target instanceof PersonaActor ? target : target.actor;
			let dtype = condition.powerDamageType;
			if (dtype == "by-power") {
				if (!situation.usedPower) { return undefined; }
				const power = PersonaDB.findItem(situation.usedPower);
				dtype = power.system.dmg_type;
			}
			const resist = targetActor.elementalResist(dtype);
			switch (resist) {
				case "resist": case "block": case "absorb": case "reflect": return true;
				case "weakness": case "normal": return  false;
				default:
					resist satisfies never;
					return false;
			}
		}
		case "flag-state": {
			const targetActor = getSubjectActor(condition, situation, source,  "conditionTarget");
			if (!targetActor) return undefined;
			return targetActor.getFlagState(condition.flagId);
		}
		case "is-same-arcana": {
			if (!situation.attacker) return undefined;
			const actor = PersonaDB.findActor(situation.attacker);
			if(!situation.target) {
				return undefined;
			}
			const targetActor = getSubjectActor(condition, situation, source,  "conditionTarget");
			if (!targetActor) return undefined;
			return actor.system.tarot == targetActor.system.tarot;
		}
		case "is-dead": {
			const target = getSubject(condition, situation, source,  "conditionTarget");
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
		case "target-owner-comparison":
			const target = getSubject(condition, situation, source, "conditionTarget");
			const target2 = getSubject(condition, situation, source, "conditionTarget2");
			if (!target || !target2) return undefined;
			return target == target2;
		case "power-target-type-is":
			if (!situation.usedPower) return undefined;
			const power = PersonaDB.findItem(situation.usedPower);
			if (!power) {
				PersonaError.softFail(`Can't find power in conditional`);
				return undefined;
			}
			return power.system.targets == condition.powerTargetType;
		case "weather-is":
			const weather = PersonaCalendar.getWeather();
			const comparison = condition.weatherComparison;
			if (typeof comparison == "string") {
				return condition.weatherComparison == weather;
			}
			return comparison[weather] ?? false;
		case "weekday-is":
				const weekday = PersonaCalendar.weekday();
			return condition.days[weekday];
		case "social-target-is": {
			if (!condition.socialLinkIdOrTarot) {
				return undefined;
			}
			const desiredActor  = PersonaDB.allActors()
			.find( x=> x.id == condition.socialLinkIdOrTarot)
			?? PersonaDB.allActors()
			.find(x=> x.tarot == condition.socialLinkIdOrTarot);
			const target = getSubject(condition, situation, source, "conditionTarget");
			return target == desiredActor;
		}
		case "shadow-role-is": {
			const target = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target) {return undefined;}
			if (target.system.type != "shadow") {return false;}
			if (typeof condition.shadowRole == "string") {
				return condition.shadowRole == target.system.role;
			}
			return multiCheckContains(condition.shadowRole, [target.system.role]);
		}
		case "is-distracted": {
			const target = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target) {return undefined;}
			return target.isDistracted();
		}
		case "active-scene-is": {
			const scene = game.scenes.active;
			if (!scene) return false;
			return scene.id == condition.sceneId;
		}
		case "is-gm": {
			const user = getUser(condition.userComparisonTarget, situation);
			return user?.isGM ?? undefined;
		}
		case "has-item-in-inventory": {
			const item = game.items.get(condition.itemId);
			if (!item) return undefined;
			const target = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target) return undefined;
			return target.items.contents.some(x=> x.name == item.name && (("amount" in x.system)? x.system.amount > 0 : true ));
		}
		case "creature-type-is": {
			const target = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target) return undefined;
			return multiCheckContains(condition.creatureType, [target.system.creatureType]);

		}
		case "power-slot-is": {
			if (!situation.usedPower) return undefined;
			const power = PersonaDB.findItem(situation.usedPower);
			if (power.system.type == "consumable") {return undefined;}
			const slot = condition.slotType;
			return slot[String(power.system.slot)];
		}
		case "social-availability": {
			const socialTarget = situation.socialTarget ?? situation.target;
			if (!socialTarget) return undefined;
			if (!situation.user) return undefined;
			const user = PersonaDB.findActor(situation.user);
			const target = PersonaDB.findActor(socialTarget);
			if (user.system.type == "shadow") return undefined;
			switch (condition.socialCheckType) {
				case "relationship-type-check":
					const link = (user as PC).socialLinks.find(x=>x.actor == target);
					if (!link) return undefined;
					return link.relationshipType.toUpperCase() == condition.relationshipType.toUpperCase();
				case "is-social-disabled":
					return target.isSociallyDisabled();
				case "is-available":
					return target.isAvailable();
				default:
					condition satisfies never;
					PersonaError.softFail(`UNexpected social check ${(condition as any)?.socialTypeCheck}`);
					return undefined;
			}
		}
		case "has-creature-tag":  {
			const target = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target) return undefined;
			return multiCheckTest(condition.creatureTag, x => target.hasCreatureTag(x));
		}
		default :
			condition satisfies never;
			return undefined;
	}
}

function booleanComparison(condition : Precondition , situation: Situation, source:Option<PowerContainer>): boolean {
	if (condition.type != "boolean") throw new PersonaError("Not a boolean comparison");
	const testState = getBoolTestState(condition, situation, source);
	if (testState === undefined) return false;
	const targetState = condition.booleanState ?? false;
	return targetState == testState;
}

function getUser (target: UserComparisonTarget, situation : Situation) : FoundryUser | undefined {
	switch (target) {
		case "triggering-user":
			if ("triggeringUser" in situation) {
				const userId = situation.triggeringUser?.id ?? "";
				return game.users.get(userId);
			}
			break;
		case "current-user":
			return game.user;
		default:
			target satisfies never;
	}
	return undefined;
}

function getSubjectToken<K extends string, T extends Record<K, ConditionTarget>>( cond: T, situation: Situation, source: Option<PowerContainer>, field : K): PToken | undefined {
	let subject = getSubject(cond, situation, source, field);
	if (subject instanceof TokenDocument) {
		return subject;
	}
	return undefined;
}

function getSubjectActor<K extends string, T extends Record<K, ConditionTarget>>( cond: T, situation: Situation, source: Option<PowerContainer>, field : K): PC | Shadow | undefined {
	let subject = getSubject(cond, situation, source, field);
	if (subject instanceof TokenDocument) {
		subject = subject.actor;
	}
	return subject;
}

function getSubject<K extends string, T extends Record<K, ConditionTarget>>( cond: T, situation: Situation, source: Option<PowerContainer>, field : K) : PToken | PC| Shadow | undefined {
	if (!(field in cond)) {
		PersonaError.softFail(`No conditon target in ${source?.name} of ${source?.parent?.name}`)
		return undefined;
	}
	const condTarget = cond[field];
	switch (condTarget) {
		case "owner":
			if ("actorOwner" in cond && cond.actorOwner) {
				return 	PersonaCombat.getPTokenFromActorAccessor(cond.actorOwner as NonNullable<Precondition["actorOwner"]>);
			}
		case "attacker":
			if (situation.attacker?.token)
				return PersonaDB.findToken(situation.attacker.token) as PToken | undefined;
			else return situation.attacker ? PersonaDB.findActor(situation.attacker): undefined;
		case "target":
			if (situation.target?.token)
				return PersonaDB.findToken(situation.target.token) as PToken | undefined;
			else return situation.target ? PersonaDB.findActor(situation.target): undefined;
		case "user":
			if (!situation.user) return undefined;
			if (situation?.user?.token)
				return PersonaDB.findToken(situation.user.token) as PToken | undefined;
			else return PersonaDB.findActor(situation.user);
		case "triggering-character":
			if ( !("triggeringCharacter" in situation)|| !situation.triggeringCharacter) return undefined;
			if (situation.triggeringCharacter.token) {
				return PersonaDB.findToken(situation.triggeringCharacter.token) as PToken | undefined;
			} else {
				return PersonaDB.findActor(situation.triggeringCharacter);
			}
		default:
			condTarget satisfies undefined;
			if (situation.target?.token) {
				return PersonaDB.findToken(situation.target.token) as PToken | undefined;
			}
			if (!situation.user) {
				return undefined;
			}
			return PersonaDB.findActor(situation.user);
	}
}

function multiCheckContains<T extends string>(multiCheck: MultiCheck<T> | T, arr: T[]) : boolean {
	if (typeof multiCheck != "object") {
		return arr.includes(multiCheck);
	}
	return Object.entries(multiCheck)
		.filter( ([_, val]) => val == true)
		.some (([item, _]) => arr.includes(item as T));
}

function multiCheckTest<T extends string>(multiCheck: MultiCheck<T> | T, testFn: (x: T) => boolean) : boolean {
	if (typeof multiCheck != "object") {
		return testFn(multiCheck)
	}
	return Object.entries(multiCheck)
		.filter( ([_, val]) => val == true)
		.some (([item, _]) => testFn(item as T));

}

export type UserSituation = {
	user: UniversalActorAccessor<PC | Shadow>;
};

export type TriggerSituation = {
	trigger : Trigger,
	triggeringUser ?: FoundryUser,
	triggeringCharacter?:  UniversalActorAccessor<PC | Shadow>;
	triggeringClockId?: string,
};

export type Situation = SituationUniversal & (
	TriggerSituation  | UserSituation);


type SituationUniversal = {
	//more things can be added here all should be optional
	user?: UniversalActorAccessor<PC | Shadow>;
	usedPower ?: UniversalItemAccessor<Usable>;
	usedSkill ?: SocialStat;
	activeCombat ?: boolean ;
	naturalRoll ?: number;
	rollTotal ?: number;
	criticalHit ?: boolean;
	hit?: boolean;
	resisted ?: boolean;
	struckWeakness ?: boolean;
	isAbsorbed ?: boolean;
	// escalationDie ?: number;
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
	tarot ?: TarotCard,
}



