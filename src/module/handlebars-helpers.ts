import { PersonaActor } from "./actor/persona-actor";
import { PC } from "./actor/persona-actor";
import { Shadow } from "./actor/persona-actor";

export class PersonaHandleBarsHelpers {
	static init() {
		for (const [k, v] of Object.entries(PersonaHandleBarsHelpers.helpers)) {
			Handlebars.registerHelper(k, v);
		}
		// Handlebars.registerHelper("caps", (str) => str.toUpperCase?.() || str);

		// Handlebars.registerHelper("getMaxSlotsAt", 
		// 	(actor: PersonaActor, lvl:number) => {
		// 	console.log(actor);
		// 	console.log(lvl);
		// 	return actor.getMaxSlotsAt(lvl);
		// });


	}

	static helpers : Record<string, (...args: any[])=> any>  = {
		"caps" : (str) => str.toUpperCase?.() || str,

		"getMaxSlotsAt": (actor: PersonaActor, lvl:number) => {
			console.log(actor);
			console.log(lvl);
			return actor.getMaxSlotsAt(lvl);
		},

	"getDefense" : (actor: PC | Shadow, defense: keyof typeof actor["system"]["combat"]["defenses"]) => {
		return actor.getDefense(defense).total();

	}


	}
}
