import {Consequence, CONSEQUENCE_AMOUNT_ACTOR_PROPERTIES, ConsequenceAmount, ConsequenceAmountV2, LEVEL_GAIN_TARGETS, NonDeprecatedConsequence, SITUATION_PROPERTIES} from "../../config/consequence-types.js";
import {CREATURE_TAGS} from "../../config/creature-tags.js";
import {DAMAGETYPES, RESIST_STRENGTHS} from "../../config/damage-types.js";
import {DAYS} from "../../config/days.js";
import {DEFENSE_TYPES} from "../../config/defense-types.js";
import {DAMAGE_SUBTYPES, POWERTYPES, TARGETING} from "../../config/effect-types.js";
import {WEAPON_TAGS} from "../../config/equipment-tags.js";
import {ITEM_PROPERTIES, MODIFIERS_TABLE} from "../../config/item-modifiers.js";
import {CombatResultComparison} from "../../config/numeric-comparison.js";
import {POWER_TAGS} from "../../config/power-tags.js";
import {CONDITION_TARGETS, MultiCheck, NonDeprecatedPrecondition} from "../../config/precondition-types.js";
import {ROLL_TAGS_AND_CARD_TAGS} from "../../config/roll-tags.js";
import {CREATURE_TYPE, SHADOW_ROLE} from "../../config/shadow-types.js";
import {SLOTTYPES} from "../../config/slot-types.js";
import {STATUS_EFFECT_DURATION_TYPES, STATUS_EFFECT_TRANSLATION_TABLE} from "../../config/status-effects.js";
import {STUDENT_SKILLS} from "../../config/student-skills.js";
import {TAROT_DECK} from "../../config/tarot.js";
import {TRIGGERS} from "../../config/triggers.js";
import {WEATHER_TYPES} from "../../config/weather-types.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {ConditionalEffectManager} from "../conditional-effect-manager.js";
import {PersonaItem} from "../item/persona-item.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {localize} from "../persona.js";
import {multiCheckToArray} from "../preconditions.js";
import {ConditionalEffectC} from "./conditional-effect-class.js";

export class ConditionalEffectPrinter {
	static printEffects(effects: ConditionalEffectC[]) : string[] {
		return effects.map( x=> this.printEffect(x));
	}

	static printEffect(effect: ConditionalEffectC): string {
		return `${this.printConditions(effect.conditions)} ---- ${this.printConsequences(effect.consequences)}`;

	}
	static printConditions(cond: Precondition[]) : string {
		return ConditionalEffectManager.getConditionals(cond, null, null, null)
			.map( x=> this.printConditional(x))
			.join (", ");
	}

	static printConditional(cond: NonDeprecatedPrecondition<Precondition>) : string {
		switch (cond.type) {
			case "boolean":
				return this.#printBooleanCond(cond);
			case "numeric":
				return this.printNumericCond(cond);
			case "always":
				return "always";
			case "miss-all-targets":
				return "Miss All Targets";
			case "save-versus": { const saveType = this.translate(cond.status!, STATUS_EFFECT_TRANSLATION_TABLE);
				return `on save versus ${saveType}`;
			}
			case "on-trigger": {
				const trig = this.translate(cond.trigger, TRIGGERS);
				return `trigger: ${trig}`;
			}
			case "never":
				return "Never";
			case "disable-on-debug":
				return "Disabled on Debug Mode";
			case "is-hit":
				return `Roll is ${cond.booleanState ? "" : "not"} a success`;
			// case "numeric-v2":
			// 	return "Numeric V2 amount (not used)";
			// 	// return NumericV2.prettyPrintCondition(cond);
			case "diagnostic":
				return "Diagnostic breakpoint";
			default:
				cond satisfies never;
				PersonaError.softFail(`Unknown type ${(cond as {type?: string})?.type}`);
				return "ERROR";
		}
	}

	static translate<const T extends string>(items: MultiCheck<T> | T, translationTable?: Record<T, LocalizationString | string>) : string {
		if (typeof items == "string")  {
			return translationTable ? localize(translationTable[items] as LocalizationString) : items;
		}
		return Object.entries(items)
			.flatMap( ([k,v]) => v ? [k] : [])
			.map( (x:T)=> translationTable ? localize(translationTable[x] as LocalizationString) : x)
			.join(", ");
	}

	static #printBooleanCond (cond: Precondition & {type: "boolean"}) :string {
		const target1 = ("conditionTarget" in cond) ? this.translate(cond.conditionTarget, CONDITION_TARGETS) : "";
		const target2 = ("conditionTarget2" in cond) ? this.translate(cond.conditionTarget2, CONDITION_TARGETS): "" ;
		// const boolComparison = this.translate (cond.boolComparisonTarget, BOOLEAN_COMPARISON_TARGET);
		const not =  !cond.booleanState ? "not" : "";
		switch (cond.boolComparisonTarget) {
			case "engaged":
				return `${target1} is ${not} engaged with anyone`;
			case "engaged-with":
				return `${target1} is ${not} engaged with ${target2}`;
			case "metaverse-enhanced":
				return `metaverse is ${not} enhanced`;
			case "is-shadow":
				return `${target1} is ${not} enemy type`;
			case "is-pc":
				return `${target1} is ${not} PC type`;
			case "has-tag": {
				const tagName = this.getTagNameForHasTag(cond);
				return `used power ${not} has tag: ${tagName}`;
			}
			case "in-combat":
				return `is ${not} in combat`;
			case "is-critical":
				return `${not} critical hit/success`;
			case "is-hit":
				return `${not} hit/success`;
			case "is-dead":
				return `${target1} is ${not} dead`;
			case "target-owner-comparison":
				return `${target1} is ${not} equal to ${target2}`;
			case "damage-type-is": {
				const damageType = this.translate(cond.powerDamageType, DAMAGETYPES);
				return `Power Damage Type is ${not} ${damageType}`;
			}
			case "power-type-is": {
				const powerType = this.translate(cond.powerType, POWERTYPES);
				return `Power Type is ${not} ${powerType}`;
			}
			case "has-status": {
				const status = this.translate(cond.status, STATUS_EFFECT_TRANSLATION_TABLE);
				return `${target1} ${not} has status: ${status}`;
			}
			case "struck-weakness":
				return `attack ${not} targets a weakness`;
			case "is-resistant-to": {
				const damageType = this.translate(cond.powerDamageType, DAMAGETYPES);
				return `${target1} is ${not} resistant to ${damageType}`;
			}  case "is-same-arcana": 
				return `${target1} is ${not} the same arcana as attacker`; 
			case "flag-state":
				return `${target1} flag ${cond.flagId} is ${not} true`;
			case "is-consumable":
				return `used power/item is ${not} a consumable item`;
			case "power-target-type-is": {
				const targetType = this.translate(cond.powerTargetType, TARGETING);
				return `used power targets type is ${not}: ${targetType}`;
			}
			case "weather-is": {
				const weather = this.translate(cond.weatherComparison, WEATHER_TYPES);
				return `weather is ${not}: ${weather}`;
			}
			case "weekday-is": {
				const weekday = this.translate(cond.days, DAYS);
				return `weekday is ${not} : ${weekday}`;
			}
			case "social-target-is": { const link = cond.socialLinkIdOrTarot ? (game.actors.get(cond.socialLinkIdOrTarot as PersonaActor["id"]) as PersonaActor)?.displayedName : "ERROR";
				return `social Target is ${not} ${link}`;
			}
			case "social-target-is-multi": {
				const actors = multiCheckToArray(cond.socialLinkIdOrTarot)
				.map( x=> x ? (game.actors.get(x as PersonaActor["id"]) as PersonaActor)?.displayedName ?? x : "ERROR");
				return `social Target is ${not} ${actors.join(", ")}`;
			}
			case "shadow-role-is": {
				const shadowRole = this.translate(cond.shadowRole, SHADOW_ROLE);
				return `${target1} role is is ${not} ${shadowRole}`;
			}
			case "is-distracted":
				return `${target1} is ${not} distracted`;
			case "active-scene-is":
				return `Active Scene is ${not} ${cond.sceneId}`;
			case "is-gm":
				return `User is ${not} GM`;
			case "has-item-in-inventory": {
				const item = game.items.get(cond.itemId);
				return `${target1} ${not} has ${item?.name ?? "Unknown Item"} in Inventory`;
			}
			case "creature-type-is": {
				const creatureType = this.translate(cond.creatureType, CREATURE_TYPE);
				return `${target1} is ${not} of creature type: ${creatureType}`;
			}
			case "power-slot-is": {
				const slot = this.translate(cond.slotType, SLOTTYPES);
				return `Power is ${not} of slot type: ${slot}`;
			}
			case "social-availability":
				switch (cond.socialTypeCheck) {
					case "relationship-type-check":
						return `Relationship Type with ${target1} is ${not} ${cond.relationshipType}`;
					case "is-social-disabled":
						return `${target1} is ${not} socially Disabled`;
					case "is-available":
						return `${target1} is ${not} socially available`;
					case "is-dating":
						return `initiator is ${not} dating ${target1}`;
					default:
						cond satisfies never;
						return `ERROR`;
				}
			case "has-creature-tag": {
				const tags = this.translate(cond.creatureTag, CREATURE_TAGS);
				return `${target1} ${not} has Tag: ${tags}`;
			}
			case "cameo-in-scene": {
				return `Scene ${not} has a cameo `;
			}
			case "arcana-is": {
				const arcana = this.translate(cond.tarot, TAROT_DECK);
				return `Arcana is ${not} ${arcana}`;
			}
			case "is-enemy":
				return `${target1} is ${not} enemy of ${target2}`;
			case "logical-and": {
				const c1= this.printConditional(cond.comparison1 as NonDeprecatedPrecondition<Precondition>);
				const c2= this.printConditional(cond.comparison2 as NonDeprecatedPrecondition<Precondition>);
				return `(${c1} AND ${c2})`;
			}
			case "logical-or": {
				const c1= this.printConditional(cond.comparison1 as NonDeprecatedPrecondition<Precondition>);
				const c2= this.printConditional(cond.comparison2 as NonDeprecatedPrecondition<Precondition>);
				return `(${c1} OR ${c2})`;
			}
			case "scene-clock-name-is":
				return `Scene Clock is named ${cond.clockName}`;
			case "is-within-ailment-range":
				return `Attack Roll hits and is within ailment range`;
			case "is-within-instant-death-range":
				return `Attack roll hits and is within instant death range`;
			case "using-meta-pod":
				return `${target1} is using Meta Pod`;
			case "actor-exists":
				return `${target1} is present in scene`;
			case "knows-power": {
				const pwr = PersonaDB.allPowers().get(cond.powerId);
				return `${target1} knows Power ${pwr?.displayedName ?? "UNKNOWN POWER"}`;
			}
			case "has-class": {
				const classes= multiCheckToArray(cond.classId);
				const CharClasses = classes
				.map( id => PersonaDB.getClassById(id)?.name ?? "Unknown class")
				.join(" ,");
				;
				return `${target1} has Class: ${CharClasses}`;
			}
			case "status-to-be-inflicted":
				return `Status ${this.translate(cond.status, STATUS_EFFECT_TRANSLATION_TABLE)} is about to be inflicted`;
			case "power-has":
				return this.printPowerHasConditional(cond);
			case "roll-property-is":
				return this.printRollPropertyConditional(cond);
			case "combat-comparison":
				return this.printCombatComparison(cond);
      case "special-boolean":
        return this.printSpecialBooleanComparison(cond);
			default:
				cond satisfies never;
				return "";
		}
	}

	static printPowerHasConditional(cond: Precondition & {type: "boolean"; boolComparisonTarget: "power-has"}) : string {
		const not =  !cond.booleanState ? "not" : "";
		switch (cond.powerProp) {
			case "has-tag": {
				const modCond = {
					...cond,
					boolComparisonTarget: "has-tag",
					tagComparisonType: "power",
				} as const;
				const tagName = this.getTagNameForHasTag(modCond);
				return `used power ${not} has tag: ${tagName}`;
			}
			case "damage-type-is":{
				const damageType = this.translate(cond.powerDamageType, DAMAGETYPES);
				return `Power Damage Type is ${not} ${damageType}`;
			}
			case "power-type-is": {
				const powerType = this.translate(cond.powerType, POWERTYPES);
				return `Power Type is ${not} ${powerType}`;
			}
			case "power-target-type-is": {
				const targetType = this.translate(cond.powerTargetType, TARGETING);
				return `used power targets type is ${not}: ${targetType}`;
			}
			case "power-slot-is": {
				const slot = this.translate(cond.slotType, SLOTTYPES);
				return `Power is ${not} of slot type: ${slot}`;
			}
			case "power-name-is": {
				const power = PersonaDB.getPower(cond.powerId);
				const powerName = power?.name ?? "ERROR";
				return `Power is ${powerName}`;
			}
			case "is-consumable":
				return `Usable is Consumable Item`;
			case "power-targets-defense":
				return `Power Targets ${not} ${this.translate(cond.defense, DEFENSE_TYPES)}`;
			default:
				cond satisfies never;
				return "ERROR";
		}

	}

	static printRollPropertyConditional(cond: Precondition & {type: "boolean"; boolComparisonTarget: "roll-property-is"}) : string {
		const not =  !cond.booleanState ? "not" : "";
		switch (cond.rollProp) {
			case "is-critical":
				return `${not} critical hit/success`;
			case "is-hit":
				return `${not} hit/success`;
			case "is-within-ailment-range":
				return `Attack Roll hits and is ${not} within ailment range`;
			case "is-within-instant-death-range":
				return `Attack roll hits and is ${not} within instant death range`;
			case "is-fumble":
				return `is ${not} Fumble`;
			default:
				cond.rollProp satisfies never;
				return "ERROR";
		}
	}

	static printCombatComparison(cond: Precondition & {type: "boolean"; boolComparisonTarget: "combat-comparison"}) : string {
		const target1 = ("conditionTarget" in cond) ? this.translate(cond.conditionTarget, CONDITION_TARGETS) : "";
		const target2 = ("conditionTarget2" in cond) ? this.translate(cond.conditionTarget2, CONDITION_TARGETS): "" ;
		const not =  !cond.booleanState ? "not" : "";
		switch (cond.combatProp) {
			case "in-combat":
				return `is ${not} in combat`;
			case "is-dead":
				return `${target1} is ${not} dead`;
			case "struck-weakness":
				return `attack ${not} targets a weakness`;
			case "is-distracted":
				return `${target1} is ${not} distracted`;
			case "engaged":
				return `${target1} is ${not} engaged with anyone`;
			case "engaged-with":
				return `${target1} is ${not} engaged with ${target2}`;
			case "is-resistant-to": {
				const damageType = this.translate(cond.powerDamageType, DAMAGETYPES);
				return `${target1} is ${not} resistant to ${damageType}`;
			}
			case "is-enemy":
				return `${target1} is ${not} enemy of ${target2}`;
			case "in-melee-with":
				return `${target1} is ${not} in melee range of ${target2}`;

      case "combat-result-is":
				return `Combat Result is ${cond.combatOutcome}`;
			default:
				cond satisfies never;
				return "ERROR";
		}
	}

    static printSpecialBooleanComparison(cond: Precondition & {type: "boolean"; boolComparisonTarget: "special-boolean"}) : string {
      switch (cond.specialType) {
        case "farming-can-harvest":
          return "Can harvest crops";
        case "farming-can-plant":
          return "Can Plant crops";
        default:
          cond.specialType satisfies never;
          return "ERROR";
      }
    }

	static getTagNameForHasTag(cond: Precondition & {type: "boolean"} & {boolComparisonTarget: "has-tag"}): string {
		switch (cond.tagComparisonType) {
			case undefined:
			case "power":
				return this.translate(cond.powerTag, POWER_TAGS);
			case "actor":
				return this.translate(cond.creatureTag, CREATURE_TAGS);
			case "roll":
				return this.translate (cond.rollTag, ROLL_TAGS_AND_CARD_TAGS);
			case "weapon":
				return this.translate (cond.rollTag, WEAPON_TAGS);
			default:
				cond satisfies never;
				return "ERROR";
		}
	}

	private static printNumericCond(cond: Precondition & {type: "numeric"}) : string {
		const endString = (cond: Precondition & {type: "numeric"} , derivedVar?: string) => {
			if (!("comparator" in cond)) {
				return "ERROR";
			}
			switch (cond.comparator) {
				case "odd":
					return "is Odd";
				case "even":
					return "is Even";
				case "==":
				case "!=":
				case ">=":
				case ">":
				case "<":
				case "<=":
					if ("num" in cond) {
						return `${cond.comparator} ${this.printConsequenceAmount(cond.num)}`;
					} else {
						return `${cond.comparator} ${derivedVar}`;
					}
				case "range":
					return `between ${this.printConsequenceAmount(cond.num)} and ${cond.high}`;
				default:
					cond satisfies never;
					return "ERROR";
			}
		};
		switch (cond.comparisonTarget) {
			case "natural-roll":
				return `natural roll ${endString(cond)}`;
			case "activation-roll":
				return `activation Roll ${endString(cond)}`;
			case "escalation":
				return `Escalation Die ${endString(cond)}`;
			case "total-roll":
				return `Roll Total ${endString(cond)}`;
			case "talent-level":
				return `Talent Level ${endString(cond)}`;
			case "social-link-level": {
				const socialTarget  = PersonaDB.allActors()
				.find( x=> x.id == cond.socialLinkIdOrTarot)
				?? PersonaDB.socialLinks()
				.find(x=> x.tarot?.name  == cond.socialLinkIdOrTarot);
				const name = socialTarget ? socialTarget.displayedName : "Unknown";
				return `${name} SL ${endString(cond)}`;
			}
			case "student-skill": {
				const skill = this.translate(cond.studentSkill!, STUDENT_SKILLS);
				return `${skill} ${endString(cond)}`;
			}
			case "character-level":
				return `Character Level ${endString(cond)}`;
			case "has-resources":
				return `Resources ${endString(cond)}`;
			case "resistance-level": {
				const resist = this.translate(cond.resistLevel, RESIST_STRENGTHS);
				const damage = this.translate(cond.element, DAMAGETYPES);
				return `${damage} resistance ${endString(cond, resist)}`;
			}
			case "health-percentage":
				return `Health Percentage ${endString(cond)}`;
			case "clock-comparison":
				return `Clock ${cond.clockId} ${endString(cond)}`;
			case "percentage-of-mp":
				return `Percentage of MP ${endString(cond)}`;
			case "percentage-of-hp":
				return `Percentage of MP ${endString(cond)}`;
			case "energy":
				return `Shadow Energy ${endString(cond)}`;

			case "socialRandom":
				return `Social Card d20 ${endString(cond)}`;
			case "inspirationWith":
				return `Has Inspiration With Link ??? ${endString(cond)}`;
			case "itemCount": {
				const item = game.items.get(cond.itemId);
				return `Has Amount of ${item?.name ?? "UNKNOWN"} ${endString(cond)}`;
			}
			case "opening-roll":
				return `Opening Roll natural value ${endString(cond)}`;
			case "links-dating":
				return `Amount of people being dated ${endString(cond)}`;
			case "social-variable":
				return `Value of Social variable ${cond.variableId} ${endString(cond)}`;
			case "round-count":
				return `Round Count ${endString(cond)}`;
			case "total-SL-levels":
				return `Total SL levels among all PCs ${endString(cond)}`;
			case "combat-result-based": {
				const combatResult = this.printCombatResultString(cond);
				return `${combatResult} ${endString(cond)}`;
			}
			case "num-of-others-with":
				//TODO: put in special condition
				return `Number of ${cond.group} that meet Special Condition ${endString(cond)}`;
			case "progress-tokens-with":
				return `Progress tokens with ${cond.conditionTarget} is ${endString(cond)}`;
			case "variable-value":
				return `Value of ${cond.varType} variable named ${cond.variableId} is ${endString(cond)}`;
			case "scan-level":
				return `Scan level of ${cond.conditionTarget} ${endString(cond)}`;
			case "advanced-number": {
				const operand1 =  this.printConsequenceAmount(cond.comparisonVal);
				return `${operand1} ${endString(cond)}`;
			}
			default:
				cond satisfies never;
				return "UNKNOWN CONDITION";
		}
	}

	static printCombatResultString(cons : CombatResultComparison): string {
		const non = cons.invertComparison ? "non-" : "";
		switch (cons.resultSubtypeComparison) {
			case "total-hits":
				return `Number of ${non}Misses`;
			case "total-knocks-down":
				return `Number of ${non}Knockdowns`;
			default:
				cons.resultSubtypeComparison satisfies never;
				return "ERROR";
		}
	}

	static printConsequences(cons: ConditionalEffectC["consequences"]) : string {
		return ConditionalEffectManager.getConsequences(cons, null , null, null)
			.map(x=> this.printConsequence(x))
			.filter(x => x)
			.join (", ");
	}

    static printConsequence (cons: NonDeprecatedConsequence) : string {
      switch (cons.type) {
        case "none":
          return "";
        case "modifier-new": {
          const modifiers = this.translate(cons.modifiedFields, MODIFIERS_TABLE);
          return `${modifiers}: ${this.printConsequenceAmount(cons.amount)}`;
        }
          // case "expend-slot":
          // return `expend Slot`;
        case "expend-item":
          return `expend item`;
        case "add-power-to-list": {
          const grantedPower = PersonaDB.getPower(cons.id);
          return `Add power to list ${grantedPower?.displayedName?.toString() ?? "ERROR"}`;
        }
        case "add-talent-to-list": {
          const grantedTalent = PersonaDB.getItemById(cons.id) as Talent;
          return `Add Talent to list ${grantedTalent?.displayedName?.toString() ?? "ERROR"}`;

			}
			case "other-effect":
				return this.#printOtherEffect(cons);
			case "set-flag":
				return `${cons.flagState ? "set" : "clear"} Flag ${cons.flagId}`;
			case "inspiration-cost":
				return `Inpsiration Cost : ${cons.amount}`;
			case "display-msg":
				return `Display Msg: ${cons.msg?.trim()}`;
			case "social-card-action":
				return this.#printSocialCardAction(cons);
			case "dungeon-action":
				return this.#printDungeonAction(cons);
			case "raise-resistance": {
				const resistType = this.translate(cons.resistType, DAMAGETYPES);
				const resistLevel = this.translate(cons.resistanceLevel, RESIST_STRENGTHS);;
				return `Raise ${resistType} Resistance ${resistLevel}` ; }
			case "lower-resistance" : {
				const resistType =this.translate(cons.resistType, DAMAGETYPES);
				const resistLevel = this.translate(cons.resistanceLevel, RESIST_STRENGTHS);;
				return `Lower ${resistType} Resistance ${resistLevel}` ;
			} case "use-power": {
				const power = PersonaDB.getPower(cons.powerId);
				return `Use Power ${power?.name}`;
			}
			case "alter-mp":
				return this.#printMPAlter(cons);
			case "modifier": {
				const modified = this.translate(cons.modifiedField, MODIFIERS_TABLE);
				const amount = this.printConsequenceAmount(cons.amount);
				return `${modified} ${amount}`;
			}
			case "teach-power": {
				if (cons.randomPower) {
					return "Random Power";
				} else {
					const power = PersonaDB.getPower(cons.id);
					return `Teach Power ${power?.displayedName?.toString() ?? "ERROR"}`;
				}
			}
			case "raise-status-resistance":
				return `${this.translate(cons.resistanceLevel, RESIST_STRENGTHS)} status ${this.translate(cons.statusName, STATUS_EFFECT_TRANSLATION_TABLE)}`;
			case "add-creature-tag": {
				const tag = this.translate(cons.creatureTag, CREATURE_TAGS);
				return `Add ${tag} tag`;
			}
			case "combat-effect":
				return this.#printCombatEffect(cons);
			case "alter-fatigue-lvl":
				return `Alter Fatigue Level ${cons.amount}`;
			case "alter-variable":
				if (cons.operator != "set-range") {
					return `Alter ${cons.varType} Variable ${cons.variableId} : ${cons.operator} ${this.printConsequenceAmount(cons.value)}`; } else {
						return `Alter ${cons.varType} Variable ${cons.variableId} : ${cons.operator} ${cons.min} - ${cons.max}`; }
			case "perma-buff":
				return `Add Permabuff ${cons.buffType} :${cons.value}`;
			case "play-sound":
				return `Play Sound: ${cons.soundSrc} (${cons.volume})`;
			case "gain-levels": {
				const gainTarget =this.translate(cons.gainTarget, LEVEL_GAIN_TARGETS);
				return `Gain ${cons.value} Levels for ${gainTarget}`;
			}
			case "cancel":
				return `Cancel Triggering Event`;
			case "inventory-action":
				return this.printInventoryAction(cons);
			case "set-roll-result":
				return `Set Roll Result to ${cons.result}`;
			default:
				cons satisfies never;
				return "ERROR";
		}

	}

    private static printInventoryAction (cons: Consequence & {type: "inventory-action"}) {
      if (cons.invAction == "harvest-crops") {
        return "Harvest grown crops";
      }
      const amount = this.printConsequenceAmount(cons.amount);
      switch (cons.invAction) {
        case "add-item": {
          return `Add ${amount} item`;
        }
        case "add-treasure": {
          const treasureLevel = this.printConsequenceAmount(cons.treasureLevel);
          return `Add ${amount} Treasure ${treasureLevel} , treasure Modifier:  ${cons.treasureModifier}, minLevel ${cons.minLevel}`;
        }
        case "remove-item":
          return `remove ${amount} item`;
        case "add-card-item":
          return `add ${amount ?? 1} of card Item`;
        case "plant-crops": {
          const itemName = PersonaDB.getItemById(cons.cropId)?.name ?? "ERROR";
          const daysToGrow = this.printConsequenceAmount(cons.daysToGrow);
          return `Plant ${amount} ${itemName} (growth Time ${daysToGrow})`;
        }
        default:
          cons satisfies never;
          return "ERROR";
      }
    }


	private static printConsequenceAmount(consAmt: ConsequenceAmount) : string {
		if (typeof consAmt =="number") {return String(consAmt);}
		switch (consAmt.type) {
			case "constant":
				return String(consAmt.val);
			case "random-range":
				return `Random (${consAmt.min} - ${consAmt.max})`;
			case "operation":
				return this.printConsAmountOperation(consAmt);
			case "variable-value":
				return `Variable: ${consAmt.varType} ${consAmt.variableId}`;
			case "item-property":
				return `${this.translate(consAmt.property, ITEM_PROPERTIES)} of ${consAmt.itemTarget} - $`;
			case "situation-property":
				return `${this.translate(consAmt.property, SITUATION_PROPERTIES)}`;
			case "actor-property":
				return `${this.translate(consAmt.property, CONSEQUENCE_AMOUNT_ACTOR_PROPERTIES)}`;
			default:
				consAmt satisfies never;
		}
		return `Unknown Complex Consequence Amount`;
	}

	static printConsAmountOperation( consAmt: ConsequenceAmountV2 & {type: "operation"} ) :string {
		const v1 = this.printConsequenceAmount(consAmt.amt1);
		const v2 = this.printConsequenceAmount(consAmt.amt2);
		switch (consAmt.operator) {
			case "add":
				return `${v1} + ${v2}`;
			case "subtract":
				return `${v1} - ${v2}`;
			case "divide":
				return `${v1} / ${v2}`;
			case "multiply":
				return `${v1} * ${v2}`;
			case "modulus":
				return `${v1} % ${v2}`;
			default:
				consAmt.operator satisfies never;
				return "ERROR";
		}
	}

	static #printCombatEffect( cons: Consequence & {type: "combat-effect"}) : string {
		switch (cons.combatEffect) {
			case "auto-end-turn":
				return `Automatically End Turn`;
			case "damage":
				return this.printDamageConsequence(cons);
			case "addStatus": {
				const status = this.translate(cons.statusName, STATUS_EFFECT_TRANSLATION_TABLE);
				const dur = cons.statusDuration;
				if (!dur) {return `ERROR`;}
				const duration = this.translate(dur, STATUS_EFFECT_DURATION_TYPES);
				return `Add Status ${status} (${duration})`;
			} case "removeStatus": {
				const status = this.translate(cons.statusName, STATUS_EFFECT_TRANSLATION_TABLE);
				return `Remove Status ${status}`;
			}
			case "extraAttack":
				return `extra attack`;
			case "extraTurn":
				return `Take an extra turn`;
			case "scan":
				return `Scan Target Level ${cons.amount}`;
			case "alter-energy":
				return `Energy ${cons.amount}`;
			case "apply-recovery":
				return `Apply Recovery`;
			case "alter-theurgy":
				return `Alter Theurgy Amount`;
			case "set-cooldown":
				return `Set Power Cooldown : ${cons.durationRounds} rounds`;
      case "add-power-tag-to-attack": {
        const tag = PersonaItem.resolveTag(cons.powerTag);
        return `Add Power Tag To Attack : ${tag instanceof PersonaItem ? tag.name : tag}`;
      }
			default:
				cons satisfies never;
				return "ERROR";
		}

	}

	static #printOtherEffect(cons: Consequence & {type:"other-effect"}) : string {
		switch (cons.otherEffect) {
			case "search-twice":
				return "search Twice";
			case "ignore-surprise":
				return "Ignore Surprise";
			default:
				cons.otherEffect satisfies never;
				return "ERROR";
		}
	}

	static #printSocialCardAction(cons: Consequence & {type:"social-card-action"}) : string {
		let signedAmount;
		if ("amount" in cons){
			signedAmount = this.printConsequenceAmount(cons.amount);
			// signedAmount = this.signedAmount(cons.amount);
		}
		switch (cons.cardAction) {
			case "stop-execution":
				return `stop card execution`;
			case "exec-event":
				return `Execute Event Chain ${cons.eventLabel}`;
			case "inc-events":
				return `Remaining events ${signedAmount}`;
			case "gain-money":
				return `Resources ${signedAmount}`;
			case "modify-progress-tokens":
				return `Progress Tokens ${signedAmount}`;
			case "alter-student-skill": {
				const skill = this.translate(cons.studentSkill, STUDENT_SKILLS);
				return `${skill} ${signedAmount}`;
			}
			case "modify-progress-tokens-cameo":
				return `Cameo Progress Tokens ${signedAmount}`;
			case "replace-card-events":
				return `Replace Card Events with events of card ${cons.cardId}`;
			case "add-card-events-to-list":
				return `Add Card Events card ${cons.cardId}`;
			case "set-temporary-variable":
				if (cons.operator != "set-range") {
					return `${cons.operator} ${cons.value} to social variable ${cons.variableId}`;
				} else {
					return `${cons.operator} ${cons.min} - ${cons.max} to social variable ${cons.variableId}`;
				}
			case "card-response":
				return `Chat Response`;
			case "append-card-tag":
				return `Add card tag: ${cons.cardTag}`;
			case "remove-cameo":
				return `Remove Cameo(s) from scene`;
			case "set-social-card-item":
				return `set social card item`;
			case "event-chain":
				return `Alter Event chain ${cons.chainAction}`;
      case "expend-downtime-actions":
        return `Expend all downtime actions`;
			default:
				cons satisfies never;
				return "ERROR";
		}
	}

	static #printDungeonAction(cons: Consequence & {type :"dungeon-action"}) : string {
		const signedAmount = "amount" in cons ? this.signedAmount(cons.amount) : 0;
		switch (cons.dungeonAction) {
			case "roll-tension-pool":
				return "Roll Tension pool";
			case "modify-tension-pool":
				return "Modify Tension Pool";
			case "modify-clock": {
				const clock = cons.clockId;
				return `${clock} ticks ${signedAmount}`;
			}
			case "close-all-doors":
				return `Close All Doors`;
			case "change-scene-weather":
				return `Change Scene Weather to ${cons.sceneWeatherType}`;
			case "set-clock": {
				const clock = cons.clockId;
				return `${clock} set to ${signedAmount}`;
			}
			case "rename-scene-clock": {
				return `Change Scene Clock details`;
			}
			case "disable-region": {
				return `Render Region Inactive`;
			}
			default:
				cons satisfies never;
				return "ERROR";
		}
	}

	static #printMPAlter(cons: Consequence & {type: "alter-mp"}): string {
		const signedAmount = this.signedAmount(cons.amount);
		switch (cons.subtype) {
			case "direct":
				return `MP ${signedAmount}`;
			case "percent-of-total":
				return `MP Cost ${signedAmount} % of total`;
			default:
				cons.subtype satisfies never;
				return "ERROR";
		}
	}

	static signedAmount(amt?: number): string {
		if (typeof amt != "number" ) {return "";}
		return amt > 0 ?`+${amt}` : `${amt}`;
	}

	static printDamageConsequence(cons: Consequence & {type: "combat-effect",combatEffect:"damage"}) : string {
		const damageType = "damageType" in cons ? this.translate(cons.damageSubtype, DAMAGE_SUBTYPES): "";
		switch (cons.damageSubtype) {
			case "constant":
				return `${this.printConsequenceAmount(cons.amount)} ${damageType} damage`;
			case "high":
				return `High Damage`;
			case "odd-even":
				return `Odd/Even Damage`;
			case "low":
				return `Low Damage`;
			case "allout":
				return `All Out Attack Damage`;
			case "multiplier":
				return `Damage Multiplier ${this.printConsequenceAmount(cons.amount)}`;
			case "percentage":
				return `damage/healing ${this.printConsequenceAmount(cons.amount)}% of target MHP`;
			case "mult-stack":
				return `Damage Multiplier (stacking) ${this.printConsequenceAmount(cons.amount)}`;
			case "percentage-current":
				return `damage/healing ${this.printConsequenceAmount(cons.amount)}% of target HP`;
			case "set-to-const":
				return `Set HP to ${this.printConsequenceAmount(cons.amount)}`;
			case "set-to-percent":
				return `Set HP to ${this.printConsequenceAmount(cons.amount)}%`;
			default:
				cons satisfies never;
				return "ERROR";
		}
	}

}
