import { Precondition } from "../config/precondition-types.js";
import { ModifierContainer } from "./item/persona-item.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { PersonaDB } from "./persona-db.js";

export class ErrorScanner {

	static async check() {
		await PersonaDB.waitUntilLoaded();
		this.deprecatedEffects();
	};

	static async deprecatedEffects( fix = false) {
		console.log("Running Error Check");
		const errors : PersonaItem [] = [];
		const actorList : PersonaActor[] = (PersonaDB.allActors())
			.concat(game.scenes.contents
			.flatMap( sc=> sc.tokens.contents
				.flatMap(tok => tok.actor ? [tok.actor as PersonaActor] : [])
			)
		);
		for (const actor of actorList) {
			const containers =  [
				actor.powers,
				actor.focii,
				actor.talents,
				actor.items.filter( item => "effects" in item),
			]
			const dep = containers.flat()
				.filter(pwr => this.effectsAreDep(pwr as any));
			errors.push(...dep);
		}
		for (const item of PersonaDB.allItems()) {
			if ("effects" in item.system) {
				if (this.effectsAreDep(item as ModifierContainer)) {
					errors.push(item);

				}

			}
		}
		for (const thing of errors) {
			console.log(thing.name);
			if (fix)  {
				if ("effects" in thing.system) {
					this.fixupItem(thing as any)
				}

			}
		}
	}

	static effectsAreDep(container: ModifierContainer) {
		return container.getEffects(null).some( eff =>
			eff.conditions.some( cond => {
				switch (cond.type as any) {
					case "natural+":
					case "natural-":
					case "natural-odd":
					case "natural-even":
					case "escalation+":
					case "escalation-":
					case "escalation-odd":
					case "escalation-even":
					case "activation+":
					case "activation-":
					case "activation-even":
					case "activation-odd":
					case "talent-level+":
					case "requires-social-link-level":
					case "critical":
					case "hit":
					case "miss":
					case "in-battle":
					case "non-combat":
					case "user-has-status":
					case "user-not-status":
					case "power-damage-type-is":
					case "power-type-is":
					case "has-tag":
					case "not-tag":
					case  "target-has-status":
					case  "target-not-status":
					case "is-engaged-with-target":
					case "is-engaged":
					case "user-is-pc":
					case "user-is-shadow":
					case "is-resistant-to":
					case "metaverse-normal":
					case "metaverse-enhanced":
					case "target-is-resistant-to":
					case "target-is-not-resistant-to":
					case "target-is-same-arcana":
					case "target-is-dead":
					case "not-resistant-to":
					case "is-not-engaged-with-target":
					case "struck-weakness":
					case "is-a-consumable":
					case "flag-state":
						return true;
					default:
						return false;
				}
			})
		);
	}

	static async fixupItem(item: ModifierContainer) {
		const effects= item.getEffects(null);
		for (const effect of effects) {
			effect.conditions = effect.conditions.map( cond=> this.fixupConditional(cond));
		}
		await item.update({ "system.effects": effects});
	}

	static fixupConditional( cond: any) : Precondition {
		switch (cond.type) {
			case "hit":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "is-hit",
				};
				 case "miss":
				return {
					type :"boolean",
					booleanState: false,
					boolComparisonTarget: "is-hit",
				}
			case "critical":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "is-critical",
				}
			case "in-battle":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "in-combat",
				}
			case "non-combat":
				return {
					type :"boolean",
					booleanState: false,
					boolComparisonTarget: "in-combat",
				}
			case "has-tag":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "has-tag",
					powerTag: cond.powerTag!,

				}
			case "not-tag" :
				return {
					type :"boolean",
					booleanState: false,
					boolComparisonTarget: "has-tag",
					powerTag: cond.powerTag!,
				}
				 case "target-has-status":
				return {
					type :"boolean",
					booleanState: true,
					status: cond.status!,
					boolComparisonTarget: "has-status",
					conditionTarget: "target"
				}
			case "target-not-status":
				return {
					type :"boolean",
					booleanState: false,
					status: cond.status!,
					boolComparisonTarget: "has-status",
					conditionTarget: "target"
				}
				 case "user-has-status":
				return {
					type :"boolean",
					booleanState: true,
					status: cond.status!,
					boolComparisonTarget: "has-status",
					conditionTarget: "attacker"
				}
				 case "user-not-status":
				return {
					type :"boolean",
					booleanState: false,
					status: cond.status!,
					boolComparisonTarget: "has-status",
					conditionTarget: "attacker"
				}

			case "power-type-is":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "power-type-is",
					powerType : cond.powerType!,
				}

			case "power-damage-type-is":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "damage-type-is",
					powerDamageType : cond.powerDamageType!,
				}
			case "user-is-pc":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "is-pc",
					conditionTarget: "attacker",
				}
			case "user-is-shadow":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "is-shadow",
					conditionTarget: "attacker",
				}
			case "metaverse-enhanced":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "metaverse-enhanced",
				}
			case "metaverse-normal":
				return {
					type :"boolean",
					booleanState: false,
					boolComparisonTarget: "metaverse-enhanced",
				}
			case "is-engaged":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "engaged",
					conditionTarget: "attacker",
				}
			case "is-engaged-with-target":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "engaged-with",
					conditionTarget2: "attacker",
					conditionTarget: "target",
				}
			case "is-not-engaged-with-target":
				return {
					type :"boolean",
					booleanState: false,
					boolComparisonTarget: "engaged-with",
					conditionTarget2: "attacker",
					conditionTarget: "target",
				}
			case "target-is-resistant-to":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "is-resistant-to",
					powerDamageType: cond.powerDamageType!,
					conditionTarget: "target",
				}
			case "is-resistant-to":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "is-resistant-to",
					powerDamageType: cond.powerDamageType!,
					conditionTarget: "owner",
				}

				 case "not-resistant-to":
				return {
					type :"boolean",
					booleanState: false,
					boolComparisonTarget: "is-resistant-to",
					powerDamageType: cond.powerDamageType!,
					conditionTarget: "owner",
				}
				 case "target-is-not-resistant-to":
				return {
					type :"boolean",
					booleanState: false,
					boolComparisonTarget: "is-resistant-to",
					powerDamageType: cond.powerDamageType!,
					conditionTarget: "target",
				}
				 case "struck-weakness":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "struck-weakness",
					conditionTarget: "target",
				}
			case "target-is-dead":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "is-dead",
					conditionTarget: "target",
				}
				 case "is-a-consumable":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "is-consumable",
				}
			case "target-is-same-arcana":
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "is-same-arcana",
					conditionTarget: "target",
				}
			case "flag-state" :
				return {
					type :"boolean",
					booleanState: true,
					boolComparisonTarget: "flag-state",
					conditionTarget: "owner",
					flagId: cond.flagId!,
				}

			case "natural+":
				return {
					type: "numeric",
					comparator: ">=",
					comparisonTarget: "natural-roll",
					num: cond.num!,
				}
			case "natural-":
				return {
					type: "numeric",
					comparator: "<=",
					comparisonTarget: "natural-roll",
					num: cond.num!,
				}
			case "natural-odd":
				return {
					type: "numeric",
					comparator: "odd",
					comparisonTarget: "natural-roll",
					num: cond.num!,
					}
			case "natural-even":
				return {
					type: "numeric",
					comparator: "even",
					comparisonTarget: "natural-roll",
					num: cond.num!,
					}
			case "escalation+":
				return {
					type: "numeric",
					comparator: ">=",
					comparisonTarget: "escalation",
					num: cond.num!,
					}
			case "escalation-":
				return {
					type: "numeric",
					comparator: "<=",
					comparisonTarget: "escalation",
					num: cond.num!,
					}
			case "escalation-odd":
				return {
					type: "numeric",
					comparator: "odd",
					comparisonTarget: "escalation",
					num: cond.num!,
					}
			case "escalation-even":
				return {
					type: "numeric",
					comparator: "even",
					comparisonTarget: "escalation",
					num: cond.num!,
					}
			case "activation+":
				return {
					type: "numeric",
					comparator: ">=",
					comparisonTarget: "activation-roll",
					num: cond.num!,
					}
			case "activation-":
				return {
					type: "numeric",
					comparator: "<=",
					comparisonTarget: "activation-roll",
					num: cond.num!,
					}
			case "activation-odd":
				return {
					type: "numeric",
					comparator: "odd",
					comparisonTarget: "activation-roll",
					num: cond.num!,
					}
			case "activation-even":
				return {
					type: "numeric",
					comparator: "even",
					comparisonTarget: "activation-roll",
					num: cond.num!,
					}
			case "talent-level+":
				return {
					type: "numeric",
					comparator: ">=",
					comparisonTarget: "talent-level",
					num: cond.num!,
					}


			case "boolean":
			case "always":
			case "numeric":
			case "save-versus":
			case "miss-all-targets":
			case "on-trigger":
				return cond;
		}
		return cond;
	}

}



//@ts-ignore
window.ErrorScanner = ErrorScanner;
