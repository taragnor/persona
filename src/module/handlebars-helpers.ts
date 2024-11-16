import { Consequence } from "../config/consequence-types.js";
import { ConditionalEffect } from "./datamodel/power-dm.js";
import { ConditionalEffectManager } from "./conditional-effect-manager.js";
import { PersonaEffectContainerBaseSheet } from "./item/sheets/effect-container.js";
import { DamageType } from "../config/damage-types.js";
import { DAMAGETYPES } from "../config/damage-types.js";
import { localize } from "./persona.js";
import { AttackResult } from "./combat/combat-result.js";
import { Situation } from "./preconditions.js";
import { Activity } from "./item/persona-item.js";
import { CardData } from "./social/persona-social.js";
import { testPreconditions } from "./preconditions.js";
import { Precondition } from "../config/precondition-types.js";
import { Focus } from "./item/persona-item.js";
import { SetFlagEffect } from "../config/consequence-types.js";
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
			return actor.critResist().total({user: actor.accessor, target:actor.accessor});
		},
		"getDefense" : (actor: PC | Shadow, defense: keyof typeof actor["system"]["combat"]["defenses"]) => {
			const acc = actor.accessor;
			return actor.getDefense(defense).total({user: acc, target: acc});

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
				case "tarot":
				case "npc":
					return "0/0";
				case "pc": case"shadow":
					const combatant = actor as PC | Shadow;
					const mult = usable.getDamageMultSimple(combatant);
					const low = usable.getDamage(combatant, "low") * mult;
					const high = usable.getDamage(combatant, "high") * mult;
					return Math.round(low) + " / " + Math.round(high);
				default:
					actor.system satisfies never;
					return "0/0";
			}
		},

		"getTokenAccName" : (tokenAcc: UniversalTokenAccessor<PToken> | UniversalActorAccessor<PC | Shadow>) =>  {

			if ("actorId" in tokenAcc) {
				const token = PersonaDB.findToken(tokenAcc.token);
				return token?.name ?? PersonaDB.findActor(tokenAcc).name ?? "Unknown Token";
			}
			const token = PersonaDB.findToken(tokenAcc);
			return token.name;
		},

		'canUsePower': (actor:PC | Shadow, power: Power) => {
			return actor.isAlive() && actor.canPayActivationCost(power, false) && power.system?.subtype != "passive" && power.system?.subtype != "defensive" ;
		},

		'canModifySearchChoice': (ownerId : string) => {
			const user = game.users.get(ownerId);
			if (game.user.isGM) {
				return true;
			}
			if (user && user.active) {
				return game.user == user;
			}
			return game.user.isGM;
		},

		'newlineConversion': function (txt: string) : SafeString {
			return new Handlebars.SafeString(txt?.replaceAll("\n", "<br>") ?? "");
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

		"meetsConditions" : function (cardData: CardData, conditions: Precondition[]) : boolean {
			return testPreconditions(conditions ?? [], cardData.situation, null);
		},

		"isActivitySelectable": function (pc: PC, activity: Activity): boolean {
			if (!activity.system.weeklyAvailability.available)
				return false;
			if ((pc.system.activities.find( act=> act.linkId == activity.id)?.strikes ?? 0) >= 3)
				return false;
			const situation : Situation=  {
				user: pc.accessor,
				attacker: pc.accessor,
			};
			return testPreconditions(activity.system.conditions, situation, null);
		},
		"getActivityProgress": function( actor: PersonaActor, activity: Activity): number {
			if (actor.system.type == "pc") {
				const act = actor.system.activities.find(act=> act.linkId  == activity.id);
				if (act) {
					return act.currentProgress;
				}
			}
			return 0;
		},
		"getActivityStrikes": function (actor: PersonaActor, activity: Activity) : number {
			if (actor.system.type == "pc") {
				const act = actor.system.activities.find(act=> act.linkId  == activity.id);
				if (act) {
					return act.strikes;
				}
			}
			return 0;
		},

		"prettyAtkResult": function (result: AttackResult) : string {
			switch (result.result) {
				case "crit":
					let str = "CRITICAL";
					if (result.hitResistance)
						return str  + " (RESIST)";
					if (result.hitWeakness)
						return str + " (WEAK)";
					return str;
				case "hit":
					if (result.hitResistance)
						return "RESIST";
					if (result.hitWeakness)
						return "WEAK";
					return result.result;
				case "miss":
					return "MISS";
				case "reflect":
					return "REFLECT";
				case "block":
					return "BLOCK";
				case "absorb":
					return "ABSORB";
				default:
					result.result satisfies never;
					return "ERROR";

			}

		},

		"multicheck": function (name: string, list: Record<string, string>, options: {hash: {localize: boolean, checked: Record<string, boolean>}}) : SafeString {
			let html = "";
			const hash = options?.hash ?? undefined;
			for (const [key, val] of Object.entries(list)) {
				const valName = hash?.localize ? localize(val) : val;
				html += `<span class="small-box">`;
				html += `<label class="micro-text">  ${valName} </label>`;
				let checked = false;
				if (hash?.checked) {
					if (typeof hash.checked == "object") {
						checked = hash.checked[key] ?? false;
					}
				}
				html += `<input type="checkbox" name="${name}.${key}" ${ (checked) ? 'checked' : ""} >`;
				html += `</span>`;
			}
			return new Handlebars.SafeString(html);
		},

		"inCombat": function() : boolean {
			if (!game.combat) return false;
			return (game.combat.combatants.contents.some( x=> x?.actor?.type == "shadow"));
		},

		"inventoryLocked": function() : boolean {
			if (game.user.isGM) return false;
			if (!game.combat) return false;
			return (game.combat.combatants.contents.some( x=> x?.actor?.type == "shadow"));
		},

		"signed" : function(num: string | number) : SafeString {
			num = Number(num);
			if (num >=0) return new Handlebars.SafeString(`+${num}`);
			else return new Handlebars.SafeString(`${num}`);
		},

		"localizeDamageType": function (dtype:DamageType ) : string {
			return game.i18n.localize(DAMAGETYPES[dtype]);
		},
		"getProp": function (object: {}, path: string) : unknown {
			while (path.endsWith(".")) {
				path = path.slice(0, -1);
			}
			try {
				return foundry.utils.getProperty(object, path);
			}
			catch (e) {
				console.trace()
				console.error(e);
				Debug(object);
				console.log(`Error on path ${path}`);
			}
		},
		"powerStuff" : function () : Object {
			return PersonaEffectContainerBaseSheet.powerStuff;
		},

		"printEffects": function(effects: ConditionalEffect[]) : SafeString {
			return new Handlebars.SafeString(ConditionalEffectManager.printEffects(effects)
				.map( x=> `<div class="printed-effect"> ${x} </div>`)
				.join("")
			);
		},

		"printConditionals": function (cond: Precondition[]) {
			return new Handlebars.SafeString(ConditionalEffectManager.printConditions(cond));
		},
		"printConsequences": function (cons: Consequence[]) {
			return new Handlebars.SafeString(
				ConditionalEffectManager.printConsequences(cons)
			);
		},

	}
} //end of class
