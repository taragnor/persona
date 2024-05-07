import { ModifierContainer } from "./item/persona-item.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { PersonaDB } from "./persona-db.js";

export class ErrorScanner {

	static async check() {
		await PersonaDB.waitUntilLoaded();
		this.deprecatedEffects();
	};

	static async deprecatedEffects() {
		console.log("Running Error Check");
		const errors : (PersonaItem | PersonaActor)[] = [];
		for (const actor of game.actors.contents as PersonaActor[] ) {
			const containers =  [
				actor.powers,
				actor.focii,
				actor.talents,
			]
			const dep = containers.flat()
				.filter(pwr => this.effectsAreDep(pwr));
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
		}
	}

	static effectsAreDep(container: ModifierContainer) {
		return container.getEffects().some( eff =>
			eff.conditions.some( cond => {
				switch (cond.type) {
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

}

//@ts-ignore
window.ErrorScanner = ErrorScanner;
