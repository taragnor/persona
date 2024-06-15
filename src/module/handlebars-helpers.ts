import { Focus } from "./item/persona-item.js";
import { SetFlagEffect } from "./combat/combat-result.js";
import { SocialLinkData } from "./actor/persona-actor.js";
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

		"getCritResist": (actor: PC | Shadow) => {
			return actor.critResist().total({user: actor.accessor});
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

		"strIncludes" : (testStr: string | undefined, substr: string) => {
			if (!testStr) return false;
			return testStr.includes(substr);
		},

		"getTalentLevel": (actor: PersonaActor, talent: Talent) => {
			if (actor.system.type == "pc") {
				const numLevel = (actor as PC).getLevelOfTalent(talent);
				return game.i18n.localize(`persona.talentLevels.${numLevel}.name`);
			}
			else return 0;
		},

		"meetsSLRequirement": ( owner: PC, focus: Focus) => {
			return owner.meetsSLRequirement(focus);
		},

		"meetsSLRequirementNPC": (benefit: SocialBenefit) => {
			if (game.user.isGM) return true;
			const pc= game.user.character as PersonaActor;
			if (!pc || pc.system.type != "pc") return false;
			return (pc as PC).meetsSLRequirement(benefit.focus);
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

		"getTokenAccName" : (tokenAcc: UniversalTokenAccessor<PToken> | UniversalActorAccessor<PC | Shadow>) =>  {

			if ("actorId" in tokenAcc) {
				const token = PersonaDB.findToken(tokenAcc.token);
				return token?.document?.name ?? PersonaDB.findActor(tokenAcc).name ?? "Unknown Token";
			}
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

		'newlineConversion': function (txt: string) : SafeString {
			return new Handlebars.SafeString(txt.replaceAll("\n", "<br>"));
		},

		'isHighestLinker': (pc: PC, linkData:SocialLinkData ) => {
			if (!linkData) return false;
			const highest = linkData.actor.highestLinker();
			return highest.linkLevel == linkData.linkLevel;
		},
		'eqAny': function (testCase: string, ...rest: string[]) : boolean {
			return rest.some( str => str == testCase)
		},

		"strcat": function (...args: (string | number)[]) : string{
			let str = "";
			for (const arg of args)  {
				switch (typeof arg) {
					case "string":
					case "number":
						str += String(arg);
					default:
						break;
				}
			}
			return str;
		},
		"getEffectFlagName" : function (acc: UniversalActorAccessor<PC | Shadow>, flagEffect: SetFlagEffect): string {
			const actor = PersonaDB.findActor(acc);
			const flag = actor.getEffectFlag(flagEffect.flagId);
			if (flag) return flag.flagName ?? flagEffect.flagName ?? flag.flagId;
			return flagEffect.flagName ?? flagEffect.flagId;
		},

		"isNonstandardPic": function (imgPath:string) : boolean {
			if (imgPath.startsWith("icons")) {
				return false;
			}
			return true;
		},

		"trim" : function (str: string) {
			if (typeof str == "string")
				return str.trim();
			else return str;
		},
	}

} //end of class


