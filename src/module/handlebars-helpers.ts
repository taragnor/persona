import { PersonaActor } from "./actor/persona-actor";
import { PC } from "./actor/persona-actor";
import { Shadow } from "./actor/persona-actor";

export class PersonaHandleBarsHelpers {
	static init() {
		for (const [k, v] of Object.entries(PersonaHandleBarsHelpers.helpers)) {
			Handlebars.registerHelper(k, v);
		}

	}

	static helpers : Record<string, (...args: any[])=> any>  = {
		"caps" : (str) => str.toUpperCase?.() || str,

		"getMaxSlotsAt": (actor: PersonaActor, lvl:number) => {
			return actor.getMaxSlotsAt(lvl);
		},

		"getDefense" : (actor: PC | Shadow, defense: keyof typeof actor["system"]["combat"]["defenses"]) => {
			return actor.getDefense(defense).total({user:actor});

		},
		"isGM" : () => {
			return game.user.isGM;
		}

	}
}
