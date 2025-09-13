import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { DAMAGETYPES } from "../../config/damage-types.js";
import { MultiCheck } from "../../config/precondition-types.js";
import { ConditionalEffectManager } from "../conditional-effect-manager.js";
import { localize } from "../persona.js";
import { RESIST_STRENGTHS } from "../../config/damage-types.js";
import { PersonaCombat } from "../combat/persona-combat.js";
import { SocialLink } from "../actor/persona-actor.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { NPC, PC, NPCAlly } from "../actor/persona-actor.js";
import { PersonaSocial } from "../social/persona-social.js";
import { getSocialLinkTarget } from "../preconditions.js";
import { Usable } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";
import { DamageType } from "../../config/damage-types.js";
import { PowerContainer } from "../item/persona-item.js";
import { getSubjectActors } from "../preconditions.js";
import { PersonaError } from "../persona-error.js";
import { RESIST_STRENGTH_LIST } from "../../config/damage-types.js";
import { NumericComparisonV2 } from "../../config/numeric-comparison.js";

export class NumericV2 {
	static eval( condition: Precondition & {type: "numeric-v2"}, situation: Situation , source: Option<PowerContainer>) : boolean {
		const op1 = this.deriveOperand(condition.op1, situation, source);
		if (op1 === null) {return false;}
		if (op1 === true) {return true;}
		const comparator = condition.comparator;
		if (typeof op1 != "number") {
			PersonaError.softFail("Operation 1 can't be a non-number");
			return false;
		}
		const op2 = this.deriveOperand(condition.op2, situation, source);
		if (typeof op2 == "number") {
			return this.numericOperands(comparator, op1, op2);
		}
		switch (true) {
			case op2 === null: return false;
			case op2 === true: return true;
			case op2 == "odd":
			case op2 == "even":
				return this.oddEven(comparator, op1, op2);
			default:
				return this.rangeOperand(comparator, op1, op2);
		}
	}

	static oddEven(comparator: (Precondition & {type: "numeric-v2"})["comparator"], op1: number, op2: "odd" | "even") : boolean {
		const comp : boolean = op1 % 2 == (op2 == "odd" ? 1 : 0) ;
		switch (comparator) {
			case "==":
				return comp == true;
			case "!=":
				return comp == false;
			default:
				PersonaError.softFail(`Operator ${comparator} is nonsense in an odd-even context`);
				return false;
		}
	}

	static rangeOperand (comparator: (Precondition & {type: "numeric-v2"})["comparator"], op1: number, op2: Range) : boolean {
		switch (comparator) {
			case "==" : return op1 >= op2.low && op1 <= op2.high;
			case "!=": return op1 < op2.low || op1 > op2.high;
			case ">=": return op1 >= op2.high;
			case "<=": return op1 <= op2.low;
			case "<": return op1 < op2.low;
			case ">": return op1 > op2.high;
		}

	}

	static numericOperands(comparator: (Precondition & {type: "numeric-v2"})["comparator"], op1: number, op2: number): boolean {
			switch (comparator) {
				case "==":
					return op1 == op2;
				case "!=":
					return op1 != op2;
				case ">=":
					return op1 >= op2;
				case "<=":
					return op1 <= op2;
				case "<":
					return op1 < op2;
				case ">":
					return op1 > op2;
			}
	}

	static deriveOperand ( op : NumericComparisonV2["op1"], situation: Situation, source: Option<PowerContainer>) : number | Range | OddEven | null | true {
		return null;
		//ESCAPE SO IT DOESN'T ERROR
		// switch (op.comparisonTarget) {
		// 	case "constant": {
		// 		return this.deriveConstant( op);
		// 	}
		// 	case "odd-even":
		// 		return op.oddEven ?? null;

		// 	case "clock-comparison": {
		// 		const clock = ProgressClock.getClock(op.clockId);
		// 		if (!clock) return null;
		// 		return clock.amt;
		// 	}

		// 	case "socialRandom":
		// 		if (situation.socialRandom == undefined) {
		// 			return null;
		// 		}
		// 		return situation.socialRandom;

		// 	case "round-count":
		// 		if (!game.combat) return null;
		// 		return game.combat.round ?? -1;


		// 	case "combat-result-based": {
		// 		const res = combatResultBasedNumericTarget(op, situation, source) ;
		// 		if (res === true) return true;
		// 		if (res === false) return null;
		// 		return res;
		// 	}
		// 	case "num-of-others-with": {
		// 		const res= numberOfOthersWithResolver(op, situation, source);
		// 		if (res === false) return null;
		// 		return res;
		// 	}
		// 	case "variable-value": {
		// 		let val: number | undefined;
		// 		if (op.varType == "actor") {
		// 			const subject = getSubjectActors(op, situation, source, "applyTo")[0];
		// 			if (subject == undefined) return null;
		// 			val = PersonaVariables.getVariable(op, subject);
		// 		} else {
		// 			val = PersonaVariables.getVariable(op, null);
		// 		}
		// 		if (val == undefined) return null;
		// 		return val;
		// 	}
		// 	case "roll-comparison": {
		// 		return this.rollComparison(op, situation, source);
		// 	}
		// 	case "deprecated":
		// 		return this.handleDeprecated(op, situation, source);
		// 	case "actor-stat":
		// 		return this.handleActorStat(op, situation, source);
		// 	default:
		// 		op satisfies never;
		// 		PersonaError.softFail("Bad Operand", op);
		// 		Debug(op);
		// 		return null;
		// }

	}


	static handleActorStat(op: NumericComparisonV2["op1"] & {comparisonTarget : "actor-stat"},situation : Situation, source: Option<PowerContainer>) : number | null | true {
		switch (op.subtype) {
			case "social-link-level": {
				if (!situation.user) {return null;}
				const actor = PersonaDB.findActor(situation.user);
				if (op.socialLinkIdOrTarot == "SLSource"){
					//in theory these should be preverified so we're automatically letting them through
					return true;
				}
				if (!actor  || !actor.isRealPC()) {return null;}

				const socialLink = getSocialLinkTarget(op.socialLinkIdOrTarot, situation, source);
				if (!socialLink) {
					return 0;
				}
				const link = actor.system.social.find(data=> data.linkId == socialLink.id);
				return link ? link.linkLevel : 0;
			}
			case "progress-tokens-with": {
				const targetActor = getSubjectActors(op, situation, source, "conditionTarget")[0];
				if (!targetActor || !targetActor.isSocialLink()) {
					return null;
				}
				const subjectAcc = situation.user ?? situation.attacker;
				if (!subjectAcc) {return null;}
				const subject = PersonaDB.findActor(subjectAcc);
				if (!subject.isPC()) {return null;}
				return subject.getSocialLinkProgress(targetActor.id);
			}
			case "has-resources": {
				if (!situation.user) {return null;}
				const actor = PersonaDB.findActor(situation.user);
				if (actor.system.type != "pc") {return null;}
				return actor.system.money ?? 0;
			}
			case "student-skill": {
				if (!situation.user) {return null;}
				const actor = PersonaDB.findActor(situation.user);
				if (actor.system.type != "pc") {return null;}
				return actor.system.skills[op.studentSkill] ?? 0;
			}
			case "talent-level": {
				if (!situation.user) {return null;}
				const user = PersonaDB.findActor(situation.user);
				//@ts-expect-error some reason
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				const sourceItem = "sourceItem" in condition ? PersonaDB.findItem(condition.sourceItem) : "";
				const id = sourceItem ? sourceItem.id : undefined;
				if (!id) {
					return null;
				}
				return user.persona().getTalentLevel(id);

			}
			case "character-level": {
				if (!situation.user) {return null;}
				const actor = PersonaDB.findActor(situation.user);
				return actor.system.combat.classData.level;
			}
			case "links-dating": {
				const subjectAcc = situation.user ?? situation.attacker;
				if (!subjectAcc) {return null;}
				const subject = PersonaDB.findActor(subjectAcc);
				if (!subject) {return null;}
				if ( subject.system.type != "pc") {return 0; }
				return subject.system.social
				.filter( x=> x.isDating || x.relationshipType == "DATE")
				.length;
			}
			case "resistance-level": {
				const subject = getSubjectActors(op, situation, source, "conditionTarget")[0];
				if (!subject) {return null;}
				let element : DamageType | "by-power" = op.element;
				if (element == "by-power") {
					if (!situation.usedPower) {return null;}
					const power = PersonaDB.findItem(situation.usedPower);
					if (power.system.type == "skillCard") {return null;}
					if (!situation.attacker) {return null;}
					const attacker = PersonaDB.findActor(situation?.attacker);
					element = (power as Usable).getDamageType(attacker);
					// element = power.system.dmg_type;
					if (element == "healing" || element == "untyped" || element == "all-out" || element =="none" ) {return null;}
				}
				if (subject.system.type == "npc") {return null;}
				const targetResist = subject.system.combat.resists[element] ?? "normal";
				return RESIST_STRENGTH_LIST.indexOf(targetResist);
			}

			case "total-SL-levels": {
				const subject : PersonaActor | undefined = getSubjectActors(op, situation, source, "conditionTarget")[0];
				if (!subject) {return null;}
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
						return null;
				}
				if (!targetActor) {return 0;}
				return PersonaDB.PCs()
				.reduce( (acc, pc) => acc + pc.getSocialSLWith(targetActor), 0);
			}

			case "health-percentage": {
				const subject = getSubjectActors(op, situation, source, "conditionTarget")[0];
				if (!subject) {return null;}
				return (subject.hp / subject.mhp) * 100;
			}

			case "percentage-of-hp": {
				const subject = getSubjectActors(op, situation, source, "conditionTarget")[0];
				if (!subject) {return null;}
				return subject.hp / subject.mhp;
			}
			case "percentage-of-mp":{
				const subject = getSubjectActors(op, situation, source, "conditionTarget")[0];
				if (!subject) {return null;}
				return subject.mp / subject.mmp;
			}

			case "energy": {
				const subject = getSubjectActors(op, situation, source, "conditionTarget")[0];
				if (!subject) {return null;}
				if (subject.system.type != "shadow") {return null;}
				return subject.system.combat.energy.value;
			}

			case "inspirationWith": {
				const subject = getSubjectActors(op, situation, source, "conditionTarget")[0];
				if (!subject) {return null;}
				const link = getSocialLinkTarget(op.socialLinkIdOrTarot, situation, source);
				if (!link) {return null;}
				return subject.getInspirationWith(link.id);
			}
			case "itemCount":  {
				const arr = getSubjectActors(op, situation, source, "conditionTarget");
				if (arr.length == 0) {return null;}
				return arr.reduce( (acc,subject) => {
					const item = game.items.get(op.itemId);
					if (!item) {return acc;}
					return acc + subject.items.contents
						.reduce( (a,x) => (x.name == item.name && ("amount" in x.system))
							? (a + x.system.amount)
							: a
							, 0);
				}, 0);
			}
			case "scan-level": {
				const targetActor = getSubjectActors(op, situation, source, "conditionTarget")[0];
				if (!targetActor || !targetActor.isValidCombatant()) {return null;}
				return targetActor.persona().scanLevelRaw;
			}
			default:
				op satisfies never;
				return null;
		}


	}


	static deriveConstant ( op: NumericComparisonV2["op1"] & {comparisonTarget: "constant"}) : number  | Range {
		switch (op.subtype) {
			case "number":
				return op.num;
			case "range":
				return {
					high: op.high,
					low: op.low
				};
			case "resistance-level":
				return RESIST_STRENGTH_LIST.indexOf(op.resistLevel);
			default:
				op satisfies never;
				PersonaError.softFail(`Invalid subtype for constant: ${op["subtype"]}`);
				return -999;
		}
	}

	static rollComparison( op: NumericComparisonV2["op1"] & {comparisonTarget: "roll-comparison"}, situation: Situation, _source: Option<PowerContainer>) : number | null {
		switch (op.rollType) {
			case "natural-roll":
				if (situation.naturalRoll == undefined)
					{return null;}
				return situation.naturalRoll ?? null;
			case "activation-roll":
					if (situation.naturalRoll == undefined) {return null;}
				if (!situation?.rollTags?.includes("activation"))
					{return null;}
				return situation.naturalRoll ?? null;
			case "opening-roll":
					if (situation.naturalRoll == undefined  || !situation.rollTags?.includes("opening")) {return null;}
				return situation.naturalRoll ?? null;
			case "total-roll":
					if (situation.rollTotal == undefined)
					{return null;}
				return situation.rollTotal ?? null;
			default:
					op.rollType satisfies never;
				PersonaError.softFail(`Unrecognized Roll Type ${op["rollType"]}`);
				return null;
		}
	}

	static handleDeprecated(op: NumericComparisonV2["op1"] & {comparisonTarget: "deprecated"}, _situation: Situation, _source: Option< PowerContainer>) : number | null {
		switch (op.deprecatedType) {
			case "social-variable":
				return PersonaSocial.getSocialVariable(op.variableId!) ?? null;
			case "escalation": {
				const combat = game.combat as PersonaCombat | undefined;
				if (!combat) {return null;}
				const die = combat.getEscalationDie();
				return die;
			}
			default:
					op.deprecatedType satisfies never;
				PersonaError.softFail(`Unknown Deprecated Type ${op["deprecatedType"]}`);
				return null;
		}
	}

	static prettyPrintCondition(  condition: Precondition & {type: "numeric-v2"}) : string {
		const op1 = this.prettyPrintOperand(condition.op1).trim();
		const op2 = this.prettyPrintOperand(condition.op2).trim();
		return `${op1} ${condition.comparator} ${op2}`;
	}


	private static prettyPrintOperand(op: NumericComparisonV2["op1"]): string {
		const cond  = op;
		switch (cond.comparisonTarget) {
			case "constant":
				switch (cond.subtype) {
					case "number":
						return String(cond.num);
					case "range":
						return `${cond.low} - ${cond.high}`;
					case "resistance-level":
						return localize(RESIST_STRENGTHS[cond.resistLevel]);
				}
			case "actor-stat":
				return this.prettyPrintActorStat(cond);
			case "odd-even":
				return cond.oddEven;
			case "socialRandom":
				return `Social Card Random Die`;
			case "round-count":
				return `round count`;
			case "clock-comparison":
				return `Clock ${cond.clockId}`;
			case "combat-result-based":
				const combatResult = ConditionalEffectManager.printCombatResultString(cond);
				return `${combatResult}`;
			case "num-of-others-with":
				return `Number of ${cond.group} that meet Special Condition`;
			case "variable-value": 
				return `Value of ${cond.varType} variable named ${cond.variableId}`;
			case "roll-comparison":
				switch (cond.rollType)  {
					case "natural-roll":
						return `Natural roll`;
					case "activation-roll":
						return "Activation Roll";
					case "opening-roll":
						return "Opening Roll";
					case "total-roll":
						return "Total Roll";
				}
			case "deprecated":
				return "Deprecated Condition";
		}

	}

	static prettyPrintActorStat(cond: NumericComparisonV2["op1"] & {comparisonTarget: "actor-stat"}) : string {
		switch (cond.subtype) {
			case "energy":
				return `Shadow Energy`;
			case "inspirationWith":
				return `Inspiration With Link ???`;
			case "itemCount":
				const item = game.items.get(cond.itemId);
				return `Has Amount of ${item?.name ?? "UNKNOWN"}`;
			case "social-link-level":
				const socialTarget  = PersonaDB.allActors()
					.find( x=> x.id == cond.socialLinkIdOrTarot)
					?? PersonaDB.socialLinks()
					.find(x=> x.tarot?.name  == cond.socialLinkIdOrTarot);
				const name = socialTarget ? socialTarget.displayedName : "Unknown";
				return `${name} SL `;
			case "progress-tokens-with":
					return `Progress tokens with ${cond.conditionTarget}`;
			case "total-SL-levels":
					return `Total SL levels among all PCs`;
			case "student-skill":
				const skill = this.translate(cond.studentSkill!, STUDENT_SKILLS);
				return `${skill}`;
			case "resistance-level":
				const damage = this.translate(cond.element, DAMAGETYPES);
				return `${damage} resistance`;
			case "talent-level":
				return `Talent Level `;
			case "has-resources":
				return `Resources `;
			case "character-level":
				return `Character Level`;
			case "links-dating":
				return `Amount of People being dated`;
			case "health-percentage":
			case "percentage-of-hp":
				return `Percentage of HP`;
			case "percentage-of-mp":
				return `Percentage of SP`;
			case "scan-level":
				return `Scan Level`;
			default:
				cond satisfies never;
				return "ERROR";
		}


	}

	static translate<const T extends string>(items: MultiCheck<T> | T, translationTable?: Record<T, string>) : string {
		return ConditionalEffectManager.translate(items, translationTable);
	}
}


type Range = {
	high: number,
	low: number,
}

type OddEven = "odd" | "even";
