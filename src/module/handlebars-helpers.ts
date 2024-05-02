import { UniversalActorAccessor } from "./utility/db-accessor.js";
import { Power } from "./item/persona-item.js";
import { SocialBenefit } from "./actor/persona-actor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";
import { PersonaDB } from "./persona-db.js";
import { Talent } from "./item/persona-item.js";
import { UniversalTokenAccessor } from "./utility/db-accessor.js";
import { PToken } from "./combat/persona-combat.js";
import { Usable } from "./item/persona-item.js";


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
			return actor.getDefense(defense).total({user: PersonaDB.getUniversalActorAccessor(actor) });

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
		},

		"strIncludes" : (testStr: string, substr: string) => {
			return testStr.includes(substr);
		},

		"getTalentLevel": (actor: PersonaActor, talent: Talent) => {
			if (actor.system.type == "pc") {
				const numLevel = (actor as PC).getLevelOfTalent(talent);
				return game.i18n.localize(`persona.talentLevels.${numLevel}.name`);
			}
			else return 0;
		},

		"meetsSLRequirement": (benefit: SocialBenefit) => {
			if (game.user.isGM) return true;
			const pc= game.user.character as PersonaActor;
			if (!pc || pc.system.type != "pc") return false;
			return (pc as PC).meetsSLRequirement(benefit);
		},
		"getDamage": (actor: PersonaActor, usable: Usable) => {
			switch (actor.system.type) {
				case "npc":
					return "0/0";
				case "pc": case"shadow":
					const combatant = actor as PC | Shadow;
					const low = usable.getDamage(combatant, "low");
					const high = usable.getDamage(combatant, "high");
					return low + " / " + high;
			}
		},

		"getTokenAccName" : (tokenAcc: UniversalTokenAccessor<PToken>) =>  {
			const token = PersonaDB.findToken(tokenAcc);
			return token.document.name;
		},

		'canUsePower': (actor:PC | Shadow, power: Power) => {
			return actor.isAlive() && actor.canPayActivationCost(power, false);
		},

		'canModifySearchChoice': (ownerId : string) => {
			const user = game.users.get(ownerId);
			if (user && user.active) {
				return game.user == user;
			}
			return game.user.isGM;
		},

	}
}


