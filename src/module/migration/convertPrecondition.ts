import {NonDeprecatedPrecondition} from "../../config/precondition-types.js";

export class PreconditionConverter {

	static convertDeprecated ( cond: Precondition) : NonDeprecatedPrecondition<Precondition> {
		switch (cond.type) {
			case "boolean":
				return this.convertBoolean (cond);
			case "numeric":
				return cond;
      case "on-trigger":
        return this.convertTriggered(cond);
			default:
				return cond;
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


