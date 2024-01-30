import { PersonaActor } from "./actor/persona-actor.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";
import { PersonaDB } from "./persona-db.js";

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
			return actor.getDefense(defense).total({user: PersonaDB.getUniversalActorAccessor(actor)});

		},
		"isGM" : () => {
			return game.user.isGM;
		},
		"abs" : (x:string | number) => {
			return Math.abs(Number(x))
		},
		"isPC" : (actor: PersonaActor) => {
			return actor.system.type == "pc";
		},
		"isShadow" : (actor: PersonaActor) => {
			return actor.system.type == "shadow";
		}

	}
}


