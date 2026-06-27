import {VariableTypeSpecifier} from "../../config/consequence-types.js";
import {NumericComparator} from "../../config/numeric-comparison.js";
import {DeprecatedPrecondition, NonDeprecatedPrecondition} from "../../config/precondition-types.js";
import {PersonaError} from "../persona-error.js";

export class PreconditionConverter {

	static convertDeprecated ( cond: Precondition) : NonDeprecatedPrecondition<Precondition> {
		switch (cond.type) {
			case "boolean":
				return this.convertBoolean (cond);
			case "numeric":
				return this.convertNumeric(cond);
      case "on-trigger":
        return this.convertTriggered(cond);
			default:
				return cond;
		}
	}

  static convertNumeric (cond: Precondition & {type: "numeric"}): NonDeprecatedPrecondition<Precondition> {
    const dep = cond as DeprecatedPrecondition<typeof cond>;
    switch (dep.comparisonTarget) {
      case "percentage-of-hp":
      case "percentage-of-mp": {
        const comparator = this.convertNumericComparator(dep, 100);
        const comparisonTarget = dep.comparisonTarget == "percentage-of-hp" ? "health-percentage" : "magic-percentage";
        return {
          type: "numeric",
          comparisonTarget,
          conditionTarget: dep.conditionTarget!,
          ...comparator,
        } satisfies NonDeprecatedPrecondition;
      }
      case "escalation":
        return {type: "never"};
      case "social-variable": {
        const comparator = this.convertNumericComparator(dep);
        return {
          ...dep as VariableTypeSpecifier,
          type: "numeric",
          comparisonTarget: "variable-value",
          ...comparator,
        } satisfies NonDeprecatedPrecondition;
      }
      default:
        dep.comparisonTarget satisfies never;
        return cond as NonDeprecatedPrecondition<Precondition>;
    }
  }


  private static convertNumericComparator(comp: NumericComparator, mult : number = 1) : NumericComparator {
    switch (comp.comparator)  {
      case "odd": case "even":
        return {
          comparator: comp.comparator,
        };
      case "range": {
        const num = typeof comp.num == "number" ? comp.num * mult : comp.num;
        if (typeof num != "number" && mult != 1 ) {
          console.warn(`Consequence amount can't be multiplied by ${mult}`);
          Debug(comp);
        }
        return {
          comparator: comp.comparator,
          high: comp.high * mult,
          num,
        };
      }
      default: {
        const num = typeof comp.num == "number" ? comp.num * mult : comp.num;
        if (typeof num != "number" && mult != 1 ) {
          console.warn(`Consequence amount can't be multiplied by ${mult}`);
          Debug(comp);
        }
        return {
          comparator: comp.comparator,
          num,
        };
      }
    }
  }

  static convertTriggered( cond: Precondition & {type: "on-trigger"}) : NonDeprecatedPrecondition<Precondition> {
    const head= {
      type : "on-trigger",
    } as const;
    switch (cond.trigger) {
      case "on-combat-start":
      case "on-combat-start-global":
        return {
          ...head,
          trigger: "on-combat-start-dual",
          global: cond.trigger.includes("global"),
        };
      case "on-combat-end":
      case "on-combat-end-global":
        return {
          ...head,
          trigger: "on-combat-end-dual",
          global: cond.trigger.includes("global"),
        };
      case "on-metaverse-turn":
        return {
          ...head,
          trigger: "on-metaverse-turn-dual",
          global: true,
        };
      case "on-enter-region":
        return {
          ...head,
          trigger: "on-enter-region-dual",
          global: true,
        };
      case "on-clock-overflow":
        if (!("triggeringClockId" in cond) || typeof cond.triggeringClockId != "string") {
          PersonaError.softFail(`Trouble converting precondtion ${cond.trigger}, no triggering clock Id`);
          return  {
            ...head,
            triggeringClockId: "",
            trigger: "on-clock-overflow-dual",
            global: true,
          };
        }
        return {
          ...head,
          triggeringClockId: cond.triggeringClockId,
          trigger: "on-clock-overflow-dual",
          global: true,
        };
      default:
        return cond;
    }
  }

	static convertBoolean ( cond: Precondition & {type: "boolean"}) : NonDeprecatedPrecondition<Precondition> {
		switch (cond.boolComparisonTarget) {
			case "is-critical":
			case "is-within-ailment-range":
			case "is-within-instant-death-range":
			case "is-hit":
				return {
					...cond,
					boolComparisonTarget:"roll-property-is",
					rollProp: cond.boolComparisonTarget,
					___deprecated : undefined,
				};
			case "is-enemy":
			case "engaged-with":
				return {
					...cond,
					boolComparisonTarget:"combat-comparison",
					combatProp: cond.boolComparisonTarget,
					___deprecated : undefined,
				};
			case"struck-weakness":
			case "is-dead":
			case "is-distracted":
			case "engaged":
				return {
					...cond,
					boolComparisonTarget:"combat-comparison",
					combatProp: cond.boolComparisonTarget,
					___deprecated : undefined,
				};
			case "in-combat":
				return {
					...cond,
					boolComparisonTarget:"combat-comparison",
					combatProp: cond.boolComparisonTarget,
					___deprecated : undefined,
				};
			case "is-resistant-to":
				return {
					...cond,
					boolComparisonTarget:"combat-comparison",
					combatProp: cond.boolComparisonTarget,
					___deprecated : undefined,
				};
			case "has-creature-tag":
				return {
					...cond,
					creatureTag: cond.creatureTag as Tag["id"],
					boolComparisonTarget:"has-tag",
					tagComparisonType: "actor",
					___deprecated : undefined,
				};
			case "metaverse-enhanced":
				return {
					type: "always",
				};
			case "power-target-type-is":
				return {
					...cond,
					powerProp: cond.boolComparisonTarget,
					boolComparisonTarget:"power-has",
					___deprecated : undefined,
				};
			case "power-type-is":
				return {
					...cond,
					powerProp: cond.boolComparisonTarget,
					boolComparisonTarget:"power-has",
					___deprecated : undefined,
				};
			case "power-slot-is":
				return {
					...cond,
					powerProp: cond.boolComparisonTarget,
					boolComparisonTarget:"power-has",
					___deprecated : undefined,
				};
			case "damage-type-is":
				return {
					...cond,
					powerProp: cond.boolComparisonTarget,
					boolComparisonTarget:"power-has",
					___deprecated : undefined,
				};
			case "is-consumable":
				return {
					...cond,
					powerProp: cond.boolComparisonTarget,
					boolComparisonTarget:"power-has",
					___deprecated : undefined,
				};
			case "logical-or": {
				const comparison1 = this.convertDeprecated(cond.comparison1);
				const comparison2 = this.convertDeprecated(cond.comparison2);
				return {
					...cond,
					comparison1,
					comparison2,
				};
			}
			default:
				return cond;
		}
}
}


