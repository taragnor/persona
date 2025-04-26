import { PersonaScene } from "./persona-scene.js";
import { ActorChange } from "./combat/combat-result.js";
import { AttackResult } from "./combat/combat-result.js";
import { CombatResult } from "./combat/combat-result.js";
import { Usable } from "./item/persona-item.js";
import { SocialLink } from "./actor/persona-actor.js";
import { NPCAlly } from "./actor/persona-actor.js";
import { UsableAndCard } from "./item/persona-item.js";
import { ValidSocialTarget } from "./social/persona-social.js";
import { ValidAttackers } from "./combat/persona-combat.js";
import { CombatTriggerTypes } from "../config/triggers.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { PersonaSocial } from "./social/persona-social.js";
import { SOCIAL_LINK_OR_TAROT_OTHER } from "../config/precondition-types.js";
import { AnyStringObject } from "../config/precondition-types.js";
import { SocialLinkIdOrTarot } from "../config/precondition-types.js";
import { ConditionalEffectManager } from "./conditional-effect-manager.js";
import { MultiCheck } from "../config/precondition-types.js";
import { UserComparisonTarget } from "../config/precondition-types.js";
import { ProgressClock } from "./utility/progress-clock.js";
import { PowerTag } from "../config/power-tags.js";
import { DamageType } from "../config/damage-types.js";
import { RESIST_STRENGTH_LIST } from "../config/damage-types.js";
import { PersonaCalendar } from "./social/persona-calendar.js";
import { ArrayCorrector } from "./item/persona-item.js";
import { BooleanComparisonPC } from "../config/boolean-comparison.js";
import { Triggered } from "../config/precondition-types.js";
import { PToken } from "./combat/persona-combat.js";
import { TarotCard } from "../config/tarot.js";
import { ConditionTarget } from "../config/precondition-types.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { SocialCard } from "./item/persona-item.js";
import { NPC } from "./actor/persona-actor.js";
import { SocialStat } from "../config/student-skills.js";
import {Metaverse} from "./metaverse.js";
import { PowerContainer } from "./item/persona-item.js";
import { UniversalItemAccessor } from "./utility/db-accessor.js";
import { Precondition } from "../config/precondition-types.js";
import { UniversalActorAccessor } from "./utility/db-accessor.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaError } from "./persona-error.js";
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
		case "never":
			return false;
		case "disable-on-debug":
			if (PersonaSettings.debugMode() == true) {
				return false;
			} else return true;
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
			if (! ("talents" in user.system)) {
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

			if (condition.socialLinkIdOrTarot == "SLSource"){
				//in theory these should be preverified so we're automatically letting them through
				return true;
			}
			const socialLink = getSocialLinkTarget(condition.socialLinkIdOrTarot, situation, source);
			if (!socialLink) {
				target = 0;
				break;
			}
			const link = actor.system.social.find(data=> data.linkId == socialLink.id);
			if (link) {
				target = link.linkLevel;
				break;
			} else {
				target = 0;
				break;
			}
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
				if (power.system.type == "skillCard") return false;
				if (!situation.attacker) return false;
				const attacker = PersonaDB.findActor(situation?.attacker);
				element = (power as Usable).getDamageType(attacker);
				// element = power.system.dmg_type;
				if (element == "healing" || element == "untyped" || element == "all-out" || element =="none" ) return false;
			}
			if (subject.system.type == "npc") return false;
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
		case "socialRandom": {
			if (situation.socialRandom == undefined) {
				return false;
			}
			target = situation.socialRandom;
			break;
		}
		case "itemCount": {
			const subject = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!subject) return false;
			const item = game.items.get(condition.itemId);
			if (!item) return false;
			target = subject.items.contents
			.reduce( (a,x) => (x.name == item.name && ("amount" in x.system))
				? (a + x.system.amount)
				: a
				, 0);
			break;
		}
		case "inspirationWith": {
			const subject = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!subject) return false;
			const link = getSocialLinkTarget(condition.socialLinkIdOrTarot, situation, source);
			if (!link) return false;
			target = subject.getInspirationWith(link.id)
			break;
		}
		case "opening-roll": {
			if(situation.openingRoll == undefined) return false;
			target = situation.openingRoll;
			break;
		}
		case "links-dating": {
			const subjectAcc = situation.user ?? situation.attacker;
			if (!subjectAcc) return false;
			const subject = PersonaDB.findActor(subjectAcc);
			if (!subject) return false;
			if ( subject.system.type != "pc") {target= 0; break;}
			target= subject.system.social
			.filter( x=> x.isDating || x.relationshipType == "DATE")
			.length;
			break;
		}
		case "social-variable": {
			if (!PersonaSocial.rollState) return false;
			target = PersonaSocial.rollState.cardData.variables[condition.variableId] ;
			if (target == undefined) return false;
			break;
		}
		case "round-count": {
			if (!game.combat) return false;
			target = game.combat.round ?? -1;
			break;
		}
		case "total-SL-levels": {
			const subject : PersonaActor | undefined = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!subject) return false;
			let targetActor : SocialLink | undefined = undefined;
			switch (subject.system.type) {
				case "tarot":
				case "shadow":
					break;
				case "npcAlly":
					const proxy = (subject as NPCAlly).getNPCProxyActor();
					if (!proxy) {break;}
					targetActor = proxy;
					break;
				case "pc": case "npc":
					targetActor = subject as PC | NPC;
					break;
				default:
					subject.system satisfies never;
					return false;
			}
			if (!targetActor) {target =0; break;}
			target = PersonaDB.PCs()
			.reduce( (acc, pc) => acc + pc.getSocialSLWith(targetActor), 0)
			break;
		}
		case "combat-result-based":
			const res = combatResultBasedNumericTarget(condition, situation, source) ;
			if (typeof res == "boolean") return res;
			target= res;
			break;
		case "num-of-others-with": {
			const subject = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!subject) return false;
			let targets : PersonaActor[];
			const combat = game.combat as PersonaCombat | undefined;
			switch (condition.group) {
				case "allies": {
					if (subject.isNPC()) return false;
					if (combat) {
						const comb = combat.getCombatantByActor(subject as ValidAttackers)
						if (!comb) {return false;}
						const allies = combat.getAllies(comb);
						targets = allies
							.map( x=> x.actor)
							.filter (x=> x != undefined);
					} else {
						if (subject.getAllegiance() != "PCs") {
							return false;
						}
						const token= (game.scenes.current as PersonaScene).findActorToken(subject);
						if (!token) return false;
						const allies = PersonaCombat.getAllAlliesOf(token as PToken);
						targets= allies.map( x=> x.actor)
							.filter (x=> x != undefined);
					}
					break;
				}
				case "enemies": {
					if (!combat) return false;
					const token= (game.scenes.current as PersonaScene).findActorToken(subject);
					if (!token) return false;
					const foes = PersonaCombat.getAllEnemiesOf(token as PToken);
					targets= foes.map( x=> x.actor)
					.filter (x=> x != undefined);
					break;
				}
				case "both": {
					if (!combat) {
						const token = (game.scenes.current as PersonaScene).findActorToken(subject);
						const allies = PersonaCombat.getAllAlliesOf(token as PToken);
						targets= allies.map( x=> x.actor)
							.filter (x=> x != undefined);
					} else {
						targets = combat.combatants.contents
							.map( x=> x.actor)
							.filter (x=> x != undefined);
					}
					break;
				}
				default:
					condition.group satisfies never
					return false;
			}
			target = targets.reduce(
				function (a,act) {
					const acc = (act as ValidAttackers).accessor;
					const situation : Situation = {
						user: acc,
						target: acc,
					};
				return	a + (testPrecondition(condition.otherComparison, situation, null) ? 1 : 0);
				}
			, 0);
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
		case "odd": return target % 2 != 0;
		case "even": return target % 2 == 0;
		case "range": return target >= testCase && target <= condition.high;
		default:
				condition satisfies undefined;
	}
	return false;
}

function combatResultBasedNumericTarget(condition: Precondition & {type: "numeric", comparisonTarget: "combat-result-based"}, situation: Situation, _source:Option<PowerContainer>): number | boolean {
	const invert = condition.invertComparison ?? false;
	let resultCompFn : (atk: AttackResult) => boolean = (_atk) => true;
	let changeCompFn: (  changes: ActorChange<ValidAttackers>) => boolean = () => true;
	switch (condition.resultSubtypeComparison) {
		case "total-hits":
			resultCompFn = function(atk: AttackResult) {
				return atk.result == "hit" || atk.result == "crit";
			}
			break;
		case "total-knocks-down":
			changeCompFn = function(change) {
				return !!change.addStatus.find( x=> x.id == "down");
			}
			break;
		default:
			condition.resultSubtypeComparison satisfies never;
			return false
	}
	if (!("combatResult" in situation)) {
		return false;
	}
	let count = 0;
	for (const [atkRes, changes] of situation.combatResult.attacks.entries()) {
		const target = PersonaDB.findToken(atkRes.target);
		const targetChanges = changes.filter( c=> {
			const changed = PersonaDB.findActor(c.actor);
			return changed == target.actor;
		});
		const changePass = targetChanges.some( change=>changeCompFn (change));
		let res = resultCompFn(atkRes) && changePass;
		res = invert ? !res : res;
		if (res) {count += 1;}
	}
	return count;
}

function triggerComparison(condition: Triggered, situation: Situation, _source:Option<PowerContainer>) : boolean {
	if (!("trigger" in situation)) return false;
	if (!condition.trigger) return false;
	if (condition.trigger != situation.trigger) return false;
	switch (condition.trigger) {
		case "on-attain-tarot-perk":
			if (!("tarot" in situation)) return false;
			return condition.tarot == situation.tarot;
		case "on-inflict-status":
			if (!("statusEffect" in situation)) return false;
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
		case "on-clock-change":
		case "on-clock-tick":
			if (!("triggeringClockId" in situation)) {
				return false;
			}
			return situation.triggeringClockId == condition.triggeringClockId;
		case "on-enter-region":
		case "on-presence-check":
			if (!("triggeringRegionId" in situation)) {
				return false;
			}
			return true;
		default:
			condition.trigger satisfies never;
			return false;
	}
}

/** returns undefined in case of a state that just shouldn't be analzyed at all*/
function getBoolTestState(condition: Precondition & BooleanComparisonPC, situation: Situation, source: Option<PowerContainer>): boolean | undefined {
	switch(condition.boolComparisonTarget) {
		case "engaged": {
			const subject = getSubject(condition, situation, source, "conditionTarget");
			if (!subject) {
				// PersonaError.softFail(`Can't find Subject of ${source?.name} check for: ${condition.boolComparisonTarget}`, condition, situation);
				return undefined;
			}
			const combat = game.combat as PersonaCombat;
			if (!combat) return undefined;
			if (subject instanceof PersonaActor) {
				if (subject.system.type == "npc") return undefined;
			}
			const subjectToken = subject instanceof TokenDocument ? PersonaDB.getUniversalTokenAccessor(subject) : combat.getToken((subject as ValidAttackers).accessor);
			if (!subjectToken) {
				// PersonaError.softFail(`Can't find token for ${subject?.name}`);
				return undefined;
			}
			return combat.isEngagedByAnyFoe(subjectToken);
		}
		case "engaged-with": {
			//return true if X is engaging Y
			const combat = game.combat as PersonaCombat;
			if (!combat) return undefined;
			const target = getSubjectToken(condition, situation, source, "conditionTarget");
			const target2 = getSubjectToken(condition, situation, source, "conditionTarget2");
			if (!target || !target2) return undefined;

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
			if (!power) return undefined;
			let user: ValidAttackers | null;
			switch (true) {
				case situation.attacker != undefined:
					user = PersonaDB.findActor(situation.attacker);
					break;
				case situation.user != undefined:
					user = PersonaDB.findActor(situation.user);
					break;
				default:
					user = null;
					break;
			}
			const powerTags = power.tagList(user);
			if (typeof condition.powerTag == "string") {
				return powerTags.includes(condition.powerTag!);
			}
			return Object.entries(condition.powerTag)
			.filter( ([_, val]) => val == true)
			.some (([tag, _]) => powerTags.includes(tag as PowerTag));
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
			if (!power || power.isSkillCard()) return undefined;
			if (!situation.attacker) return undefined;
			const attacker = PersonaDB.findActor(situation.attacker);
			if (!attacker) return undefined;
			const dtype = power.getDamageType(attacker);
			return multiCheckContains(condition.powerDamageType, [dtype]);
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
			if (targetActor.system.type == "npc") return undefined;
			if (power.system.type == "skillCard") return undefined;
			if (!situation.attacker) return undefined;
			const attacker = PersonaDB.findActor(situation?.attacker);
			const resist = (targetActor as PC | Shadow).elementalResist((power as Usable).getDamageType(attacker));
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
				if (power.system.type == "skillCard") return undefined;
				if (!situation.attacker) return undefined;
				const attacker = PersonaDB.findActor(situation?.attacker);
				dtype = (power as Usable).getDamageType(attacker);
			}
			if (targetActor.system.type == "npc") return undefined;
			const resist = (targetActor as PC | Shadow).elementalResist(dtype);
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
		case "target-owner-comparison": {
			let target = getSubject(condition, situation, source, "conditionTarget");
			let target2 = getSubject(condition, situation, source, "conditionTarget2");
			if (target instanceof TokenDocument) {
				target = target.actor;
			}
			if (target2 instanceof TokenDocument) {
				target2= target2.actor;
			}
			if (!target || !target2) return undefined;
			return target == target2;
		}
		case "power-target-type-is":
			if (!situation.usedPower) return undefined;
			const power = PersonaDB.findItem(situation.usedPower);
			if (!power) {
				PersonaError.softFail(`Can't find power in conditional`);
				return undefined;
			}
			return multiCheckContains(condition.powerTargetType, [power.targets()]);
			// return power.system.targets == condition.powerTargetType;
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
			const target = getSubject(condition, situation, source, "conditionTarget");
			if (!target) { return undefined; }
			const desiredActor = getSocialLinkTarget(condition.socialLinkIdOrTarot, situation, source);
			return target == desiredActor;
		}
		case "social-target-is-multi": {
			const target = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target) { return undefined; }
			const actors= multiCheckToArray(condition.socialLinkIdOrTarot) as SocialLinkIdOrTarot[];
			return actors.some(actor => getSocialLinkTarget(actor, situation, source) == target);
		}
		case "shadow-role-is": {
			const target = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target) {return undefined;}
			if (target.system.type != "shadow") {return false;}
			if (typeof condition.shadowRole == "string") {
				return (condition.shadowRole == target.system.role || target.system.role2 == condition.shadowRole);
			}
			return multiCheckContains(condition.shadowRole, [target.system.role, target.system.role2])
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
			if (power.system.type == "skillCard") {return undefined;}
			const slot = condition.slotType;
			return slot[String(power.system.slot)];
		}
		case "social-availability": {
			if (!condition.conditionTarget) {
				condition.conditionTarget = "user";
			}
			let target1 = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target1) {
				if (!situation.user) return undefined;
				target1 = PersonaDB.findActor(situation.user);
				if (!target1) return undefined;
			}
			if (target1.system.type == "shadow") return undefined;
			switch (condition.socialTypeCheck) {
				case "relationship-type-check":
					const target2 = getSocialLinkTarget(condition.socialLinkIdOrTarot ?? "", situation, source);
					const link = target1.socialLinks.find(x=>x.actor == target2);
					if (!link) return undefined;
					return link.relationshipType.toUpperCase() == condition.relationshipType.toUpperCase();
				case "is-social-disabled":
					return target1.isSociallyDisabled();
				case "is-available": {
					if (target1.system.type != "pc") {
						return undefined;
					}
					const target2 = getSocialLinkTarget(condition.socialLinkIdOrTarot ?? "", situation, source);
					if (!target2) return undefined;
					return target1.isAvailable(target2);
				}
				case "is-dating": {
					const target2 = getSocialLinkTarget(condition.socialLinkIdOrTarot ?? "", situation, source);
					if (!target2) return undefined;
					return target1.isDating(target2);
				}
				default:
					condition satisfies never;
					PersonaError.softFail(`Unexpected social check ${(condition as any)?.socialTypeCheck}`);
					Debug(condition);
					Debug(situation);
					return undefined;
			}
		}
		case "has-creature-tag":  {
			const target = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target) return undefined;
			return multiCheckTest(condition.creatureTag, x => target.hasCreatureTag(x));
		}
		case "cameo-in-scene": {
			return !!situation.cameo;
		}
		case "arcana-is": {
			const target = getSubjectActor(condition, situation, source, "conditionTarget");
			if (!target) return undefined;
			const tarot = target.system.tarot;
			if (!tarot) return undefined;
			return target.system.tarot == condition.tarot;
		}
		case "is-enemy": {
			const target = getSubjectToken(condition, situation, source,  "conditionTarget");
			const target2 = getSubjectToken(condition, situation, source, "conditionTarget2");
			if (!target || !target2) return undefined;
			const combat = game.combat as PersonaCombat;
			if (!combat) return undefined;
			const enemies = combat.getAllEnemiesOf(target);
			return enemies.includes(target2);
		}
		case "logical-or":
			return testPrecondition(condition.comparison1, situation, source) || testPrecondition(condition.comparison2, situation, source);
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

function getSubjectActor<K extends string, T extends Record<K, ConditionTarget>>( cond: T, situation: Situation, source: Option<PowerContainer>, field : K): ValidAttackers | NPC| undefined {
	let subject = getSubject(cond, situation, source, field);
	if (subject instanceof TokenDocument) {
		subject = subject.actor;
	}
	return subject;
}

export function getSocialLinkTarget(socialLinkIdOrTarot: SocialLinkIdOrTarot, situation: Situation, source: Option<PowerContainer>): NPC | PC | undefined {
	if (socialLinkIdOrTarot == undefined ) return undefined;
	let targetIdOrTarot : SocialLinkIdOrTarot | undefined = socialLinkIdOrTarot as SocialLinkIdOrTarot;
	const test = targetIdOrTarot as keyof typeof SOCIAL_LINK_OR_TAROT_OTHER;
	switch (test) {
		case "target":
		case "": {
			targetIdOrTarot = situation.socialTarget?.actorId as unknown as AnyStringObject
			?? situation.target?.actorId as unknown as AnyStringObject
			?? undefined;
			break;
		}
		case "attacker": {
			targetIdOrTarot = situation.attacker?.actorId as unknown as AnyStringObject ?? undefined;
			break;

		}
		case "user": {
			targetIdOrTarot = situation.user?.actorId as unknown as AnyStringObject ?? undefined;
			break;

		}
		case "cameo": {
			targetIdOrTarot = situation.cameo?.actorId as unknown as AnyStringObject
			?? undefined;
			break;
		}
		case "SLSource": {
			targetIdOrTarot = source?.parent?.id as unknown as AnyStringObject
			?? undefined;
			if (targetIdOrTarot as unknown as string == PersonaDB.personalSocialLink().id) {
				PersonaError.softFail("Using Personal Link");
				return undefined;
			} else if (targetIdOrTarot as unknown as string == PersonaDB.teammateSocialLink().id) {
				PersonaError.softFail("Using Teammate link as source");
				return undefined;
			}
			break;
		}
		default:
			test satisfies never;
			//NOTE: TS can't do a satsifies here so have to be careufl adding new types
			break;
	}
	if (!targetIdOrTarot) return undefined;
	const allLinks = PersonaDB.socialLinks();
	const allyCheck = PersonaDB.NPCAllies()
		.find( ally => ally.id == targetIdOrTarot);
	if (allyCheck) {
		return allyCheck.getNPCProxyActor();
	}
	const desiredActor  = allLinks
		.find( x=> x.id == targetIdOrTarot)
		?? allLinks
		.find(x=> x.tarot?.id == targetIdOrTarot
		|| x.tarot?.name == targetIdOrTarot);
	return desiredActor;
}

function getSubject<K extends string, T extends Record<K, ConditionTarget>>( cond: T, situation: Situation, source: Option<PowerContainer>, field : K) : PToken | ValidAttackers | NPC | undefined {
	if (!(field in cond)) {
		Debug(cond);
		Debug(situation);
		const printCondition = ConditionalEffectManager.printConditional(cond as unknown as Precondition);
		PersonaError.softFail(`No field ${field} in ${printCondition} ${source?.name} of ${source?.parent?.name}`)
		return undefined;
	}
	const condTarget = cond[field];
	switch (condTarget) {
			//owner of the power in question
		case "owner":
			if (source && source.parent) {
				const parent = source.parent;
				switch (parent.system.type) {
					case "pc":
					case "shadow":
					case "npcAlly":
						return parent as ValidAttackers;
					default:
						break;
				}
			}
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
			const target : UniversalActorAccessor<ValidAttackers | ValidSocialTarget> | undefined = situation.target ?? situation.socialTarget;
			return target ? PersonaDB.findActor(target): undefined;
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
		case "cameo":
			if (!situation.cameo) return undefined;
			if (situation.cameo.token) {
				return PersonaDB.findToken(situation.cameo.token) as PToken | undefined;
			} else {
				return PersonaDB.findActor(situation.cameo);
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

export function multiCheckToArray<T extends string>(multiCheck: MultiCheck<T>) : T[] {
	return Object.entries(multiCheck)
		.filter( ([_, val]) => val == true)
		.map( ([k,_v]) => k as T) ;
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

type UserSituation = {
	user: UniversalActorAccessor<ValidAttackers>;
};

type TriggerSituation = TriggerSituation_base & (
	CombatTrigger
	| PresenceCheckTrigger
	| EnterRegionTrigger
	| ExplorationTrigger
	| ClockTrigger
);

type ExplorationTrigger = {
	trigger: "on-open-door" | "on-search-end" | "on-attain-tarot-perk" | "enter-metaverse" | "exit-metaverse";
	triggeringCharacter?:  UniversalActorAccessor<ValidAttackers>;
}

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

export type Situation = SituationUniversal & (
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

type SituationUniversal = {
	//more things can be added here all should be optional
	user?: UniversalActorAccessor<ValidAttackers>;
	usedPower ?: UniversalItemAccessor<UsableAndCard>;
	usedSkill ?: SocialStat;
	activeCombat ?: boolean ;
	openingRoll ?: number;
	naturalRoll ?: number;
	rollTotal ?: number;
	criticalHit ?: boolean;
	hit?: boolean;
	resisted ?: boolean;
	struckWeakness ?: boolean;
	isAbsorbed ?: boolean;
	activationRoll ?: boolean;
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
}




