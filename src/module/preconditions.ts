import { TarotCard } from "../config/tarot.js";
import { EnhancedSourcedConsequence, NonDeprecatedConsequence } from "../config/consequence-types.js";
import { SceneClock } from "./exploration/scene-clock.js";
import { NumberOfOthersWithComparison } from "../config/numeric-comparison.js";
import { CombatResultComparison } from "../config/numeric-comparison.js";
import { PersonaVariables } from "./persona-variables.js";
import { PersonaScene } from "./persona-scene.js";
import { AttackResult } from "./combat/combat-result.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { PersonaSocial } from "./social/persona-social.js";
import { MultiCheckOrSingle, NonDeprecatedPrecondition, SOCIAL_LINK_OR_TAROT_OTHER } from "../config/precondition-types.js";
import { AnyStringObject } from "../config/precondition-types.js";
import { SocialLinkIdOrTarot } from "../config/precondition-types.js";
import { MultiCheck } from "../config/precondition-types.js";
import { UserComparisonTarget } from "../config/precondition-types.js";
import { ProgressClock } from "./utility/progress-clock.js";
import { DamageType } from "../config/damage-types.js";
import { RESIST_STRENGTH_LIST } from "../config/damage-types.js";
import { PersonaCalendar } from "./social/persona-calendar.js";
import { BooleanComparisonPC } from "../config/boolean-comparison.js";
import { PToken } from "./combat/persona-combat.js";
import { ConditionTarget } from "../config/precondition-types.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { Metaverse } from "./metaverse.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaError } from "./persona-error.js";
import { StatusEffectId } from "../config/status-effects.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import {ConsequenceAmountResolver} from "./conditionalEffects/consequence-amount.js";
import {PreconditionConverter} from "./migration/convertPrecondition.js";
import {PersonaAE} from "./active-effect.js";
import {ConditionalEffectC} from "./conditionalEffects/conditional-effect-class.js";
import {ResolvedActorChange} from "./combat/finalized-combat-result.js";

/** @deprecated Use ConditionalEffectC.getActiveConsequences instead */
export function getActiveConsequences(condEffect: ConditionalEffectC, situation: Situation) : EnhancedSourcedConsequence<NonDeprecatedConsequence>[] {
	return condEffect.getActiveConsequences(situation);
}

export function testPreconditions(conditionArr: readonly SourcedPrecondition[], situation: Situation) : boolean {
	try {
		return conditionArr.every( cond =>
			testPrecondition(cond, situation));
	} catch (e) {
		if (e instanceof Error) {
			PersonaError.softFail(e.toString(), e, conditionArr, situation);
		}
		return false;
	}
}

export function testPrecondition (condition: SourcedPrecondition, situation:Situation) : boolean {
	switch (condition.type) {
		case "always":
			return true;
		case "miss-all-targets":
			return false; //placeholder
		case "save-versus":
			if (!situation.saveVersus) {return false;}
			return situation.saveVersus == condition.status;
		case "on-trigger":
			return triggerComparison(condition, situation);
		case "is-hit": {
			//deliberate duplication
			return situation.hit === condition.booleanState;
		}
		case "numeric": {
			return numericComparison(condition, situation);
		}
		// case "numeric-v2":
		// 	return false;
		// 	// return NumericV2.eval(condition, situation, source);
		case "boolean": {
			return booleanComparison(condition, situation);
		}
		case "never":
			return false;
		case "disable-on-debug":
			if (PersonaSettings.debugMode() == true) {
				return false;
			} else {return true;}
		case "diagnostic": {
			// eslint-disable-next-line no-debugger
			debugger;
			return true;
		}
		default:
			condition satisfies never;
			PersonaError.softFail(`Unexpected Condition: ${(condition as Precondition)?.type}`);
			return false;
	}
}


function numericComparison(condition: SourcedPrecondition & {type : "numeric"}, situation: Situation) : boolean {
	// if (condition.type != "numeric") {throw new PersonaError("Not a numeric comparison");}
	let target: number;
	let testCase = ("num" in condition) ? condition.num : 0;
	switch (condition.comparisonTarget) {
		case "natural-roll":
			if (situation.naturalRoll == undefined)
			{return false;}
			target = situation.naturalRoll;
			break;
		case "activation-roll":
			if (situation.naturalRoll == undefined) {return false;}
			if (!situation?.rollTags?.includes("activation"))
			{return false;}
			target = situation.naturalRoll;
			break;
		case "escalation": {
			const combat = game.combat as PersonaCombat | undefined;
			if (!combat) {return false;}
			const die = combat.getEscalationDie();
			target = die;
			break;
		}
		case "total-roll":
			if (situation.rollTotal == undefined)
			{return false;}
			target = situation.rollTotal;
			break;
		case "talent-level": {
			if (!situation.user) {return false;}
			const user = PersonaDB.findActor(situation.user);
			const sourceItem = condition.source;
			const id = sourceItem ? sourceItem.id : undefined;
			if (!id || !user) {
				return false;
			}
			target = user.persona().getTalentLevel(id);
			break;
		}
		case "social-link-level": {
			if (!situation.user) {return false;}
			const actor = PersonaDB.findActor(situation.user);
			if (condition.socialLinkIdOrTarot == "SLSource"){
				return true;
			}
			if (!actor  || !actor.isRealPC()) {return false;}
			const socialLink = getSocialLinkTarget(condition.socialLinkIdOrTarot, situation, condition.source);
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
		case "student-skill": {
			if (!situation.user) {return false;}
			const actor = PersonaDB.findActor(situation.user);
			if (actor.system.type != "pc") {return false;}
			target = actor.system.skills[condition.studentSkill!];
			break;
		}
		case "character-level": {
			if (!situation.user) {return false;}
			const actor = PersonaDB.findActor(situation.user);
			if (!actor) { return false;}
			target = actor.level;
			break;
		}
		case "has-resources": {
			if (!situation.user) {return false;}
			const actor = PersonaDB.findActor(situation.user);
			if (actor.system.type != "pc") {return false;}
			target = actor.system.money;
			break;
		}
		case "resistance-level" : {
			const subject = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!subject) {return false;}
			testCase = RESIST_STRENGTH_LIST.indexOf(condition.resistLevel);
			let element : DamageType = condition.element;
			if (element == "by-power") {
				if (!situation.usedPower) {return false;}
				const power = PersonaDB.findItem(situation.usedPower);
				if (power.system.type == "skillCard") {return false;}
				if (!situation.attacker) {return false;}
				const attacker = PersonaDB.findActor(situation?.attacker);
				element = (power as Usable).getDamageType(attacker);
				// element = power.system.dmg_type;
				if (element == "healing" || element == "untyped" || element == "all-out" || element =="none" ) {return false;}
			}
			if (subject.system.type == "npc") {return false;}
			const targetResist = subject.persona().resists[element]?? "normal";
			target = RESIST_STRENGTH_LIST.indexOf(targetResist);
			break;
		}
		case "health-percentage": {
			const subject = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!subject) {return false;}
			target = (subject.hp / subject.mhpEstimate) * 100;
			break;
		}
		case "clock-comparison": {
			const clock = ProgressClock.getClock(condition.clockId);
			if (!clock) {return false;}
			target = clock.amt;
			break;
		}
		case "percentage-of-hp": {
			const subject = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!subject) {return false;}
			target = subject.hp / subject.mhpEstimate;
			break;
		}
		case "percentage-of-mp": {
			const subject = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!subject) {return false;}
			target = subject.mp / subject.mmp;
			break;
		}
		case "energy": {
			const subject = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!subject) {return false;}
			if (!subject.isShadow()) {return false;}
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
			const arr = getSubjectActors(condition, situation, "conditionTarget");
			if (arr.length == 0) {return false;}
			target = arr.reduce( (acc,subject) => {
				const item = game.items.get(condition.itemId);
				if (!item) {return acc;}
				return acc + subject.items.contents
					.reduce( (a,x) => (x.name == item.name && ("amount" in x.system))
						? (a + x.system.amount)
						: a
						, 0);
			}, 0);
			break;
		}
		case "inspirationWith": {
			const subject = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!subject) {return false;}
			const link = getSocialLinkTarget(condition.socialLinkIdOrTarot, situation, condition.source);
			if (!link) {return false;}
			target = subject.getInspirationWith(link.id);
			break;
		}
		case "opening-roll": {
			if (situation.naturalRoll == undefined  || !situation.rollTags?.includes("opening")) {return false;}
			target = situation.naturalRoll;
			break;
		}
		case "links-dating": {
			const subjectAcc = situation.user ?? situation.attacker;
			if (!subjectAcc) {return false;}
			const subject = PersonaDB.findActor(subjectAcc);
			if (!subject) {return false;}
			if ( subject.system.type != "pc") {target= 0; break;}
			target= subject.system.social
			.filter( x=> x.isDating || x.relationshipType == "DATE")
			.length;
			break;
		}
		case "social-variable": {
			if (!PersonaSocial.currentSocialCardExecutor) {return false;}
			const varVal = PersonaSocial.getSocialVariable(condition.variableId);
			if (varVal == undefined) {return false;}
			target = varVal;
			break;
		}
		case "round-count": {
			if (!PersonaCombat.combat) {return false;}
			target = PersonaCombat.combat.round ?? -1;
			break;
		}
		case "total-SL-levels": {
			const subject : PersonaActor | undefined = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!subject) {return false;}
			let targetActor : SocialLink | undefined = undefined;
			switch (subject.system.type) {
				case "tarot":
				case "shadow":
					break;
				case "npcAlly": {
					const proxy = (subject as NPCAlly).getNPCProxyActor();
					if (!proxy) {break;}
					targetActor = proxy;
					break;
				}
				case "pc": case "npc":
					targetActor = subject as PC | NPC;
					break;
				default:
					subject.system satisfies never;
					return false;
			}
			if (!targetActor) {target =0; break;}
			target = PersonaDB.PCs()
			.reduce( (acc, pc) => acc + pc.getSocialSLWith(targetActor), 0);
			break;
		}
		case "progress-tokens-with": {
			const targetActor = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!targetActor || !targetActor.isSocialLink()) {
				return false;
			}
			const subjectAcc = situation.user ?? situation.attacker;
			if (!subjectAcc) {return false;}
			const subject = PersonaDB.findActor(subjectAcc);
			if (!subject.isPC()) {return false;}
			target = subject.getSocialLinkProgress(targetActor.id);
			break;
		}

		case "combat-result-based": {
			const res = combatResultBasedNumericTarget(condition, situation) ;
			if (typeof res == "boolean") {return res;}
			target= res;
			break;
		}
		case "num-of-others-with": {
			const res  =  numberOfOthersWithResolver(condition, situation);
			if (typeof res == "boolean") {return res;}
			target = res;
			break;
		}
		case "variable-value": {
			let val: number | undefined;
			if (condition.varType == "actor") {
				const subject = getSubjectActors(condition, situation, "applyTo")[0];
				if (subject == undefined) {return false;}
				const reqCondition = {
					...condition,
					actor:subject.accessor,
				};
				val = PersonaVariables.getVariable(reqCondition, situation);
			} else {
				val = PersonaVariables.getVariable(condition,{});
			}
			if (val == undefined) {return false;}
			target = val;
			break;
		}
		case "scan-level": {
			const targetActor = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!targetActor || !targetActor.isValidCombatant()) {return false;}
			target = targetActor.persona().scanLevelRaw;
			break;
		}
		case "advanced-number": {
			const source = condition.source;
			const ownersList = condition.owner
			? [condition.owner]
			: source?.parent instanceof PersonaActor
			&& source.parent.isValidCombatant()
			? [source.parent.accessor]
			: [];
			const actorOwner = ownersList.at(0);
			const situationN= {
				actorOwner,
				...situation,
			};
			const sourced = {
				source: condition.source,
				owner: condition.owner,
				realSource: condition.realSource,
				...condition.comparisonVal,
			};
			const resolved = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, situationN);
			if (resolved == undefined) {return false;}
			target = resolved;
			break;
		}
		default:
			condition satisfies never;
			PersonaError.softFail(`Unknown numeric comparison type ${(condition as Record<string, string>)["comparisonTarget"]}`);
			return false;
	}
	const source = condition.source;
	const ownersList = condition.owner
		? [condition.owner]
		: source?.parent instanceof PersonaActor
		&& source.parent.isValidCombatant()
		? [source.parent.accessor]
		: [];
	// const contextList = PersonaCombat.createTargettingContextList(situation);
	// contextList["owner"] = ownersList;
	if (typeof testCase != "number") {
		const sourced = {
			source: condition.source,
			owner: condition.owner,
			realSource: condition.realSource,
			...testCase,
		};
		const situationN = {
			actorOwner: ownersList.at(0),
			...situation,
		};
		const resolvedCA = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, situationN);
		if (resolvedCA == undefined) {return false;}
		testCase = resolvedCA;
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

export function combatResultBasedNumericTarget(condition: CombatResultComparison, situation: Situation): number | boolean {
	const invert = condition.invertComparison ?? false;
	let resultCompFn : (atk: AttackResult) => boolean = (_atk) => true;
	let changeCompFn: (  changes: ResolvedActorChange<ValidAttackers>) => boolean = () => true;
	switch (condition.resultSubtypeComparison) {
		case "total-hits":
			resultCompFn = function(atk: AttackResult) {
				return atk.result == "hit" || atk.result == "crit";
			};
			break;
		case "total-knocks-down":
			changeCompFn = function(change) {
				return Boolean(change.addStatus.find( x=> x.id == "down"));
			};
			break;
		default:
			condition.resultSubtypeComparison satisfies never;
			return false;
	}
	if (!("combatResult" in situation)) {
		return false;
	}
	let count = 0;
	for (const { atkResult, changes } of situation.combatResult.attacks) {
		const target = PersonaDB.findToken(atkResult.target);
		const targetChanges = changes.filter( c=> {
			const changed = PersonaDB.findActor(c.actor);
			return changed == target.actor;
		});
		const changePass = targetChanges.some( change=>changeCompFn (change));
		let res = resultCompFn(atkResult) && changePass;
		res = invert ? !res : res;
		if (res) {count += 1;}
	}
	return count;
}

function triggerComparison(condition: SourcedPrecondition & {type: "on-trigger"}, situation: Situation) : boolean {
	if (!("trigger" in situation)) {return false;}
	if (condition.trigger != situation.trigger) {return false;}
	switch (condition.trigger) {
		case "on-attain-tarot-perk":
			if (!("tarot" in situation)) {return false;}
			return condition.tarot == situation.tarot;
		case "on-inflict-status":
			if (!("statusEffect" in situation) || situation.statusEffect == undefined) {return false;}
			return multiCheckContains(condition.status, [situation.statusEffect]);
		case "pre-inflict-status":
			if (!("statusEffect" in situation) || situation.statusEffect == undefined) {return false;}
			return multiCheckContains(condition.status, [situation.statusEffect]);
		case "start-turn":
			return true;
		case "on-combat-end":
		case "exit-metaverse":
		case "enter-metaverse":
		case "on-use-power":
		case "on-combat-start":
		case "on-kill-target":
		case "on-damage":
		case "end-turn":
		case "on-combat-end-global":
		case "on-search-end":
		case "on-metaverse-turn":
		case "on-event-end":
		case "on-event-start":
		case "on-open-door":
		case "on-active-scene-change":
		case "pre-take-damage":
		case "on-combat-start-global":
		case "on-power-usage-check":
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
		case "on-roll":
			return true;
		case "on-active-effect-end":
		case "on-active-effect-time-out": {
			if (situation.trigger != condition.trigger) {return false;}
			const effect = PersonaDB.findAE(situation.activeEffect);
			if (!effect) {return false;}
			switch (condition.timeoutTarget) {
				case "status":
					return effect.statusId == condition.statusId;
				case "self":
					if (! (condition.realSource instanceof PersonaAE)) { return false;}
					return effect == condition.realSource;
				case "flag":
					return effect.flagId == condition.flagId;
				default:
					condition satisfies never;
					return false;
			}
		}
		default:
			condition satisfies never;
			return false;
	}
}

/** returns undefined in case of a state that just shouldn't be analzyed at all*/
function getBoolTestState(condition: SourcedPrecondition & {type: "boolean"}, situation: Situation): boolean | undefined {
	switch(condition.boolComparisonTarget) {
		case "is-shadow": {
			const arr = getSubjects(condition, situation, "conditionTarget");
			if (!arr) {return undefined;}
			return arr.some( target => {
				const targetActor = target instanceof PersonaActor ? target : target.actor;
				if (targetActor.system.type == "shadow") {return true;}
			});
		}
		case "is-pc": {
			const targets = getSubjectActors(condition, situation,  "conditionTarget");
			if (!targets) {return undefined;}
			return targets.some( target => target.isPC());
		}
		case "has-tag": {
			return hasTagConditional(condition, situation);
		}
		case "has-status" : {
			const arr = getSubjects(condition, situation, "conditionTarget");
			if (!arr) {return undefined;}
			return arr.some( target => {
				const targetActor = target instanceof PersonaActor ? target : target.actor;
				if (typeof condition.status == "string") {
					return (targetActor.statuses.has(condition.status));
				} else {
					return Object.entries(condition.status)
						.filter( ([_, val]) => val== true)
						.some( ([sname,_]) => targetActor.statuses.has(sname as StatusEffectId));
				}
			});
		}
		case "flag-state": {
			const targetActor = getSubjectActors(condition, situation,  "conditionTarget")[0];
			if (!targetActor) {return undefined;}
			return targetActor.getFlagState(condition.flagId);
		}

		case "is-same-arcana": {
			if (!situation.attacker) {return undefined;}
			const actor = PersonaDB.findActor(situation.attacker);
			if(!situation.target) {
				return undefined;
			}
			const targetActor = getSubjectActors(condition, situation,  "conditionTarget")[0];
			if (!targetActor) {return undefined;}
			return actor.system.tarot == targetActor.system.tarot;
		}

		case "target-owner-comparison": {
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			const target2 = getSubjectActors(condition, situation, "conditionTarget2")[0];
			if (!target || !target2) {return undefined;}
			return target == target2;
		}
		case "weather-is": {
			const weather = PersonaCalendar.getWeather();
			const comparison = condition.weatherComparison;
			if (typeof comparison == "string") {
				return condition.weatherComparison == weather;
			}
			return comparison[weather] ?? false; 
		}

		case "weekday-is": {
			const weekday = PersonaCalendar.getCurrentWeekday();
			return condition.days[weekday];
		}

		case "social-target-is": {
			const arr = getSubjects(condition, situation, "conditionTarget");
			if (!arr) {return undefined;}
			return arr.some( target => {
				const desiredActor = getSocialLinkTarget(condition.socialLinkIdOrTarot, situation, condition.source);
				return target == desiredActor;
			});
		}

		case "social-target-is-multi": {
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!target) { return undefined; }
			const actors= multiCheckToArray(condition.socialLinkIdOrTarot) as SocialLinkIdOrTarot[];
			return actors.some(actor => getSocialLinkTarget(actor, situation, condition.source) == target);
		}

		case "shadow-role-is": {
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!target) {return undefined;}
			if (!target.isShadow()) {return false;}
			if (typeof condition.shadowRole == "string") {
				return (condition.shadowRole == target.system.role || target.system.role2 == condition.shadowRole);
			}
			return multiCheckContains(condition.shadowRole, [target.system.role, target.system.role2]);
		}

		case "active-scene-is": {
			const scene = game.scenes.active;
			if (!scene) {return false;}
			return scene.id == condition.sceneId;
		}

		case "is-gm": {
			const user = getUser(condition.userComparisonTarget, situation);
			return user?.isGM ?? undefined;
		}

		case "has-item-in-inventory": {
			const item = game.items.get(condition.itemId);
			if (!item) {return undefined;}
			const targets = getSubjectActors(condition, situation,  "conditionTarget");
			if (!targets) {return undefined;}
			return targets.some( target => {
				const itemList = condition.equipped
					? target.equippedItems()
					: target.items.contents;
				return itemList.some(x=> x.name == item.name && (("amount" in x.system)? x.system.amount > 0 : true ));
			});
		}

		case "creature-type-is": {
			const target = getSubjectActors(condition, situation,  "conditionTarget")[0];
			if (!target) {return undefined;}
			return multiCheckContains(condition.creatureType, [target.system.creatureType]);
		}

		case "social-availability": {
			return resolveSocialAvailabilityCheck(condition, situation);
		}

		case "cameo-in-scene": {
			return Boolean(situation.cameo);
		}

		case "arcana-is": {
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!target) {return undefined;}
			const tarot = target.system.tarot;
			if (!tarot) {return undefined;}
			return target.system.tarot == condition.tarot;
		}

		case "logical-and":
		case "logical-or": {
			const comp1 = {
				source: condition.source,
				owner: condition.owner,
				realSource: condition.realSource,
				...condition.comparison1 as NonDeprecatedPrecondition<Precondition>,
				//this is guaranteed to be nondeprecated by convertPrecondition function working deep into logical ors
			};
			const comp2 = {
				source: condition.source,
				owner: condition.owner,
				realSource: condition.realSource,
				...condition.comparison2 as NonDeprecatedPrecondition<Precondition>,
				//this is guaranteed to be nondeprecated by convertPrecondition function working deep into logical ors
			};
			if (condition.boolComparisonTarget == "logical-or") {
				return testPrecondition(comp1, situation) || testPrecondition(comp2, situation);
			} else {
				return testPrecondition(comp1, situation) && testPrecondition(comp2, situation);
			}
		}
		case "scene-clock-name-is":
			return SceneClock.instance.clockName.toUpperCase().trim() == condition.clockName.toUpperCase().trim();
		case "using-meta-pod": {
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!target.isValidCombatant()) {return false;}
			return target.isUsingMetaPod();
		}
		case "actor-exists": {
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			return (target != undefined);
		}
		case "knows-power": {
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			const power = PersonaDB.allPowers().get(condition.powerId);
			if (!power) {return false;}
			return target.powers.includes(power);
		}
		case "has-class": {
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			return multiCheckContains(condition.classId, [target.class.id]);
		}
		case "status-to-be-inflicted": {
			if ("statusEffect" in situation && typeof situation.statusEffect == "string") {
				return multiCheckContains(condition.status, [situation.statusEffect]);
			}
			return false;
		}
		case "power-has":
			return powerHasConditional(condition, situation);
		case "roll-property-is":
			return rollPropertyIs(condition, situation);
		case "combat-comparison":
			return combatComparison(condition, situation);
		default :
			condition satisfies never;
			return undefined;
	}
}

function hasTagConditional(condition: SourcedPrecondition & BooleanComparisonPC & {boolComparisonTarget: "has-tag"}, situation: Situation) : boolean | undefined {
	switch (condition.tagComparisonType) {
		case undefined:
		case "power": {
			if (!situation.usedPower) {
				return undefined;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			if (!power) {return undefined;}
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
			const extraTags = "addedTags" in situation ? situation.addedTags ?? [] : [];
			const powerTags = power.tagList(user).concat(extraTags);
			if (condition.powerTag == undefined) {
				//weird Sachi Error
				const source = condition.source;
				if (source) {
					PersonaError.softFail(`Error in ${source.name}, no Power Tags provided`, condition, situation, source);
				} else {
					PersonaError.softFail(`No power tags provided in unsourced Power`, condition, situation, source);
				}
				return undefined;
			}
			const tagIds = powerTags.flatMap( x=> typeof x == "string" ? [x] : [x.id, x.system.linkedInternalTag]);
			return multiCheckContains(condition.powerTag, tagIds);
		}
		case "actor": {
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!target) {return undefined;}
			return multiCheckTest(condition.creatureTag, x => target.hasCreatureTag(x));
		}
		case "roll": {
			const rollTags = (situation.rollTags ?? [])
			.flatMap (tag => typeof tag == "string"? [tag] : [tag.id, tag.system.linkedInternalTag]);
			return multiCheckContains(condition.rollTag, rollTags);
		}
		case "weapon":{
			const target = getSubjectActors(condition, situation, "conditionTarget")[0];
			if (!target || !target.weapon || target.isNPC()) {return undefined;}
			const tagCheck = condition.rollTag;
			const tagIds = target.weapon.tagList(target).flatMap( x=> typeof x == "string" ? [x] : [x.id, x.system.linkedInternalTag]);
			return multiCheckContains(tagCheck, tagIds);
		}
		default:  {
			condition satisfies never;
			PersonaError.softFail(`Can't run hasTagConditional becuase tagComparionType is invalid (${(condition as Record<string,string>)["tagComparisonType"]})`);
			return undefined;
		}
	}
}

function booleanComparison(condition : SourcedPrecondition & {type: "boolean"}, situation: Situation): boolean {
	// if (condition.type != "boolean") {throw new PersonaError("Not a boolean comparison");}
	const testState = getBoolTestState(condition, situation);
	if (testState === undefined) {return false;}
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

function getSubjectTokens<K extends string, T extends Sourced<Record<K, ConditionTarget>>>( cond: T, situation: Situation, field : K): PToken[] {
	const subjects = getSubjects(cond, situation, field)
		.filter( subject =>  subject instanceof TokenDocument);
	return subjects;
}

export function getSubjectActors<K extends string, T extends Sourced<Record<K, ConditionTarget>>>( cond: T, situation: Situation, field : K): (ValidAttackers | NPC) []{
	const subjects = getSubjects(cond, situation, field)
		.map( subject => subject instanceof TokenDocument ? subject.actor : subject);
	return subjects;
}

export function getSocialLinkTarget(socialLinkIdOrTarot: SocialLinkIdOrTarot, situation: Situation, source: N<Sourced<object>["source"]>): NPC | PC | undefined {
	if (socialLinkIdOrTarot == undefined ) {return undefined;}
	let targetIdOrTarot : SocialLinkIdOrTarot | undefined = socialLinkIdOrTarot;
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
	if (!targetIdOrTarot) {return undefined;}
	return resolveActorIdOrTarot(targetIdOrTarot as string);
}

export function resolveActorIdOrTarot (targetIdOrTarot: string)  {
	const idTest = PersonaDB.getActorById(targetIdOrTarot);
	if (idTest != undefined) {
		if (idTest.isNPCAlly()) {
			return idTest.getNPCProxyActor();
		}
		if (idTest.isPC() || idTest.isNPC()) {
			return idTest;
		}
	}
	// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
	return PersonaDB.getSocialLinkByTarot(targetIdOrTarot as TarotCard | Tarot["id"] | SocialLink["id"]);
}

function getSubjects<K extends string, T extends Sourced<Record<K, ConditionTarget>>>( cond: T, situation: Situation, field : K) : (PToken | ValidAttackers | NPC) []{
	if (!(field in cond)) {
		Debug(cond);
		Debug(situation);
		return [];
	}
	const condTarget = cond[field];
	switch (condTarget) {
		case "owner":
			//owner of the power in question
			if (cond.owner) {
				try {
					const owner = PersonaDB.findActor(cond.owner);
					if (game.combat) {
						const combatant = game.combat.getCombatantByActor(owner);
						if (combatant) { return [combatant.token as PToken];}
					}
					if (owner) { return [owner as ValidAttackers];}
				} catch (e) {
					//if owner can't be found
					if (e instanceof Error) {
						console.log(e, e.stack);
						Debug(e);
					}
				}
			}
			if (cond.source && cond.source.parent instanceof PersonaActor) {
				const parent = cond.source.parent;
				if (parent instanceof PersonaActor && parent.isValidCombatant()) {return [parent];}
			}
			if ("actorOwner" in cond && cond.actorOwner) {
				const tok = 	PersonaCombat.getPTokenFromActorAccessor(cond.owner as NonNullable<SourcedPrecondition["owner"]>);
				return tok ? [tok] : [];
			}
			return [];
		case "attacker":
			if (situation.attacker?.token){
				const tok =  PersonaDB.findToken(situation.attacker.token) as PToken ;
				return tok ? [tok] : [];
			} else {
				const tok = situation.attacker ? PersonaDB.findActor(situation.attacker): undefined;
				return tok ? [tok] : [];
			}
		case "target": {
			if (situation.target?.token) {
				const tok = PersonaDB.findToken(situation.target.token) as PToken | undefined;
				return tok ? [tok] : [];
			}
			const target : UniversalActorAccessor<ValidAttackers | ValidSocialTarget> | undefined = situation.target ?? situation.socialTarget;
			const tok = target ? PersonaDB.findActor(target): undefined;
			return tok ? [tok] : [];
		}
		case "user":
			if (!situation.user) {return [];}
			if (situation?.user?.token) {
				const tok =  PersonaDB.findToken(situation.user.token) as PToken | undefined;
				return tok ? [tok] : [];
			} else {
				const tok=  PersonaDB.findActor(situation.user);
				return tok ? [tok] : [];
			}
		case "triggering-character":
			if ( !("triggeringCharacter" in situation)|| !situation.triggeringCharacter) {return [];}
			if (situation.triggeringCharacter.token) {
				const tok= PersonaDB.findToken(situation.triggeringCharacter.token) as PToken | undefined;
				return tok ? [tok] : [];
			} else {
				const actor =  PersonaDB.findActor(situation.triggeringCharacter);
				return actor ? [actor] : [];
			}
		case "cameo":
			if (!situation.cameo) {return [];}
			if (situation.cameo.token) {
				const tok =  PersonaDB.findToken(situation.cameo.token) as PToken | undefined;
				return tok ? [tok] : [];
			} else {
				const actor = PersonaDB.findActor(situation.cameo);
				return actor ? [actor] : [];
			}
		case "all-foes":
		case "all-allies": {
			PersonaError.softFail("all-foes and all-allies not allowed as part of a conditional");
			return [];
		}
		case "all-in-region": {
			let id : string | undefined;
			if ("triggeringRegionId" in situation) {
				id = situation.triggeringRegionId;
			}
			const region = Metaverse.getRegion(id);
			if (!region) {return [];}
			//have to get all in scene due to party token mucking it up
			// const tokens = Array.from(region.tokens)
			const tokens = region.parent.tokens.contents
			.filter( tok => tok.actor && tok.actor.isValidCombatant());
			return tokens as PToken[];
		}
		case "navigator": {
			const nav = PersonaDB.getNavigator();
			return nav ? [nav] : [];
		}
		default: {
			condTarget satisfies undefined;
			if (situation.target?.token) {
				const tok = PersonaDB.findToken(situation.target.token) as PToken | undefined;
				return tok ? [tok] : [];
			}
			if (!situation.user) {
				return [];
			}
			const actor=  PersonaDB.findActor(situation.user);
			return actor ? [actor] : [];
		}
	}
}

export function multiCheckToArray<
	 const T extends string,
	 > (multiCheck: MultiCheckOrSingle<T>) : T[] {
	if (typeof multiCheck == "string") {return [multiCheck];}
	return Object.entries(multiCheck)
		.filter( ([_, val]) => val == true)
		.map( ([k,_v]) => k as T);
}

export function multiCheckContains<const T extends R, const R extends string>(multiCheck: MultiCheck<T> | T, arrOrSingle: R[] | R) : boolean {
	const arr = Array.isArray(arrOrSingle)
	? arrOrSingle
	: [arrOrSingle];
	if (typeof multiCheck != "object") {
		return arr.includes(multiCheck);
	}
	return Object.entries(multiCheck)
		.filter( ([_, val]) => val == true)
		.some (([item, _]) => arr.includes(item as T));
}

function multiCheckTest<T extends string>(multiCheck: MultiCheck<T> | T, testFn: (x: T) => boolean) : boolean {
	if (typeof multiCheck != "object") {
		return testFn(multiCheck);
	}
	return Object.entries(multiCheck)
		.filter( ([_, val]) => val == true)
		.some (([item, _]) => testFn(item as T));

}

export function numberOfOthersWithResolver(condition: Sourced<NumberOfOthersWithComparison>, situation : Situation) : number | false {
	let targets : PersonaActor[] = [];
	getSubjectActors(condition, situation, "conditionTarget").some ( subject => {
		if (!subject) {return false;}
		const combat = game.combat as PersonaCombat | undefined;
		switch (condition.group) {
			case "allies": {
				if (subject.isNPC()) {return false;}
				if (combat) {
					const comb = combat.getCombatantByActor(subject);
					if (!comb) {return false;}
					const allies = combat.getAllies(comb);
					targets.push(...allies
						.map( x=> x.actor)
						.filter (x=> x != undefined)
					);
				} else {
					if (subject.getAllegiance() != "PCs") {
						return false;
					}
					const token= (game.scenes.current as PersonaScene).findActorToken(subject);
					if (!token) {return false;}
					const allies = PersonaCombat.getAllAlliesOf(token as PToken);
					targets= allies.map( x=> x.actor)
						.filter (x=> x != undefined);
				}
				break;
			}
			case "enemies": {
				if (!combat) {return false;}
				const token= (game.scenes.current as PersonaScene).findActorToken(subject);
				if (!token) {return false;}
				const foes = PersonaCombat.getAllEnemiesOf(token as PToken);
				targets.push( ...foes.map( x=> x.actor)
					.filter (x=> x != undefined)
				);
				break;
			}
			case "both": {
				if (!combat) {
					const token = (game.scenes.current as PersonaScene).findActorToken(subject);
					const allies = PersonaCombat.getAllAlliesOf(token as PToken);
					targets.push(...allies.map( x=> x.actor)
						.filter (x=> x != undefined)
					);
				} else {
					targets.push(...combat.combatants.contents
						.map( x=> x.actor)
						.filter (x=> x != undefined)
					);
				}
				break;
			}
			default:
				condition.group satisfies never;
				return false;
		}
	});
	if (targets.length == 0) {return false;}
	return targets.reduce(
		function (a,act) {
			const acc = (act as ValidAttackers).accessor;
			const situation : Situation = {
				user: acc,
				target: acc,
			};
			const sourcedP = {
				...PreconditionConverter.convertDeprecated(condition.otherComparison),
				source: condition.source,
				owner: condition.owner,
				realSource: condition.realSource,
			};
			return	a + (testPrecondition(sourcedP, situation) ? 1 : 0);
		}
		, 0);
}

function powerHasConditional(condition : SourcedPrecondition  & {type: "boolean"; boolComparisonTarget: "power-has"}, situation: Situation) : U<boolean> {
	if (!situation.usedPower) {return undefined;}
	const power = PersonaDB.findItem(situation.usedPower);
	switch (condition.powerProp) {
		case "power-target-type-is": {
			if (!power) {
				PersonaError.softFail(`Can't find power in conditional`);
				return undefined;
			}
			return multiCheckContains(condition.powerTargetType, [power.targets()]);
		}
		case "has-tag": {
			const conditionMod = {
				...condition,
				tagComparisonType: "power",
				boolComparisonTarget: "has-tag",
			} as const;
			return hasTagConditional(conditionMod, situation);
		}
		case "damage-type-is": {
			if (!power || power.isSkillCard()) {return undefined;}
			if (!situation.attacker && !situation.user) {return undefined;}
			const attackerAcc = situation.attacker ? situation.attacker : situation.user!;
			const attacker = PersonaDB.findActor(attackerAcc);
			if (!attacker) {return undefined;}
			const dtype = power.getDamageType(attacker);
			return multiCheckContains(condition.powerDamageType, [dtype as string]);
		}
		case "power-type-is": {
			return power.system.type == "power" && power.system.subtype == condition.powerType;

		}
		case "power-slot-is": {
			if (power.system.type == "consumable") {return undefined;}
			if (power.system.type == "skillCard") {return undefined;}
			const slot = condition.slotType;
			return slot[String(power.system.slot)];
		}
		case "power-name-is": {
			return power.id == condition.powerId;
		}
		case "is-consumable": {
			return power.isConsumable();
		}
		case "power-targets-defense":
			if (power.isSkillCard()) {
				return condition.defense == "none";
			}
			return power.system.defense == condition.defense;
		default:
			condition satisfies never;
			return undefined;
	}
}

function rollPropertyIs(condition : SourcedPrecondition  & {type: "boolean"; boolComparisonTarget: "roll-property-is"}, situation: Situation) : U<boolean> {
	switch (condition.rollProp) {
		case "is-critical":
			return situation.criticalHit ?? false;
		case "is-hit":
				return situation.hit === true;
		case "is-within-ailment-range":
				return "withinAilmentRange" in situation ? situation.withinAilmentRange ?? false : false;
		case "is-within-instant-death-range":
				return "withinInstantKillRange" in situation ? situation.withinInstantKillRange ?? false : false;
		default:
				condition.rollProp satisfies never;
			return undefined;
	}
}

function combatComparison(condition : SourcedPrecondition  & {type: "boolean"; boolComparisonTarget: "combat-comparison"}, situation: Situation)  : U<boolean> {
	if (condition.combatProp == "in-combat") {
		if (situation.activeCombat) {return true;}
		const combat = PersonaCombat.combat;
		if (combat && !combat.isSocial) {return true;}
		return false;
	}
	const subjects = getSubjects(condition, situation, "conditionTarget");
	if (!subjects || !subjects.at(0)) {return undefined;}
	const combat = game.combat as PersonaCombat;
	switch (condition.combatProp) {
		case "engaged": {
			if (!combat) {return undefined;}
			return subjects.some( subject => {
				if (subject instanceof PersonaActor) {
					if (subject.isNPC()) {return false;}
				}
				const subjectToken = subject instanceof TokenDocument ? PersonaDB.getUniversalTokenAccessor(subject) : combat.getToken((subject).accessor);
				if (!subjectToken) {
					// PersonaError.softFail(`Can't find token for ${subject?.name}`);
					return false;
				}
				return combat.isEngagedByAnyFoe(subjectToken);
			});
		}
		case "is-dead": {
			return subjects.some( target => {
				const targetActor = target instanceof PersonaActor ? target : target.actor;
				return targetActor.hp <= 0;
			});
		}
		case "struck-weakness": {
			if (!situation.usedPower) {
				return false;
			}
			for (const target of subjects) {
				const targetActor = target instanceof PersonaActor ? target : target.actor;
				const power = PersonaDB.findItem(situation.usedPower);
				if (targetActor.system.type == "npc") {continue;}
				if (power.system.type == "skillCard") {continue;}
				if (!situation.attacker) {continue;}
				const attacker = PersonaDB.findActor(situation?.attacker);
				const resist = (targetActor as PC | Shadow).persona().elemResist((power as Usable).getDamageType(attacker));
				if (resist == "weakness") {return true;}
			}
			return false;
		}
		case "is-distracted": {
			const target = getSubjectActors(condition, situation,  "conditionTarget")[0];
			if (!target) {return undefined;}
			return target.isDistracted();
		}
		case "engaged-with" : {
			if (!combat) {return undefined;}
			const target = getSubjectTokens(condition, situation, "conditionTarget")[0];
			const target2 = getSubjectTokens(condition, situation, "conditionTarget2")[0];
			if (!target || !target2) {return undefined;}
			const tok1 = PersonaDB.getUniversalTokenAccessor(target);
			const tok2 = PersonaDB.getUniversalTokenAccessor(target2);
			return combat.isEngaging(tok1, tok2);
		}
		case "in-melee-with": {
			if (!combat) {return undefined;}
			const target = getSubjectTokens(condition, situation, "conditionTarget")[0];
			const target2 = getSubjectTokens(condition, situation, "conditionTarget2")[0];
			if (!target || !target2) {return undefined;}
			const tok1 = PersonaDB.getUniversalTokenAccessor(target);
			const tok2 = PersonaDB.getUniversalTokenAccessor(target2);
			return combat.isInMeleeWith(tok1, tok2);
		}
		case "is-resistant-to": {
			return subjects.some( target => {
				const targetActor = target instanceof PersonaActor ? target : target.actor;
				const arr = typeof condition.powerDamageType == "string" ? [condition.powerDamageType] : multiCheckToArray(condition.powerDamageType);
				return arr.some( dtype => {
					if (dtype == "by-power") {
						if (!situation.usedPower) { return undefined; }
						const power = PersonaDB.findItem(situation.usedPower);
						if (power.system.type == "skillCard") {return undefined;}
						if (!situation.attacker) {return undefined;}
						const attacker = PersonaDB.findActor(situation?.attacker);
						dtype = (power as Usable).getDamageType(attacker);
					}
					if (targetActor.system.type == "npc") {return undefined;}
					const resist = (targetActor as PC | Shadow).persona().elemResist(dtype);
					switch (resist) {
						case "resist": case "block": case "absorb": case "reflect": return true;
						case "weakness": case "normal": return  false;
						default:
							resist satisfies never;
							return false;
					}
				});
			});
		}
		case "is-enemy":{
			const target = getSubjectTokens(condition, situation,   "conditionTarget")[0];
			const target2 = getSubjectTokens(condition, situation, "conditionTarget2")[0];
			if (!target || !target2) {return undefined;}
			const combat = game.combat as PersonaCombat;
			if (!combat) {return undefined;}
			const enemies = combat.getAllEnemiesOf(target);
			return enemies.includes(target2);
		}
		default:
			condition satisfies never;
	}


}


function resolveSocialAvailabilityCheck(condition: SourcedPrecondition & {type: "boolean", boolComparisonTarget: "social-availability" }, situation: Situation) :U<boolean>{
	if (!condition.conditionTarget) {
		condition.conditionTarget = "user";
	}
	let target1 = getSubjectActors(condition, situation,  "conditionTarget")[0];
	if (!target1) {
		if (!situation.user) {return undefined;}
		target1 = PersonaDB.findActor(situation.user);
		if (!target1) {return undefined;}
	}
	if (target1.system.type == "shadow") {return undefined;}
	switch (condition.socialTypeCheck) {
		case "relationship-type-check": {
			const target2 = getSocialLinkTarget(condition.socialLinkIdOrTarot ?? "", situation, condition.source);
			const link = target1.socialLinks.find(x=>x.actor == target2);
			if (!link) {return undefined;}
			return link.relationshipType.toUpperCase() == condition.relationshipType.toUpperCase();
		}
		case "is-social-disabled":
			return target1.isSociallyDisabled();
		case "is-available": {
			if (target1.system.type != "pc") {
				return undefined;
			}
			const target2 = getSocialLinkTarget(condition.socialLinkIdOrTarot ?? "", situation, condition.source);
			if (!target2) {return undefined;}
			return target1.isAvailable(target2);
		}
		case "is-dating": {
			const target2 = getSocialLinkTarget(condition.socialLinkIdOrTarot ?? "", situation, condition.source);
			if (!target2) {return undefined;}
			return target1.isDating(target2);
		}
		default:
			condition satisfies never;
			PersonaError.softFail(`Unexpected social check ${(condition as Record<string,string>)?.socialTypeCheck}`);
			Debug(condition);
			Debug(situation);
			return undefined;
	}
}
