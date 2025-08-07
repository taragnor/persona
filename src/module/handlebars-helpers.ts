import { StatusEffectId } from "../config/status-effects.js";
import { DAMAGE_ICONS } from "../config/damage-types.js";
import { POWER_TAGS } from "../config/power-tags.js";
import { ROLL_TAGS_AND_CARD_TAGS } from "../config/roll-tags.js";
import { CardRoll } from "../config/social-card-config.js";
import { Persona } from "./persona-class.js";
import { RESIST_STRENGTHS } from "../config/damage-types.js";
import { PersonaI } from "../config/persona-interface.js";
import { PersonaError } from "./persona-error.js";
import { Consumable } from "./item/persona-item.js";
import { FREQUENCY } from "../config/frequency.js";
import { CardEvent } from "../config/social-card-config.js";
import { ValidAttackers } from "./combat/persona-combat.js";
import { SocialCard } from "./item/persona-item.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { Helpers } from "./utility/helpers.js";
import { PersonaItem } from "./item/persona-item.js";
import { CREATURE_TAGS } from "../config/creature-tags.js";
import { EQUIPMENT_TAGS } from "../config/equipment-tags.js";
import { InvItem } from "./item/persona-item.js";
import { Weapon } from "./item/persona-item.js";
import { PersonaSocial } from "./social/persona-social.js";
import { SocialLink } from "./actor/persona-actor.js";
import { Consequence } from "../config/consequence-types.js";
import { ConditionalEffect } from "./datamodel/power-dm.js";
import { ConditionalEffectManager } from "./conditional-effect-manager.js";
import { PersonaEffectContainerBaseSheet } from "./item/sheets/effect-container.js";
import { DamageType } from "../config/damage-types.js";
import { DAMAGETYPES } from "../config/damage-types.js";
import { localize } from "./persona.js";
import { AttackResult } from "./combat/combat-result.js";
import { Activity } from "./item/persona-item.js";
import { CardData } from "./social/persona-social.js";
import { testPreconditions } from "./preconditions.js";
import { Precondition } from "../config/precondition-types.js";
import { Focus } from "./item/persona-item.js";
import { SetFlagEffect } from "../config/consequence-types.js";
import { SocialLinkData } from "./actor/persona-actor.js";
import { Power } from "./item/persona-item.js";
import { SocialBenefit } from "./actor/persona-actor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";
import { PersonaDB } from "./persona-db.js";
import { Talent } from "./item/persona-item.js";
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

		"getMaxSlotsAt": (_actor: PersonaActor, _lvl:number) => {
			return 0;
		},

		"getCritResist": (actor: PC | Shadow) => {
			return actor.critResist().total({user: actor.accessor, target:actor.accessor});
		},
		"getDefense" : (actorOrPersona: ValidAttackers | PersonaI, defense: keyof ValidAttackers["system"]["combat"]["defenses"]): number => {
			const persona = (actorOrPersona instanceof PersonaActor) ? actorOrPersona.persona() : actorOrPersona;
			const acc = persona.user.accessor;
			return persona.getDefense(defense).total({user: acc, target: acc});

		},
		"getInit" : (actor: ValidAttackers  | PersonaI) => {
			return actor.combatInit;
		},


		"isGM" : () => {
			return game.user.isGM;
		},

		"isPC": (actor: PersonaActor) : boolean => {
			return actor.isPC();
		},

		"abs" : (x:string | number) => {
			return Math.abs(Number(x))
		},

		"isPCOrNPCAlly": function (actor: PersonaActor): boolean {
			return actor.system.type == "pc" || actor.system.type == "npcAlly";

		},
		"isShadow" : (actor: PersonaActor) => {
			return actor.system.type == "shadow";
		},

		"arrIncludes": function (arr: string[], value: string): boolean {
			return arr.includes(value)
		},
		"strIncludes" : (testStr: string | undefined, substr: string) => {
			if (!testStr) return false;
			return testStr.includes(substr);
		},

		"getTalentLevel": (actor: PersonaActor, talent: Talent) : string => {
			switch (actor.system.type) {
				case "shadow": case "npc": case "tarot": return "-";
				case "pc": case "npcAlly":
					break;
				default:
					actor.system satisfies never;
			}
			const numLevel = (actor as PC).getLevelOfTalent(talent);
			return game.i18n.localize(`persona.talentLevels.${numLevel}.name`);
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
			if (!actor.isValidCombatant()) return "0/0";
			const dmg = usable.estimateDamage(actor);
			if (dmg.high <= 0) {
				return `-/-`;
			}
			return `${dmg.low}/${dmg.high}`;
	},
		// "getDamage": (actor: PersonaActor, usable: Usable) => {
		// 	if (usable == PersonaDB.getBasicPower("All-out Attack")) {
		// 		if (!actor.isValidCombatant()) {
		// 			return "- / -";
		// 		}
		// 		const combat = game.combat as PersonaCombat;
		// 		if (!combat) {
		// 			return "- / -";
		// 		}
		// 		const tokenAcc = combat.getToken(actor.accessor);
		// 		if (!tokenAcc) {
		// 			return "No token?";
		// 		}
		// 		const usable = PersonaDB.getBasicPower("All-out Attack");
		// 		const token = PersonaDB.findToken(tokenAcc);
		// 		if (!token || !usable) {
		// 			return "No token or no power?";
		// 		}
		// 		const situation :Situation = {
		// 			user: (actor as PC | Shadow).accessor,
		// 			attacker: (actor as PC | Shadow).accessor,
		// 			usedPower: usable?.accessor,
		// 		};
		// 		const dmg = PersonaCombat.calculateAllOutAttackDamage(token, situation);
		// 		const mult = usable.getDamageMultSimple(actor as PC | Shadow);
		// 		const {high, low} = dmg;
		// 		return Math.round(low * mult) + " / " + Math.round(high * mult);
		// 	}
		// 	switch (actor.system.type) {
		// 		case "tarot":
		// 		case "npc":
		// 			return "-/-";
		// 		case "npcAlly": case "pc": case"shadow": const combatant = actor as ValidAttackers;
		// 			const mult = usable.getDamageMultSimple(combatant);
		// 			const dmg = usable.getDamage(combatant);
		// 			const low = dmg["low"] * mult;
		// 			const high = dmg["high"] * mult;
		// 			return Math.round(low) + " / " + Math.round(high);
		// 		default:
		// 			actor.system satisfies never;
		// 			return "-/-";
		// 	}
		// },

		"getCriticalBoostEstimate" : function (actor: PC | Shadow, power: Usable) : number {
			const situation : Situation = {
				usedPower: power.accessor,
				attacker: actor.accessor,
				user: actor.accessor,
			}
			const critBonus = PersonaCombat.calcCritModifier(actor, actor, power, situation, true);
			return critBonus.total(situation);
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
			return actor.isAlive() && actor.canUsePower(power, false) && power.system?.subtype != "passive" && power.system?.subtype != "defensive" ;
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

		'isHighestLinker': (_pc: PC, linkData:SocialLinkData ) => {
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

		"choiceMeetsConditions": function(cardData: CardData, choice: SocialCard["system"]["events"][number]["choices"][number]) : boolean {
			const conditions = choice.conditions;
			if (choice.resourceCost > 0) {
				conditions.push( {
					type: "numeric",
					comparisonTarget: "has-resources",
					comparator: ">=",
					num: choice.resourceCost,
				});
			}
			return testPreconditions(conditions ?? [], cardData.situation, null);

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
			html += `<div class="multi-check" data-name="${name}">`;
			const hash = options?.hash ?? undefined;
			const selected= Object.entries(hash?.checked ?? {})
				.filter (([_k,v]) => v == true)
				.map( ([k, _v])=> list[k] ? list[k] : k)
				.map( k => hash?.localize ? localize(k) : k )
				.join (", ");
			html += `<span class="selected micro-text"> ${selected.length ? selected : "NONE SELECTED"} </span>`;
			html+= `<div class="MC-selectors ${(selected.length && ConditionalEffectManager.lastClick != name) ? 'hidden': ''}">`;
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
			html+= `</div>`;
			html += `</div>`;
			return new Handlebars.SafeString(html);
		},

		"inCombat": function() : boolean {
			if (!game.combat) return false;
			return (game.combat.combatants.contents.some( x=> x?.actor?.system.type == "shadow"));
		},

		"inventoryLocked": function() : boolean {
			if (game.user.isGM) return false;
			if (!game.combat) return false;
			return (!(game.combat as PersonaCombat).isSocial);
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
				.join("<br>")
			);
		},

		"printConditionals": function (cond: Precondition[]) {
			const str=ConditionalEffectManager.printConditions(cond);
			return new Handlebars.SafeString( `<div class="printed-conditional">${str}</div>`
			);
		},

		"printConsequences": function (cons: Consequence[]) {
			const str= ConditionalEffectManager.printConsequences(cons);
			return new Handlebars.SafeString( `<div class="printed-consequence">${str}</div>`
			);
		},

		"canForgeSocialLink": function (pc: PC, target: SocialLink) : boolean {
			if (pc.system.type != "pc") return false;
			return PersonaSocial.meetsConditionsToStartLink(pc, target);
		},
		"getItemTagList": function (item: Usable | InvItem | Weapon) : string[] {
			const localizeTable  =  {
				...EQUIPMENT_TAGS,
				...POWER_TAGS
			};
			if (item.system.type == "power") {PersonaError.softFail("Calling Item Tag list on Power");}
			return (item as Consumable | InvItem | Weapon).tagList().map(tag=> localize(localizeTable[tag]));
		},

		"getCreatureTagList": function (actor: PersonaActor) : string[] {
			return actor.tagList.map(tag=> localize(CREATURE_TAGS[tag]));
		},
		"getSocialCardTagList": function (card: SocialCard) : string {
			return card.cardTags;
		},
		"hasTag": function (source: PersonaActor | PersonaItem, tagName: string) : boolean {
			switch (true) {
				case source instanceof PersonaActor :{
					return source.tagList.includes(tagName as any);
				}
				case source instanceof PersonaItem: {
					const list = (source as Usable).tagList(null)
					return list.includes (tagName as any);
				}
				default:
					return false;
			}
		},
		"getEventTagList": function (event: SocialCard["system"]["events"][number]) {
			const tags= event.eventTags.map(tag => localize(ROLL_TAGS_AND_CARD_TAGS[tag]));
			return tags.join(", ");
		},

		"eq-m": function<T extends any> (comparisonOne:T, ...compArr: T[]) {
			return compArr.some(x=> x == comparisonOne);
		},
		"neq-m": function<T extends any> (comparisonOne:T, ...compArr: T[]) {
			return compArr.every(x=> x != comparisonOne);
		},
		"replace": function(originalString: string = "ERROR", replacementSet: Record<string, string> = {}): string {
			return Helpers.replaceAll(originalString, replacementSet);
		},
		"isPowerIllegal":  function (actor: PersonaActor, power: Power): boolean {
			return power.system.slot > actor.maxSlot();
		},
		"canUseTalents": function (actor: PersonaActor) : boolean {
			switch (actor.system.type) {
				case "tarot":
				case "npc":
				case "shadow":
					return false;
				case "pc":
				case "npcAlly":
					return true;
				default:
					actor.system satisfies never;
					return false;
			}
		},
		"canUseCustomFocii": function (actor: PersonaActor) : boolean {
			switch (actor.system.type) {
				case "tarot":
				case "pc":
				case "npc":
				case "npcAlly":
					return false;
				case "shadow":
					return true;
				default:
					actor.system satisfies never;
					return false;
			}
		},
		"hasMP": function (actor: PersonaActor) : boolean {
			switch (actor.system.type) {
				case "pc":
				case "npcAlly":
					return true;
				case "shadow":
				case "npc":
				case"tarot":
					return false;
				default: actor.system satisfies never;
					return false;
			}
		},
		"getEventType": function (ev: CardEvent) : string {
			const {frequency, placement} = ev;
			const frequencyStr = FREQUENCY[frequency as keyof typeof FREQUENCY];
			const placementStr = Object.entries(placement)
				.flatMap ( ([k,v]) => v == true ? [k] : [])
				.join(", ");
			return `${frequencyStr} -- ${placementStr}`;
		},
		"isItemUsable": function (item: PersonaItem) : boolean {
			return item.isUsable();
		},
		"hpCost": function (item: Power) : number {
			return item.hpCost();
		},

		"getAttackBonus": function (actor: ValidAttackers, power: Usable) : number {
			const situation : Situation = {
				attacker: actor.accessor,
				user: actor.accessor,
				usedPower: power.accessor,
			};
			return PersonaCombat.getAttackBonus(actor, power, undefined).total(situation);
		},

		"powerCostString": function (power: Power, actor: ValidAttackers) {
			return power.costString1(actor);
		},

		"costString": function () {
			return "ERROR";
		},

		"ternIf": function (cond, r1, r2) {
			if (r1 == undefined) {
				PersonaError.softFail(`Ternif result 1 is undefined`);
			}
			if (r2 == undefined) {
				PersonaError.softFail(`Ternif result 2 is undefined`);
			}
			return cond ? r1: r2;
		},

		"getDamageType" : function (actor: ValidAttackers, power: Usable) {
			return power.getDamageType(actor);

		},

		"getPowerTagsL": function (actor: ValidAttackers, power: Usable) {
			return power.tagListLocalized(actor);
		},
		"persona": function (actor: ValidAttackers) : PersonaI {
			return actor.persona();
		},

		"elemResist": function (actorOrPersona: ValidAttackers | Persona, resistType: Exclude<DamageType, "by-power">) : string {
			const persona = (actorOrPersona instanceof PersonaActor) ? actorOrPersona.persona() : actorOrPersona;
			const resist= persona.elemResist(resistType);
			return game.i18n.localize(RESIST_STRENGTHS[resist]);
		},

		"scanLevel": function (persona: PersonaI) : number {
			const user = persona.user;
			if (user.isOwner) return 3;
			if (user.isPC() || user.isNPCAlly()) return 2;
			if (user.hasCreatureTag("enigmatic")) return 0;
			const scanLevel= user.system.scanLevel;
			if (typeof scanLevel != "number") {
				PersonaError.softFail("Trouble reading scan level for Persona of ${user.name}");
			}
			console.log(`Scan level is :${scanLevel}`);
			return scanLevel ?? 0;
		},

		"scanLevelgte": function (persona: PersonaI, val: number) : boolean {
			return persona.scanLevel >= val;
		},

		"usingBasePersona": function (actor: ValidAttackers) : boolean {
			return actor.isUsingBasePersona();
		 },

		"canSideboardPowers": function (persona: Persona): boolean {
			return persona.user.isPC() && persona.user.isOwner &&  persona.isBasePersona;
		},

		"canDeletePowers": function (persona: Persona): boolean {
			return persona.user.isOwner && persona.isBasePersona;
		},

		"getRollTags": function (cardRoll: CardRoll): string {
			const localization= PersonaSocial.getCardRollTags(cardRoll)
				.map (t => localize(ROLL_TAGS_AND_CARD_TAGS[t]))
			return localization
				.join(", ");
		},

		"isTrueOwner": function (actor: PersonaActor): boolean {
			return actor.isTrueOwner;

		},

		"favoredIncrementalTypes": function (actor: ValidAttackers): Record<string, string> {
			const keys = Object.keys(actor.system.combat.classData.incremental);
			return	Object.fromEntries(
				["", ...keys].map( x=> [x, x])
			);
		},

		"displayDamageIcon": function (damageType: DamageType): SafeString {
			const iconFileName = DAMAGE_ICONS[damageType];
			const filepath = `systems/persona/img/icon/${iconFileName}`;
			const locName = localize(DAMAGETYPES[damageType]);
			return new Handlebars.SafeString(`<img class="damage-icon" src='${filepath}' title='${locName}'>`);
		},

		"displayStatusIcon": function (statusId: StatusEffectId) : SafeString {

			const status = CONFIG.statusEffects.find( x=> x.id == statusId);
			if (status) {
				const locName = localize(status.name);
				const icon = status.icon;
				return new Handlebars.SafeString(`
				<img class="status-icon" src='${icon}' title='${locName}'>`);
			}
			return new Handlebars.SafeString("broken status");
		},


	}

} //end of class
