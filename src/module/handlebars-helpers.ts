import { PersonaStat } from "../config/persona-stats.js";
import { MODIFIER_CATEGORIES, MODIFIERS_TABLE } from "../config/item-modifiers.js";
import { ConsequenceAmount } from "../config/consequence-types.js";
import { DAMAGE_LEVELS } from "../config/damage-types.js";
import { DAMAGE_ICONS } from "../config/icons.js";
import { StatusEffectId } from "../config/status-effects.js";
import { ROLL_TAGS_AND_CARD_TAGS } from "../config/roll-tags.js";
import { CardRoll } from "../config/social-card-config.js";
import { Persona } from "./persona-class.js";
import { RESIST_STRENGTHS } from "../config/damage-types.js";
import { PersonaError } from "./persona-error.js";
import { FREQUENCY } from "../config/frequency.js";
import { CardEvent } from "../config/social-card-config.js";
import { ValidAttackers } from "./combat/persona-combat.js";
import { Carryable, CClass, Consumable, ContainerTypes, SocialCard } from "./item/persona-item.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { Helpers } from "./utility/helpers.js";
import { PersonaItem } from "./item/persona-item.js";
import { CREATURE_TAGS } from "../config/creature-tags.js";
import { InvItem } from "./item/persona-item.js";
import { Weapon } from "./item/persona-item.js";
import { PersonaSocial } from "./social/persona-social.js";
import { SocialLink } from "./actor/persona-actor.js";
import { Consequence } from "../config/consequence-types.js";
import { ConditionalEffectManager } from "./conditional-effect-manager.js";
import { DamageType } from "../config/damage-types.js";
import { DAMAGETYPES } from "../config/damage-types.js";
import { localize } from "./persona.js";
import { AttackResult } from "./combat/combat-result.js";
import { Activity } from "./item/persona-item.js";
import { CardData } from "./social/persona-social.js";
import { testPreconditions } from "./preconditions.js";
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
import {Defense, DEFENSE_TYPES} from "../config/defense-types.js";
import {INSTANT_KILL_LEVELS} from "./combat/damage-calc.js";
import {PersonaEffectContainerBaseSheet} from "./item/sheets/effect-container.js";
import {HTMLTools} from "./utility/HTMLTools.js";
import {EnergyClassCalculator} from "./calculators/shadow-energy-cost-calculator.js";
import {LevelUpCalculator} from "../config/level-up-calculator.js";
import {PersonaSettings} from "../config/persona-settings.js";
import {POWER_TAGS} from "../config/power-tags.js";
import {FusionTable} from "../config/fusion-table.js";


export class PersonaHandleBarsHelpers {
	static init() {
		for (const [k, v] of Object.entries(PersonaHandleBarsHelpers.helpers)) {
			Handlebars.registerHelper(k, v);
		}

	}

	static helpers : Record<string, (...args: unknown[])=> unknown>  = {
		"caps" : (str: string) => str?.toUpperCase?.() || str,

		"getMaxSlotsAt": (_actor: PersonaActor, _lvl:number) => {
			return 0;
		},

		"getCritResist": (persona: Persona) => {
			return persona.critResist().eval({user: persona.user.accessor, target:persona.user.accessor}).total;
		},

		"getDefense" : (actorOrPersona: ValidAttackers | Persona, defense: Defense): number => {
			const persona = (actorOrPersona instanceof PersonaActor) ? actorOrPersona.persona() : actorOrPersona;
			const acc = persona.user.accessor;
			return persona.getDefense(defense).eval({user: acc, target: acc}).total;
		},
		"getInit" : (persona: Persona) : number => {
			const situation = {user: persona.user.accessor};
			return persona.combatInit.eval(situation).total;
		},

		"getInitBreakdown": function (persona: Persona) : SafeString {
			const situation = {user: persona.user.accessor};
			const init= persona.combatInit.eval(situation).steps;
			return new Handlebars.SafeString( init.join("\n"));
		},

		"defenseBreakdown": function (persona: Persona, defense: Defense) :SafeString {
			const SS = new Handlebars.SafeString(persona.printableDefenseMods(defense)
				.map (x=> `${x}`.trim())
				.join("\n")
			);
			return SS;
		},

		"statValue" : (persona: Persona, stat: PersonaStat) : number => {
			switch (stat) {
				case "str":
					return persona.combatStats.strength;
				case "mag":
					return persona.combatStats.magic;
				case "end":
					return persona.combatStats.endurance;
				case "luk":
					return persona.combatStats.luck;
				case "agi":
					return persona.combatStats.agility;
			}
		},


		"isGM" : () => {
			return game.user.isGM;
		},

		"isPC": (actor: PersonaActor) : boolean => {
			return actor.isPC();
		},

		"isRealPC" :(actor: PersonaActor) : boolean => {
			return actor.isRealPC();
		},

		"abs" : (x:string | number) => {
			return Math.abs(Number(x));
		},

		"isPCOrNPCAlly": function (actor: PersonaActor): boolean {
			return actor.isRealPC() || actor.isNPCAlly();

		},
		"canGainLevels": function (actor: PersonaActor) : boolean {
			if (!actor.isValidCombatant()) {return false;}
			return actor.isRealPC() || actor.isNPCAlly() || actor.isDMon() || actor.isPersona();
		},
		"isShadow" : (actor: PersonaActor) => {
			return actor.isShadow();
		},

		"isShadowOrNPCAlly" : (actor: PersonaActor) => {
			return actor.isShadow() || actor.isNPCAlly();
		},

		"arrIncludes": function (arr: string[], value: string): boolean {
			return arr.includes(value);
		},
		"strIncludes" : (testStr: string | undefined, substr: string) => {
			if (!testStr) {return false;}
			return testStr.includes(substr);
		},

		"getTalentLevel": (persona: Persona, talent: Talent) : string => {
			const numLevel = persona.getTalentLevel(talent);
			return game.i18n.localize(`persona.talentLevels.${numLevel}.name`);
		},

		"meetsSLRequirement": ( owner: PC, focus: Focus) => {
			return owner.meetsSLRequirement(focus);
		},

		"meetsSLRequirementNPC": (benefit: SocialBenefit) => {
			if (game.user.isGM) {return true;}
			const pc= game.user.character as PersonaActor;
			if (!pc || pc.system.type != "pc") {return false;}
			return (pc as PC).meetsSLRequirement(benefit.focus);
		},

		"getWeaponDR": function (persona: Persona) : number {
			// const DR = persona.combatStats.physDR();
			const DR = persona.combatStats.armorDR();
			DR.setMinValue(-Infinity);
			return Math.abs(DR.eval().hpChange);
		},
		"getMagicDR": function (persona: Persona) : number {
			const DR = persona.combatStats.magDR();
			DR.setMinValue(-Infinity);
			return Math.abs(DR.eval().hpChange);
		},

		"WeaponDRBreakdown": function (persona: Persona) : string {
			const DR = persona.combatStats.armorDR();
			// const DR = persona.combatStats.physDR();
			DR.setMinValue(-Infinity);
			return DR.eval().str.join("\n");
		},
		"MagicDRBreakdown": function (persona: Persona) : string {
			const DR = persona.combatStats.magDR();
			DR.setMinValue(-Infinity);
			return DR.eval().str.join("\n");
		},

		"getCriticalBoostEstimate" : function (actor: PC | Shadow, power: Usable) : number {
			const situation : Situation = {
				usedPower: power.accessor,
				attacker: actor.accessor,
				user: actor.accessor,
			};
			const critBonus = PersonaCombat.calcCritModifier(actor, actor, power, situation);
			return critBonus.eval(situation).total;
		},
		"getTokenAccName" : (tokenAcc: UniversalTokenAccessor<PToken> | UniversalActorAccessor<PC | Shadow>) =>  {

			if ("actorId" in tokenAcc) {
				const token = PersonaDB.findToken(tokenAcc.token);
				return token?.name ?? PersonaDB.findActor(tokenAcc).name ?? "Unknown Token";
			}
			const token = PersonaDB.findToken(tokenAcc);
			return token.name;
		},


		'isOldFormValue': function (val: ConsequenceAmount) : boolean {
			return (typeof val == "number");
		},

		'canUseShortFormPower': (power: Power): boolean => {

			return power.isPassive() || power.isDefensive() || power.isSupport();
		},

		'canUsePower': (persona:Persona, power: Power) : boolean => {
			try {
			return persona.canUsePower(power, false);
			// return persona.canUsePower(power, false) && power.system?.subtype != "passive" && power.system?.subtype != "defensive" ;
			} catch (e) {
				Debug(persona);
				console.log(e);
				return false;
			}
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
			if (!linkData) {return false;}
			const highest = linkData.actor.highestLinker();
			return highest.linkLevel == linkData.linkLevel;
		},

		'eqAny': function (testCase: string, ...rest: string[]) : boolean {
			return rest.some( str => str == testCase);
		},

		'neAll': function (testCase: string, ...rest: string[]) : boolean {
			return rest.every( str => str != testCase);
		},

		"strcat": function (...args: (string | number)[]) : string{
			let str = "";
			for (const arg of args)  {
				switch (typeof arg) {
					case "string":
					case "number":
						str += String(arg);
						break;
					default:
						break;
				}
			}
			return str;
		},

		"getEffectFlagName" : function (acc: UniversalActorAccessor<PC | Shadow>, flagEffect: SetFlagEffect): string {
			const actor = PersonaDB.findActor(acc);
			const flag = actor.getEffectFlag(flagEffect.flagId);
			if (flag) {return flag?.flagName ?? flagEffect?.flagName ?? flag.flagId;}
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
				{return str.trim();}
			else {return str;}
		},

		"choiceMeetsConditions": function(cardData: CardData, choice: SocialCard["system"]["events"][number]["choices"][number]) : boolean {
			const conditions = choice.conditions ?? [];
			if (choice.resourceCost > 0) {
				conditions.push( {
					type: "numeric",
					comparisonTarget: "has-resources",
					comparator: ">=",
					num: choice.resourceCost,
				});
			}
			const sourced = conditions.map( cond => ({
				...cond,
				owner: undefined,
				source: undefined,
				realSource: undefined,
			}));
			return testPreconditions(sourced, cardData.situation);

		},
		"meetsConditions" : function (cardData: CardData, conditions: SourcedPrecondition[]) : boolean {
			return testPreconditions(conditions ?? [], cardData.situation);
		},

		"isActivitySelectable": function (pc: PC, activity: Activity): boolean {
			return PersonaSocial.isActivitySelectable(activity, pc);
			// if (!activity.system.weeklyAvailability.available)
			// 	{return false;}
			// if ((pc.system.activities.find( act=> act.linkId == activity.id)?.strikes ?? 0) >= 3)
			// 	{return false;}
			// const situation : Situation=  {
			// 	user: pc.accessor,
			// 	attacker: pc.accessor,
			// };
			// const sourced=  (activity.system.conditions ?? []).map( cond => ({
			// 	owner: undefined,
			// 	source: undefined,
			// 	realSource: undefined,
			// 	...cond,
			// }));
			// return testPreconditions(sourced, situation);
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
				case "crit": {
					const str = "CRITICAL";
					if (result.hitResistance)
						{return str  + " (RESIST)";}
					if (result.hitWeakness)
						{return str + " (WEAK)";}
					return str;
				}
				case "hit":
					if (result.hitResistance)
						{return "RESIST";}
					if (result.hitWeakness)
						{return "WEAK";}
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

		"multicheck": function (name: string, list: Record<string, string>, options: {hash: {localize: boolean, checked: (Record<string, boolean> | string | undefined)}}) : SafeString {
			let checkedTable = options?.hash?.checked;
			if (typeof checkedTable == "string") {
				const newobj= {} as Record<string, boolean>;
				if (checkedTable.length >0) {
					newobj[checkedTable] = true;
				}
				checkedTable = newobj;
			}
			if (checkedTable == undefined) {
				checkedTable = {};
			}
			let html = "";
			html += `<div class="multi-check" data-name="${name}">`;
			const hash = options?.hash ?? undefined;
			const selected= Object.entries(checkedTable ?? {})
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
				checked = checkedTable[key] ?? false;
				html += `<input type="checkbox" name="${name}.${key}" ${ (checked) ? 'checked' : ""} >`;
				html += `</span>`;
			}
			html+= `</div>`;
			html += `</div>`;
			return new Handlebars.SafeString(html);
		},

		"inCombat": function() : boolean {
			if (!game.combat) {return false;}
			return (game.combat.combatants.contents.some( x=> (x?.actor as PersonaActor)?.isShadow()));
		},

		"inventoryLocked": function() : boolean {
			if (game.user.isGM) {return false;}
			if (!game.combat) {return false;}
			return (!(game.combat as PersonaCombat).isSocial);
		},

		"signed" : function(num: string | number) : SafeString {
			num = Number(num);
			if (num >=0) {return new Handlebars.SafeString(`+${num}`);}
			else {return new Handlebars.SafeString(`${num}`);}
		},

		"localizeDamageType": function (dtype:DamageType ) : string {
			return game.i18n.localize(DAMAGETYPES[dtype]);
		},
		"getProp": function (object: object, path: string) : unknown {
			while (path.endsWith(".")) {
				path = path.slice(0, -1);
			}
			try {
				return foundry.utils.getProperty(object, path);
			}
			catch (e) {
				console.trace();
				console.error(e);
				Debug(object);
				console.log(`Error on path ${path}`);
			}
		},
		"powerStuff" : function () : object {
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
			if (pc.system.type != "pc") {return false;}
			return PersonaSocial.meetsConditionsToStartLink(pc, target);
		},

		"getItemTagList": function (item: Usable | InvItem | Weapon) : SafeString {
			const list = item.tagList(null);
			return new Handlebars.SafeString(
				list.map( i => {
					if (i instanceof PersonaItem) {
						return `<span class="tag" title="${i.system.description ?? ''}">
							${i.displayedName.toString()}
</span>`;
					}
					const tagSearch = POWER_TAGS[i as keyof typeof POWER_TAGS];
					if (tagSearch) {
						return localize(tagSearch);
					}
					return i;
				})
				.join(", ")
			);
			// .map( x=> new Handlebars.SafeString(x));
		},

		"tagTooltip" : function (item: string): SafeString {
			const tag = PersonaDB.allTags().get(item) ?? PersonaDB.allTagLinks().get(item) ?? "";
			if (typeof tag == "string") {return new Handlebars.SafeString("");}
			return tag.description;
		},

		"getCreatureTagList": function (actor: PersonaActor) : SafeString[] {
			const ret =  actor.tagList.map(tag=> {
				if (tag instanceof PersonaItem) {return tag.displayedNameHTML;}
				return new Handlebars.SafeString(localize(CREATURE_TAGS[tag]));
			});
			return ret;
		},
		"getSocialCardTagList": function (card: SocialCard) : string {
			return card.cardTags;
		},
		"hasTag": function (source: PersonaActor | PersonaItem, tagName: string) : boolean {
			switch (true) {
				case source instanceof PersonaActor :{
					return source.tagList.includes(tagName as typeof source.tagList[number]);
				}
				case source instanceof PersonaItem: {
					const list = (source as Usable).tagList(null);
					return list.includes (tagName as typeof list[number]);
				}
				default:
					return false;
			}
		},
		"getEventTagList": function (event: SocialCard["system"]["events"][number]) {
			const tags= event.eventTags.map(tag => localize(ROLL_TAGS_AND_CARD_TAGS[tag]));
			return tags.join(", ");
		},

		"eq-m": function<T> (comparisonOne:T, ...compArr: T[]) {
			return compArr.some(x=> x == comparisonOne);
		},
		"neq-m": function<T> (comparisonOne:T, ...compArr: T[]) {
			return compArr.every(x=> x != comparisonOne);
		},
		"replace": function(originalString: string = "ERROR", replacementSet: Record<string, string> = {}): string {
			return Helpers.replaceAll(originalString, replacementSet);
		},
		"isPowerIllegal":  function (persona: Persona, power: Power): boolean {
			return power.system.slot > persona.highestPowerSlotUsable();
		},
		"canUseTalents": function (actor: PersonaActor) : boolean {
			return actor.isValidCombatant();
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
			return item.isTrulyUsable() && !item.isMinorActionItem();
		},
		"hpCost": function (item: Power) : number {
			return item.hpCost();
		},

		"getAttackBonus": function (persona: Persona, power: Usable) : number {
			const situation : Situation = {
				attacker: persona.user.accessor,
				user: persona.user.accessor,
				usedPower: power.accessor,
			};
			return PersonaCombat.getAttackBonus(persona, power, undefined).eval(situation).total;
		},

		"powerCostString": function (power: Power, persona: Persona)  : SafeString {
			try {
			return new Handlebars.SafeString(power.costString1(persona));
			} catch {return new Handlebars.SafeString("ERROR");}
		},

		"isExotic" : function (power: Power) : boolean {
			return power.hasTag("exotic");
		},

		"simplePowerCost": function (power: Power) : string {
			const customCost = power.customCost ? "*" : "";
			if (power.isWeaponSkill()) {
				const hpCost = power.hpCost();
				return `${hpCost}${customCost}% HP`;
			}
			if (power.isMagicSkill()) {
				const mpCost = power.mpCost(null);
				return `${mpCost}${customCost} MP`;
			}
			return "";
		},

		"localizeDamageLevel": function (pwr: Power) : SafeString {
			const dlevel = pwr.system.damageLevel;
			const lvlLocString = DAMAGE_LEVELS[dlevel];
			const localized = localize(lvlLocString);
			if (localized) {
				return new Handlebars.SafeString(localized);
			}
			return new Handlebars.SafeString("");
		},

		"costString": function () {
			return "ERROR";
		},

		"localizeKillLevel": function (pwr: Power) : SafeString {
			const dlevel = pwr.system.instantKillChance;
			const lvlLocString = INSTANT_KILL_LEVELS[dlevel];
			const localized = localize(lvlLocString);
			if (localized) {
				return new Handlebars.SafeString(localized);
			}
			return new Handlebars.SafeString("");
		},

		"localizeAilmentLevel": function (pwr: Power) : SafeString {
			const dlevel = pwr.system.ailmentChance;
			const lvlLocString = INSTANT_KILL_LEVELS[dlevel];
			const localized = localize(lvlLocString);
			if (localized) {
				return new Handlebars.SafeString(localized);
			}
			return new Handlebars.SafeString("");
		},

		"ternIf": function (cond: boolean, r1: unknown, r2: unknown) {
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
		"persona": function (actor: ValidAttackers) : Persona {
			return actor.persona();
		},

		"elemResist": function (actorOrPersona: ValidAttackers | Persona, resistType: Exclude<DamageType, "by-power">) : string {
			const persona = (actorOrPersona instanceof PersonaActor) ? actorOrPersona.persona() : actorOrPersona;
			const resist= persona.elemResist(resistType);
			return game.i18n.localize(RESIST_STRENGTHS[resist]);
		},

		"scanLevel": function (persona: Persona) : number {
			return persona.effectiveScanLevel;
		},

		"scanLevelgte": function (persona: Persona, val: number) : boolean {
			if (game.user.isGM) {return true;}
			return persona.effectiveScanLevel >= val;
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
				.map (t => localize(ROLL_TAGS_AND_CARD_TAGS[t]));
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
			const filepath = DAMAGE_ICONS[damageType];
			const locName = localize(DAMAGETYPES[damageType]);
			if (!locName || !filepath) {return new Handlebars.SafeString("");}
			return new Handlebars.SafeString(`<img class="damage-icon" src='${filepath}' title='${locName}'>`);
		},

		"displayIcon": function (item :Power | Carryable, user: Persona | ValidAttackers) : SafeString {
			const filepath =  item.getIconPath(user);
			if (!filepath) {return new Handlebars.SafeString("");}
			return new Handlebars.SafeString(`<img class="item-icon" src='${filepath}' title='${item.displayedName.toString()}'>`);

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

		"displayPowerIcon": function (power: Usable, user: ValidAttackers | Persona) : SafeString {
			const str =  power.getDisplayedIcon(user);
			if (!str) { return new Handlebars.SafeString("");}
			return str;
		},

		"getConditionalType": function (ce: ConditionalEffect) : string{
			let item : PersonaItem | undefined;
			let someObj : object = ce;
			while (someObj && "parent" in someObj) {
				if (someObj instanceof PersonaItem) {
					item = someObj;
					break;
				}
				if (typeof someObj["parent"] == "object") {
					someObj = someObj["parent"] as object;
				}
			}
			return ConditionalEffectManager.getConditionalType(ce, item as ContainerTypes);
		},

		"hasPersona": function (actor: PersonaActor) : boolean {
			if (actor.isRealPC() || actor.isNPCAlly()) {return true;}
			if (actor.isShadow())  {
				return (actor.persona().source != actor);
			}
			return false;
		},

		"cutEndOfString": function (str: string) : string{
			return str.substring(0, str.length-1);
		},

		"defVal": function <T extends string | number>(thing:T, defaultV: T) {
			if (thing != undefined) {return thing;}
			return defaultV;
		},

		"canRaiseStat": function (persona: Persona, stat: PersonaStat) : boolean {
			if (persona.unspentStatPoints <= 0) {return false;}
			return persona.combatStats.canRaiseStat(stat);
		},

		"getWeaponDamageAmt": function (weapon: Weapon) {
			return weapon.baseDamage().baseAmt;
		},

		"resistStr": function (persona: Persona) {
			return persona.printableResistanceString;
		},

		"hpBreakdown": function (actor: ValidAttackers) {
			return new Handlebars.SafeString(
				actor.mhpCalculation().steps.join("\n")
			);
		},

		"mpBreakdown": function (actor: ValidAttackers) {
			return new Handlebars.SafeString( 
				actor.mmpCalculation().steps.join("\n")
			);
		},
		"localizeDefenseTarget": function (power:Power ) : string {
			const defense = power.system.defense;
			return game.i18n.localize(DEFENSE_TYPES[defense]);
		},
		"powerTargetsAbbrev": function (power: Power) : string {
			let retstr = "";
			if (power.system.attacksMax > 1) {
				retstr += `(${power.system.attacksMin}-${power.system.attacksMax})`;
			}
			if (power.isMultiTarget())
			{retstr+= "M";} else  {
				retstr += "S";
			}
			if (power.system.targets.includes("random"))
			{ retstr+= "R"; }
			return retstr;
		},

		"iff": function (cond: boolean, choice1: unknown, choice2: unknown) : unknown {
			return cond ? choice1 : choice2;
		},

		"disableHPMPChange": function () : boolean {
			if (game.user.isGM) {return false;}
			const combat = game.combat as U<PersonaCombat>;
			return (combat != undefined && !combat.isSocial);
		},

		"isSimulated": function (persona: Persona) : boolean{
			const source = persona.source;
			if (source.isShadow() && source.system.creatureType == "daemon") {return true;}
			return source.hasTag("simulated");
		},
		"armorDR": function (item: InvItem) {
			return item.armorDR();
		},

		"getModifierTypesByCategory": function (category: U<keyof typeof MODIFIER_CATEGORIES>) {
			if (!category)
			{return MODIFIERS_TABLE;}
			if (!(category in MODIFIER_CATEGORIES)) {return {};}
			const baseObject = MODIFIER_CATEGORIES[category] ?? {};
			return HTMLTools.createLocalizationObject(baseObject, "persona.modifier");
		},
		"levelSampleArray" : function () : number[] {
			return [1,10,20,30,40,50,60,70,80,90,100];
		},
		"HPAtLevel": function (cl:CClass, lvl: number) : number{
			return cl.getClassMHP(lvl);
		},
		"MPAtLevel": function (cl:CClass, lvl: number) : number{
			return cl.getClassMMP(lvl);
		},

		"canChangePodStatus": function (_actor: PersonaActor)  : boolean {
			if (game.user.isGM) {return true;}
			const combat =  game.combat as PersonaCombat;
			return (combat != undefined && combat.isSocial);

		},
		"tarotFocii": function (actor: PersonaActor) : Focus[] {
			const sortFn = function (a: Focus, b: Focus) {
				return a.requiredLinkLevel() - b.requiredLinkLevel();
			};
			return actor.focii()
				.sort( sortFn) ;
		},
		"hasDescriptionText": function(power:Power) : boolean{
			return (power.system.description ?? "").length > 0;
		},

		"baseShadowCostString": function (power: Power) : string {
			if (!power.isPower()) {return "";}
			const cost = EnergyClassCalculator.calcBaseEnergyCost(power);
			return `${Math.round(cost.energyCost)}R${Math.round(cost.energyRequired)}`;

		},

		"canEditBasePersona": function (actor: PersonaActor) : boolean {
			if (game.user.isGM) {return true;}
			if (!actor.isOwner) {return false;}
			if (actor.isPC()) {return true;}
			if (actor.isShadow()) {
				if (actor.isCustomPersona())  {return true;}
			}
			return false;
		},

		"XPRequiredForLevelUp": function (persona: Persona) {
			const level = persona.level;
			return LevelUpCalculator.minXPForEffectiveLevel(level +1);
		},

		"hasMultiplePersonas": function (actor: PersonaActor) : boolean {
			return !actor.hasSoloPersona;
		},

		"PersonaListContainsBasePersona": function (actor: PersonaActor): boolean {
			const basePersona = actor.basePersona;
			return actor.personaList.some( persona=> persona.equals (basePersona));
		},

		"isPersona": function (actor: PersonaActor) : boolean {
			return actor.isPersona();
		},

		"isOwner": function (actor: PersonaActor) : boolean {
			return actor.isOwner;
		},

		"debugMode": function() : boolean {
			return PersonaSettings.debugMode();
		},

		"canUseSideboard": function (actor: PersonaActor) : boolean {
			return actor.isValidCombatant() && actor.class?.system?.canUsePowerSideboard && !actor.isNPCAlly();
		},

		"resolvedPowerTagList": function (item: Power | Consumable) : string[]{
			return item.system.tags
				.map( tagString =>  {
					const tag = PersonaDB.allTagLinks().get(tagString);
					return tag ? tag.id : tagString;
				});
		},

		"isCopyableToCompendium": function (actor: PersonaActor): boolean {
			return actor.isShadow() && actor.isPersona() && !actor.isCompendiumEntry();
		},

		"fusionResult": function (s1: Shadow, s2: Shadow) : U<Shadow> {

			return FusionTable.fusionResult(s1, s2);
		},

		"isFoe": function (actor: PersonaActor) : boolean {
			return actor.isShadow() && !actor.hasPlayerOwner && !actor.isPersona() && !actor.isDMon();
		},
		"DamageBalanceCheck": async function (actor: PersonaActor, power: Usable) : Promise<string> {
			const token = game.scenes.current.tokens.find( x=> x.actor == actor);
			if (!token) {return "No token to test balance";}
			const test = await PersonaCombat.testPowerVersusPCs(token as PToken, power);
			return test
			.join(", ");
		},

	};
} //end of class
