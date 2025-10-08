/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { WEAPON_TAGS } from "../config/equipment-tags.js";
// import { NumericV2 } from "./conditionalEffects/numericV2.js";
import { CombatResultComparison } from "../config/numeric-comparison.js";
import { DAMAGE_SUBTYPES } from "../config/effect-types.js";

import { ROLL_TAGS_AND_CARD_TAGS } from "../config/roll-tags.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { ModifierTarget } from "../config/item-modifiers.js";
import { getActiveConsequences } from "./preconditions.js";
import { ModifierContainer, PersonaItem, Talent } from "./item/persona-item.js";
import { STATUS_EFFECT_DURATION_TYPES } from "../config/status-effects.js";
import { Helpers } from "./utility/helpers.js";
import { multiCheckToArray } from "./preconditions.js";
import { TAROT_DECK } from "../config/tarot.js";
import { localize } from "./persona.js";
import { CREATURE_TAGS } from "../config/creature-tags.js";
import { MODIFIERS_TABLE } from "../config/item-modifiers.js";
import { Consequence, ConsequenceAmount, LEVEL_GAIN_TARGETS, NonDeprecatedConsequence } from "../config/consequence-types.js";
import { RESIST_STRENGTHS } from "../config/damage-types.js";
import { STUDENT_SKILLS } from "../config/student-skills.js";
import { SLOTTYPES } from "../config/slot-types.js";
import { CREATURE_TYPE } from "../config/shadow-types.js";
import { SHADOW_ROLE } from "../config/shadow-types.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { DAYS } from "../config/days.js";
import { WEATHER_TYPES } from "../config/weather-types.js";
import { TARGETING } from "../config/effect-types.js";
import { POWERTYPES } from "../config/effect-types.js";
import { DAMAGETYPES } from "../config/damage-types.js";
import { POWER_TAGS } from "../config/power-tags.js";
import { CONDITION_TARGETS } from "../config/precondition-types.js";
import { TRIGGERS } from "../config/triggers.js";
import { MultiCheck } from "../config/precondition-types.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../config/status-effects.js";
import { HTMLTools } from "./utility/HTMLTools.js";
import { PersonaError } from "./persona-error.js";
import { PreconditionType } from "../config/precondition-types.js";
import { ConsequenceType } from "../config/effect-types.js";
import { CONSQUENCELIST } from "../config/effect-types.js";
import { PRECONDITIONLIST } from "../config/precondition-types.js";
import { PersonaDB } from "./persona-db.js";
import {ConsequenceConverter} from "./migration/convertConsequence.js";
import {ValidAttackers} from "./combat/persona-combat.js";
import {PersonaAE} from "./active-effect.js";

export class ConditionalEffectManager {

	static lastClick: string;

	static clipboard: {
		condition ?: Precondition;
		consequence ?: Consequence;
		effect ?: ConditionalEffect;
	} = {
		condition : undefined,
		consequence: undefined,
		effect: undefined,
	};

	static async alterConditionalEffect<const TP extends string, const P extends string,const  D extends FoundryDocument<any>, Data extends GetProperty<D, P>>(topPath: TP, dataPath: P, action: CEAction, owner: D) {
		const master  = topPath as string != dataPath as string ? new EMAccessor<Data>(owner, topPath) : undefined;
		const acc = new EMAccessor<Data>(owner, dataPath, master);
		switch (action.type) {
			case "create-effect":
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).addConditionalEffect(action.effect);
			case "delete-effect":
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).deleteConditionalEffect(action.effectIndex);
			case "create-conditional" :
				// @ts-expect-error weird type error
				return await acc.addNewCondition(action.conditional, action.effectIndex);
			case "create-consequence":
				// @ts-expect-error weird type error
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).addNewConsequence(action.consequence, action.effectIndex);
			case "delete-conditional":
				// @ts-expect-error weird type error
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).deleteCondition(action.condIndex, action.effectIndex);
			case "delete-consequence":
				// @ts-expect-error weird type error
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).deleteCondition(action.consIndex, action.effectIndex);
			default:
				throw new PersonaError(`Unknown Action Type: ${(action as any)?.type}`);
		}
	}

	static #getPaths(ev: JQuery.ClickEvent) {
		let topPath = HTMLTools.getClosestData(ev, "topPath").trim();
		if (topPath.endsWith(".")) {
			topPath = topPath.slice(0, -1);
		}
		if (!topPath) {
			throw new PersonaError("No Top Path Given!");
		}
		let dataPath = HTMLTools.getClosestData(ev, "path").trim();
		const removeTrail = 	function removeTrailingNumber(input: string): string {
			const regex = /^(.*?)(\d+)$/;
			const match = input.match(regex);
			if (match) {
				return match[1];
			}
			return input;
		};
		if (dataPath.endsWith(".")) {
			dataPath = dataPath.slice(0,-1);
		}
		dataPath = removeTrail(dataPath);
		while (dataPath.endsWith(".")) {
			dataPath = dataPath.slice(0,-1);
		};
		if (!dataPath) {
			throw new PersonaError("No Data Path Given!");
		}
		return { topPath, dataPath };
	}

	static canModifyStat (effects: readonly ConditionalEffect[] | ConditionalEffect, stat: ModifierTarget): boolean {
		effects = Array.isArray(effects) ? effects : [effects];
		return effects.some( eff => eff.consequences.some( c=> {
			if ( "modifiedField" in c ) {
				if (c.modifiedField == stat) {return true;}
			}
				if ( "modifiedFields" in c) {
					if (c.modifiedFields[stat] == true)
						{return true;}
				}
			return false;
		})
		);
	}

	static getAllActiveConsequences(condEffects: readonly SourcedConditionalEffect[], situation: Situation) : Consequence[] {
		return condEffects.flatMap( effect=> getActiveConsequences(effect, situation));
	}

	static #getEffectIndex(ev: JQuery.ClickEvent) {
		const effectIndex = Number(HTMLTools.getClosestDataSafe(ev, "effectIndex", -1));
		return effectIndex >= 0 ? effectIndex: undefined;
	}

	static async handler_addPowerEffect<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		let effect : ConditionalEffect  | undefined = undefined;
		if ("defaultConditionalEffect" in item.sheet && typeof item.sheet.defaultConditionalEffect == "function") {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			effect = item.sheet.defaultConditionalEffect(ev) as ConditionalEffect;
		}

		const action : CEAction= {
			type: "create-effect",
			effect
		};
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_deletePowerEffect<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const effectIndex = this.#getEffectIndex(ev);
		if (effectIndex == undefined) {throw new PersonaError("Can't get effect Index");}
		const action : CEAction= {
			type: "delete-effect",
			effectIndex
		};
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_addPrecondition<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const effectIndex = this.#getEffectIndex(ev);
		const action : CEAction= {
			type: "create-conditional",
			effectIndex
		};
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_addConsequence<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const effectIndex = this.#getEffectIndex(ev);
		const action : CEAction= {
			type: "create-consequence",
			effectIndex
		};
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_deleteConsequence<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const consIndex = Number(HTMLTools.getClosestData(ev, "consequenceIndex"));
		const effectIndex = this.#getEffectIndex(ev);
		const action : CEAction= {
			type: "delete-consequence",
			effectIndex,
			consIndex,
		};
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_deletePrecondition<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const condIndex = Number(HTMLTools.getClosestData(ev,
			"preconditionIndex"));
		const effectIndex = this.#getEffectIndex(ev);
		const action : CEAction= {
			type: "delete-conditional",
			effectIndex,
			condIndex,
		};
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_pasteEffect<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const data = this.clipboard.effect;
		if (!data) {
			throw new PersonaError("Can't paste no data");
		}
		const action : CEAction= {
			type: "create-effect",
			effect:data,
		};
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_pasteCondition<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const data = this.clipboard.condition;
		if (!data) {
			throw new PersonaError("Can't paste no data");
		}
		const effectIndex = this.#getEffectIndex(ev);
		const action : CEAction= {
			type: "create-conditional",
			effectIndex,
			conditional: data,
		};
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);

	}

	static async handler_pasteConsequence<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const data = this.clipboard.consequence;
		if (!data) {
			throw new PersonaError("Can't paste no data");
		}
		const effectIndex = this.#getEffectIndex(ev);
		const action : CEAction= {
			type: "create-consequence",
			effectIndex,
			consequence: data,
		};
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);


	}

	static handler_copyEffect<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item:D) {
		const effectIndex = this.#getEffectIndex(ev);
		if (effectIndex == undefined ) {
			throw new PersonaError("Can't get effect index");
		}
		const {topPath, dataPath} = this.#getPaths(ev);
		const master  = topPath != dataPath ? new EMAccessor<D>(item, topPath) : undefined;
		const acc = new EMAccessor<D>(item, dataPath, master);
		this.clipboard.effect = acc.data[effectIndex] as ConditionalEffect;
	}

	static handler_copyCondition<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item:D) {
		const condIndex = Number(HTMLTools.getClosestData(ev,
			"preconditionIndex"));
		// const effectIndex = this.#getEffectIndex(ev);
		const {topPath, dataPath} = this.#getPaths(ev);
		const master  = topPath != dataPath ? new EMAccessor<D>(item, topPath) : undefined;
		const acc = new EMAccessor<D>(item, dataPath, master);
		this.clipboard.condition = acc.data[condIndex] as Precondition;
	}

	static handler_copyConsequence<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item:D) {
		const consIndex = Number(HTMLTools.getClosestData(ev, "consequenceIndex"));
		// const effectIndex = this.#getEffectIndex(ev);
		const {topPath, dataPath} = this.#getPaths(ev);

		const master  = topPath != dataPath ? new EMAccessor<D>(item, topPath) : undefined;
		const acc = new EMAccessor<D>(item, dataPath, master);
		this.clipboard.consequence = acc.data[consIndex] as Consequence;
	}

	static handler_clickMCSelected<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, _item: D) {
		ev.stopPropagation();
		// $(ev.currentTarget).parent().find(".MC-selectors").toggleClass("hidden");
		// this.lastClick = "";
	}

	static handler_clickMCSelector<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, _item: D) {
		ev.stopPropagation();
		console.log("ClickMC selector");
		$(ev.currentTarget).parent().find(".MC-selectors").toggleClass("hidden");
		this.lastClick= HTMLTools.getClosestDataSafe(ev.currentTarget, "name", "");
		if (this.lastClick == "") {
			// eslint-disable-next-line no-debugger
			debugger;
		}
	}

	static applyHandlers<D extends FoundryDocument<any>>(html: JQuery, doc: D) {
		html.find(".add-effect").on("click", (ev) => {void this.handler_addPowerEffect(ev, doc);});
		html.find(".del-effect").on("click", (ev) => {void this.handler_deletePowerEffect(ev, doc);});
		html.find(".add-condition").on("click", (ev) => {void this.handler_addPrecondition(ev, doc);});
		html.find(".add-consequence").on("click", (ev)=> {void this.handler_addConsequence(ev,doc);});
		html.find(".del-consequence").on("click", (ev) => {void this.handler_deleteConsequence(ev, doc);});
		html.find(".del-condition").on("click", (ev) => { void this.handler_deletePrecondition(ev,doc);});
		html.find(".paste-effect").on("click", (ev) => {void this.handler_pasteEffect(ev, doc);});
		html.find(".paste-consequence").on("click", (ev) => {void this.handler_pasteConsequence(ev, doc);});
		html.find(".paste-condition").on("click", (ev) => { void this.handler_pasteCondition(ev, doc);});
		html.find(".copy-effect").on("click", (ev) => void this.handler_copyEffect(ev, doc));
		html.find(".copy-consequence").on("click", (ev) => void this.handler_copyConsequence(ev, doc));
		html.find(".copy-condition").on("click", (ev) => void this.handler_copyCondition(ev, doc));
		html.find("div.multi-check .selected").on("click", (ev) => void this.handler_clickMCSelector(ev, doc));
		html.find(".MC-selectors").on("click", (ev) => void this.handler_clickMCSelected(ev, doc));
		// setTimeout( () => this.restoreLastClick(html), 100);
	}

	static getEffects<T extends PersonaActor, I extends ConditonalEffectHolderItem> (CEObject: DeepNoArray<ConditionalEffect[]> | ConditionalEffect[], sourceItem: I | null, sourceActor: T | null) : SourcedConditionalEffect[] {
			const conditionalEffects = Array.isArray(CEObject) ? CEObject : this.ArrayCorrector(CEObject);
		return conditionalEffects.map( ce=> {
			const conditions = this.getConditionals(ce.conditions, sourceItem, sourceActor);
			const consequences= this.getConsequences(ce.consequences, sourceItem, sourceActor);
			const forceDefensive = (sourceItem?.isDefensive)
				? sourceItem.isDefensive()
				: false;
			let conditionalType : TypedConditionalEffect["conditionalType"];
			const isDefensive= (ce.isDefensive || forceDefensive) ?? false;
			switch (true) {
				case forceDefensive || ce.isDefensive: 
					conditionalType = "defensive";
					break;
				default:
					conditionalType = !forceDefensive ? this.getConditionalType({conditions, consequences, isDefensive}, sourceItem): "defensive";
					if (conditionalType == "unknown" && sourceItem) {
						conditionalType = (sourceItem.defaultConditionalEffectType) ? sourceItem.defaultConditionalEffectType() : "passive";
					}
			}
			return {
				conditionalType,
				// conditions,
				conditions,
				consequences,
				// consequences,
				isDefensive: conditionalType == "defensive",
				owner: sourceActor?.accessor,
				source: sourceItem != null ? sourceItem : undefined,
				// sourceItem: sourceItem? PersonaDB.getUniversalAccessor(sourceItem): undefined,
			};
		}
		);
	}

static getConditionalType<I extends ConditonalEffectHolderItem>( ce: ConditionalEffect, sourceItem ?: I | null ) : TypedConditionalEffect["conditionalType"] {
	if (ce.isDefensive) {return "defensive";}
	for (const cond of ce.conditions) {
		if (this.isTriggeredCondition(cond)) {
			return "triggered";
		}
	}
	for (const cons of ce.consequences) {
		switch (true) {
			case this.isBonusConsequence(cons):
			case this.grantsPowers(cons) :
			case this.changesResistance(cons) :
				return "passive";
		}
	}
	if (sourceItem && sourceItem.defaultConditionalEffectType) {
		return sourceItem.defaultConditionalEffectType();
	}
	return "unknown";
}

static grantsPowers(cons: ConditionalEffect["consequences"][number]) : boolean {
	return cons.type == "add-power-to-list";
}

static changesResistance(cons: ConditionalEffect["consequences"][number]) : boolean {
	switch (cons.type) {
		case "raise-resistance":
		case "raise-status-resistance":
		case "lower-resistance":
			return true;
	}
	return false;

}

	static hasSocialQualifier(cond: ConditionalEffect["conditions"][number]) : boolean {
		if (cond.type == "numeric" && cond.comparisonTarget == "social-link-level") {return true;}
		return false;
	}

	static isBonusConsequence(cons: ConditionalEffect["consequences"][number]) : boolean {
		return (cons.type == "modifier-new"
			|| cons.type =="modifier"
		);
	}

		static isTriggeredCondition(cond: ConditionalEffect["conditions"][number]): boolean {
			return (cond.type == "on-trigger");
		}

	static getConditionals<T extends PersonaActor, I extends ModifierContainer & (Item | ActiveEffect)>(condObject: DeepNoArray<ConditionalEffect["conditions"]>, sourceItem: I | null, sourceActor: T | null): SourcedConditionalEffect["conditions"] {
		const conditionalEffects = this.ArrayCorrector(condObject);
		return conditionalEffects.map( eff=> ({
			...eff,
			owner: (sourceActor? PersonaDB.getUniversalActorAccessor(sourceActor) : undefined) as UniversalActorAccessor<ValidAttackers>,
			source: sourceItem != null ? sourceItem : undefined,
		}));
	}

static getConsequences<T extends PersonaActor, I extends (ModifierContainer & (PersonaItem | PersonaAE))>(consObject: DeepNoArray<ConditionalEffect["consequences"]>, sourceItem: I | null, sourceActor: T | null): SourcedConditionalEffect["consequences"] {
	const consequences = this.ArrayCorrector(consObject);
	return consequences.map( eff=> {
		const nondep = ConsequenceConverter.convertDeprecated(eff, sourceItem instanceof Item ? sourceItem : null);
		// const SI = (sourceItem ? PersonaDB.getUniversalAccessor(sourceItem): (("sourceItem" in eff) ? eff.sourceItem : undefined));
		return {
			...nondep,
			owner: (sourceActor? PersonaDB.getUniversalActorAccessor(sourceActor) : eff.actorOwner) as UniversalActorAccessor<ValidAttackers>,
			source: sourceItem != null ? sourceItem: undefined,
		};
	});
}

	static ArrayCorrector<T>(obj: T[] | Record<string | number, T>) : T[] {
		// eslint-disable-next-line no-useless-catch
		try {
			if (obj == null) {return[];}
			if (!Array.isArray(obj)) {
				if (PersonaSettings.debugMode()) {
					console.debug("Array Correction Required");
				}
				return Object.keys(obj).map(function(k) { return obj[k as keyof typeof obj]; });
			}
		} catch (e) {
			throw e;
		}
		return obj;
	}

	static getVariableEffects<T extends ConditionalEffect[] | ConditionalEffect["conditions"] | ConditionalEffect["consequences"]>(data: DeepNoArray<T>): T{
		if (!data) {return [] as any;}
		const element = data[0];
		if (!element) {return [] as any;}
		if ("consequences" in element || "effects" in element) {
			return this.getEffects(data as ConditionalEffect[], null, null) as any;
		}
		const etype = element.type;
		if (PRECONDITIONLIST.includes(etype as any)) {
			return this.getConditionals(data as ConditionalEffect["conditions"], null, null) as any;
		}
		if (CONSQUENCELIST.includes(etype as any)) {
			return this.getConsequences(data as ConditionalEffect["consequences"], null, null) as any;
		}
		return data as any;
	}

	static printEffects(effects: ConditionalEffect[]) : string[] {
		return effects.map( x=> this.printEffect(x));
	}

	static printEffect(effect: ConditionalEffect): string {
		return `${this.printConditions(effect.conditions)} ---- ${this.printConsequences(effect.consequences)}`;

	}
	static printConditions(cond: Precondition[]) : string {
		return this.getConditionals(cond, null, null)
			.map( x=> this.printConditional(x))
			.join (", ");
	}

	static printConditional(cond: Precondition) : string {
		switch (cond.type) {
			case "boolean":
				return this.#printBooleanCond(cond);
			case "numeric":
				return this.printNumericCond(cond);
			case "always":
				return "always";
			case "miss-all-targets":
				return "Miss All Targets";
			case "save-versus": { const saveType = this.translate(cond.status!, STATUS_EFFECT_TRANSLATION_TABLE);
				return `on save versus ${saveType}`;
			}
			case "on-trigger": {
				const trig = this.translate(cond.trigger!, TRIGGERS);
				return `trigger: ${trig}`;
			}
			case "never":
				return "Never";
			case "disable-on-debug":
				return "Disabled on Debug Mode";
			case "numeric-v2":
				return "Numeric V2 amount (not used)";
				// return NumericV2.prettyPrintCondition(cond);
			case "diagnostic":
				return "Diagnostic breakpoint";
			default:
				cond satisfies never;
				PersonaError.softFail(`Unknown type ${(cond as any)?.type}`);
				return "ERROR";
		}
	}

	static translate<const T extends string>(items: MultiCheck<T> | T, translationTable?: Record<T, string>) : string {
		if (typeof items == "string")  {
			return translationTable ? localize(translationTable[items]) : items;
		}
		return Object.entries(items)
			.flatMap( ([k,v]) => v ? [k] : [])
			.map( (x:T)=> translationTable ? localize(translationTable[x]) : x)
			.join(", ");
	}

static #printBooleanCond (cond: Precondition & {type: "boolean"}) :string {
	const target1 = ("conditionTarget" in cond) ? this.translate(cond.conditionTarget, CONDITION_TARGETS) : "";
	const target2 = ("conditionTarget2" in cond) ? this.translate(cond.conditionTarget2, CONDITION_TARGETS): "" ;
	// const boolComparison = this.translate (cond.boolComparisonTarget, BOOLEAN_COMPARISON_TARGET);
	const not =  !cond.booleanState ? "not" : "";
	switch (cond.boolComparisonTarget) {
		case "engaged":
			return `${target1} is ${not} engaged with anyone`;
		case "engaged-with":
			return `${target1} is ${not} engaged with ${target2}`;
		case "metaverse-enhanced":
			return `metaverse is ${not} enhanced`;
		case "is-shadow":
			return `${target1} is ${not} enemy type`;
		case "is-pc":
			return `${target1} is ${not} PC type`;
		case "has-tag": {
			const tagName = this.getTagNameForHasTag(cond);
			return `used power ${not} has tag: ${tagName}`;
		}
		case "in-combat":
			return `is ${not} in combat`;
		case "is-critical":
			return `${not} critical hit/success`;
		case "is-hit":
			return `${not} hit/success`;
		case "is-dead":
			return `${target1} is ${not} dead`;
		case "target-owner-comparison":
			return `${target1} is ${not} equal to ${target2}`;
		case "damage-type-is": {
			const damageType = this.translate(cond.powerDamageType, DAMAGETYPES);
			return `Power Damage Type is ${not} ${damageType}`;
		}
		case "power-type-is": {
			const powerType = this.translate(cond.powerType, POWERTYPES);
			return `Power Type is ${not} ${powerType}`;
		}
		case "has-status": {
			const status = this.translate(cond.status, STATUS_EFFECT_TRANSLATION_TABLE);
			return `${target1} ${not} has status: ${status}`;
		}
		case "struck-weakness":
			return `attack ${not} targets a weakness`;
		case "is-resistant-to": {
			const damageType = this.translate(cond.powerDamageType, DAMAGETYPES);
			return `${target1} is ${not} resistant to ${damageType}`;
		}  case "is-same-arcana": 
			return `${target1} is ${not} the same arcana as attacker`; 
		case "flag-state":
			return `${target1} flag ${cond.flagId} is ${not} true`;
		case "is-consumable":
			return `used power/item is ${not} a consumable item`;
		case "power-target-type-is": {
			const targetType = this.translate(cond.powerTargetType, TARGETING);
			return `used power targets type is ${not}: ${targetType}`;
		}
		case "weather-is": {
			const weather = this.translate(cond.weatherComparison, WEATHER_TYPES);
			return `weather is ${not}: ${weather}`;
		}
		case "weekday-is": {
			const weekday = this.translate(cond.days, DAYS);
			return `weekday is ${not} : ${weekday}`;
		}
		case "social-target-is": { const link = cond.socialLinkIdOrTarot ? (game.actors.get(cond.socialLinkIdOrTarot as string) as PersonaActor)?.displayedName : "ERROR";
			return `social Target is ${not} ${link}`;
		}
		case "social-target-is-multi": {
			const actors = multiCheckToArray(cond.socialLinkIdOrTarot)
			.map( x=> x ? (game.actors.get(x) as PersonaActor)?.displayedName ?? x : "ERROR");
			return `social Target is ${not} ${actors.join(", ")}`;
		}
		case "shadow-role-is": {
			const shadowRole = this.translate(cond.shadowRole, SHADOW_ROLE);
			return `${target1} role is is ${not} ${shadowRole}`;
		}
		case "is-distracted":
			return `${target1} is ${not} distracted`;
		case "active-scene-is":
			return `Active Scene is ${not} ${cond.sceneId}`;
		case "is-gm":
			return `User is ${not} GM`;
		case "has-item-in-inventory": {
			const item = game.items.get(cond.itemId);
			return `${target1} ${not} has ${item?.name ?? "Unknown Item"} in Inventory`;
		}
		case "creature-type-is": {
			const creatureType = this.translate(cond.creatureType, CREATURE_TYPE);
			return `${target1} is ${not} of creature type: ${creatureType}`;
		}
		case "power-slot-is": {
			const slot = this.translate(cond.slotType, SLOTTYPES);
			return `Power is ${not} of slot type: ${slot}`;
		}
		case "social-availability":
			switch (cond.socialTypeCheck) {
				case "relationship-type-check":
					return `Relationship Type with ${target1} is ${not} ${cond.relationshipType}`;
				case "is-social-disabled":
					return `${target1} is ${not} socially Disabled`;
				case "is-available":
					return `${target1} is ${not} socially available`;
				case "is-dating":
					return `initiator is ${not} dating ${target1}`;
				default:
					cond satisfies never;
					return `ERROR`;
			}
		case "has-creature-tag": {
			const tags = this.translate(cond.creatureTag, CREATURE_TAGS);
			return `${target1} ${not} has Tag: ${tags}`;
		}
		case "cameo-in-scene": {
			return `Scene ${not} has a cameo `;
		}
		case "arcana-is": {
			const arcana = this.translate(cond.tarot, TAROT_DECK);
			return `Arcana is ${not} ${arcana}`;
		}
		case "is-enemy":
			return `${target1} is ${not} enemy of ${target2}`;
		case "logical-or": {
			const c1= this.printConditional(cond.comparison1);
			const c2= this.printConditional(cond.comparison2);
			return `(${c1} OR ${c2})`;
		}
		case "scene-clock-name-is":
			return `Scene Clock is named ${cond.clockName}`;
		case "is-within-ailment-range":
			return `Attack Roll hits and is within ailment range`;
		case "is-within-instant-death-range":
			return `Attack roll hits and is within instant death range`;
		case "using-meta-pod":
			return `${target1} is using Meta Pod`;
		default:
			cond satisfies never;
			return "";
	}
}

	static getTagNameForHasTag(cond: Precondition & {type: "boolean"} & {boolComparisonTarget: "has-tag"}): string {
		switch (cond.tagComparisonType) {
			case undefined:
			case "power":
				return this.translate(cond.powerTag, POWER_TAGS);
			case "actor":
				return this.translate(cond.creatureTag, CREATURE_TAGS);
			case "roll":
				return this.translate (cond.rollTag, ROLL_TAGS_AND_CARD_TAGS);
			case "weapon":
				return this.translate (cond.rollTag, WEAPON_TAGS);
			default:
				cond satisfies never;
				return "ERROR";

		}

	}

	private static printNumericCond(cond: Precondition & {type: "numeric"}) : string {
		const endString = (cond: Precondition & {type: "numeric"} , derivedVar?: string) => {
			if (!("comparator" in cond)) {
				return "ERROR";
			}
			switch (cond.comparator) {
				case "odd":
					return "is Odd";
				case "even":
					return "is Even";
				case "==":
				case "!=":
				case ">=":
				case ">":
				case "<":
				case "<=":
					if ("num" in cond) {
						return `${cond.comparator} ${this.printConsequenceAmount(cond.num)}`;
					} else {
						return `${cond.comparator} ${derivedVar}`;
					}
				case "range":
					return `between ${cond.num} and ${cond.high}`;
				default:
					cond satisfies never;
					return "ERROR";
			}
		};
		switch (cond.comparisonTarget) {
			case "natural-roll":
				return `natural roll ${endString(cond)}`;
			case "activation-roll":
				return `activation Roll ${endString(cond)}`;
			case "escalation":
				return `Escalation Die ${endString(cond)}`;
			case "total-roll":
				return `Roll Total ${endString(cond)}`;
			case "talent-level":
				return `Talent Level ${endString(cond)}`;
			case "social-link-level": {
				const socialTarget  = PersonaDB.allActors()
					.find( x=> x.id == cond.socialLinkIdOrTarot)
					?? PersonaDB.socialLinks()
					.find(x=> x.tarot?.name  == cond.socialLinkIdOrTarot);
				const name = socialTarget ? socialTarget.displayedName : "Unknown";
				return `${name} SL ${endString(cond)}`;
			}
			case "student-skill": {
				const skill = this.translate(cond.studentSkill!, STUDENT_SKILLS);
				return `${skill} ${endString(cond)}`;
			}
			case "character-level":
					return `Character Level ${endString(cond)}`;
			case "has-resources":
				return `Resources ${endString(cond)}`;
			case "resistance-level": {
				const resist = this.translate(cond.resistLevel, RESIST_STRENGTHS);
				const damage = this.translate(cond.element, DAMAGETYPES);
				return `${damage} resistance ${endString(cond, resist)}`;
			}
			case "health-percentage":
				return `Health Percentage ${endString(cond)}`;
			case "clock-comparison":
				return `Clock ${cond.clockId} ${endString(cond)}`;
			case "percentage-of-mp":
				return `Percentage of MP ${endString(cond)}`;
			case "percentage-of-hp":
				return `Percentage of MP ${endString(cond)}`;
			case "energy":
				return `Shadow Energy ${endString(cond)}`;

			case "socialRandom":
				return `Social Card d20 ${endString(cond)}`;
			case "inspirationWith":
				return `Has Inspiration With Link ??? ${endString(cond)}`;
			case "itemCount": {
				const item = game.items.get(cond.itemId);
				return `Has Amount of ${item?.name ?? "UNKNOWN"} ${endString(cond)}`;
			}
			case "opening-roll":
				return `Opening Roll natural value ${endString(cond)}`;
			case "links-dating":
				return `Amount of people being dated ${endString(cond)}`;
			case "social-variable":
				return `Value of Social variable ${cond.variableId} ${endString(cond)}`;
			case "round-count":
				return `Round Count ${endString(cond)}`;
			case "total-SL-levels":
				return `Total SL levels among all PCs ${endString(cond)}`;
			case "combat-result-based": {
				const combatResult = this.printCombatResultString(cond);
				return `${combatResult} ${endString(cond)}`;
			}
			case "num-of-others-with":
				//TODO: put in special condition
				return `Number of ${cond.group} that meet Special Condition ${endString(cond)}`;
			case "progress-tokens-with":
				return `Progress tokens with ${cond.conditionTarget} is ${endString(cond)}`;
			case "variable-value":
				return `Value of ${cond.varType} variable named ${cond.variableId} is ${endString(cond)}`;
			case "scan-level":
				return `Scan level of ${cond.conditionTarget} ${endString(cond)}`;
			default:
				cond satisfies never;
				return "UNKNOWN CONDITION";
		}
	}

	static printCombatResultString(cons : CombatResultComparison): string {
		const non = cons.invertComparison ? "non-" : "";
		switch (cons.resultSubtypeComparison) {
			case "total-hits":
				return `Number of ${non}Misses`;
			case "total-knocks-down":
				return `Number of ${non}Knockdowns`;
			default:
				cons.resultSubtypeComparison satisfies never;
				return "ERROR";
		}
	}

	static printConsequences(cons: Consequence[]) : string {
		return this.getConsequences(cons, null , null)
			.map(x=> this.printConsequence(x))
			.filter(x => x)
			.join (", ");
	}

static printConsequence (cons: NonDeprecatedConsequence) : string {
	switch (cons.type) {
		case "none":
			return "";
		case "modifier-new": {
			const modifiers = this.translate(cons.modifiedFields, MODIFIERS_TABLE);
			return `${modifiers}: ${this.printConsequenceAmount(cons.amount)}`;
		}
		case "damage-new":
			return this.printDamageConsequence(cons);
		case "addStatus": {
			const status = this.translate(cons.statusName, STATUS_EFFECT_TRANSLATION_TABLE);
			const dur = cons.statusDuration;
			if (!dur) {return `ERROR`;}
			const duration = this.translate(dur, STATUS_EFFECT_DURATION_TYPES);
			return `Add Status ${status} (${duration})`;
		} case "removeStatus": {
			const status = this.translate(cons.statusName, STATUS_EFFECT_TRANSLATION_TABLE);
			return `Remove Status ${status}`;
		}
		case "extraAttack":
			return `extra attack`;
		case "expend-slot":
			return `expend Slot`;
		case "extraTurn":
			return `Take an extra turn`;
		case "expend-item":
			return `expend item`;
		case "add-power-to-list": {
			const grantedPower = PersonaDB.getPower(cons.id);
			return `Add power to list ${grantedPower?.displayedName?.toString() ?? "ERROR"}`;
		}
		case "add-talent-to-list": {
			const grantedTalent = PersonaDB.getItemById(cons.id) as Talent;
			return `Add Talent to list ${grantedTalent?.displayedName?.toString() ?? "ERROR"}`;

			}
			case "other-effect":
				return this.#printOtherEffect(cons);
			case "set-flag":
				return `${cons.flagState ? "set" : "clear"} Flag ${cons.flagId}`;
			case "inspiration-cost":
				return `Inpsiration Cost : ${cons.amount}`;
			case "display-msg":
				return `Display Msg: ${cons.msg?.trim()}`;
			case "scan":
				return `Scan Target Level ${cons.amount}`;
			case "social-card-action":
				return this.#printSocialCardAction(cons);
			case "alter-energy":
				return `Energy ${cons.amount}`;
			case "dungeon-action":
				return this.#printDungeonAction(cons);
			case "raise-resistance": {
				const resistType = this.translate(cons.resistType, DAMAGETYPES);
				const resistLevel = this.translate(cons.resistanceLevel, RESIST_STRENGTHS);;
				return `Raise ${resistType} Resistance ${resistLevel}` ; }
			case "lower-resistance" : {
				const resistType =this.translate(cons.resistType, DAMAGETYPES);
				const resistLevel = this.translate(cons.resistanceLevel, RESIST_STRENGTHS);;
				return `Lower ${resistType} Resistance ${resistLevel}` ;
			} case "use-power": {
				const power = PersonaDB.getPower(cons.powerId);
				return `Use Power ${power?.name}`;
			}
			case "alter-mp":
				return this.#printMPAlter(cons);
			case "modifier": {
				const modified = this.translate(cons.modifiedField, MODIFIERS_TABLE);
				const amount = this.printConsequenceAmount(cons.amount);
				return `${modified} ${amount}`;
			}
			case "teach-power": {
				const power = PersonaDB.getPower(cons.id);
				return `Teach Power ${power?.displayedName?.toString() ?? "ERROR"}`;
			}
			case "raise-status-resistance":
				return `${this.translate(cons.resistanceLevel, RESIST_STRENGTHS)} status ${this.translate(cons.statusName, STATUS_EFFECT_TRANSLATION_TABLE)}`;
			case "add-creature-tag": {
				const tag = this.translate(cons.creatureTag, CREATURE_TAGS);
				return `Add ${tag} tag`;
			}
			case "combat-effect":
				return this.#printCombatEffect(cons);
			case "alter-fatigue-lvl":
				return `Alter Fatigue Level ${cons.amount}`;
			case "alter-variable":
				if (cons.operator != "set-range") {
				return `Alter ${cons.varType} Variable ${cons.variableId} : ${cons.operator} ${this.printConsequenceAmount(cons.value)}`; } else {
				return `Alter ${cons.varType} Variable ${cons.variableId} : ${cons.operator} ${cons.min} - ${cons.max}`; }
			case "perma-buff":
				return `Add Permabuff ${cons.buffType} :${cons.value}`;
			case "play-sound":
				return `Play Sound: ${cons.soundSrc} (${cons.volume})`;
			case "gain-levels": {
				const gainTarget =this.translate(cons.gainTarget, LEVEL_GAIN_TARGETS);
				return `Gain ${cons.value} Levels for ${gainTarget}`;
			}
			default:
				cons satisfies never;
				return "ERROR";
		}

	}

private static printConsequenceAmount(consAmt: ConsequenceAmount) : string {
	if (typeof consAmt =="number") {return String(consAmt);}
	return `Complex Consequence Amount`;

}

	static #printCombatEffect( cons: Consequence & {type: "combat-effect"}) : string {
		switch (cons.combatEffect) {
			case "auto-end-turn":
				return `Automatically End Turn`;
			default:
				cons.combatEffect satisfies never;
				return "ERROR";
		}

	}

	static #printOtherEffect(cons: Consequence & {type:"other-effect"}) : string {
		switch (cons.otherEffect) {
			case "search-twice":
				return "search Twice";
			case "ignore-surprise":
				return "Ignore Surprise";
			default:
				cons.otherEffect satisfies never;
				return "ERROR";
		}
	}

	static #printSocialCardAction(cons: Consequence & {type:"social-card-action"}) : string {
		let signedAmount;
		if ("amount" in cons){
			signedAmount = this.signedAmount(cons.amount);
		}
		switch (cons.cardAction) {
			case "stop-execution":
				return `stop card execution`;
			case "exec-event":
				return `Execute Event Chain ${cons.eventLabel}`;
			case "inc-events":
				return `Remaining events ${signedAmount}`;
			case "gain-money":
				return `Resources ${signedAmount}`;
			case "modify-progress-tokens":
				return `Progress Tokens ${signedAmount}`;
			case "alter-student-skill": {
				const skill = this.translate(cons.studentSkill, STUDENT_SKILLS);
				return `${skill} ${signedAmount}`;
			}
			case "modify-progress-tokens-cameo":
				return `Cameo Progress Tokens ${signedAmount}`;
			case "replace-card-events":
				return `Replace Card Events with events of card ${cons.cardId}`;
			case "add-card-events-to-list":
				return `Add Card Events card ${cons.cardId}`;
			case "set-temporary-variable":
				if (cons.operator != "set-range") {
				return `${cons.operator} ${cons.value} to social variable ${cons.variableId}`;
				} else {
				return `${cons.operator} ${cons.min} - ${cons.max} to social variable ${cons.variableId}`;
				}
			case "card-response":
				return `Chat Response`;
			case "append-card-tag":
				return `Add card tag: ${cons.cardTag}`;
			case "remove-cameo":
				return `Remove Cameo(s) from scene`;
			default:
				cons satisfies never;
				return "ERROR";
		}
	}

	static #printDungeonAction(cons: Consequence & {type :"dungeon-action"}) : string {
		const signedAmount = "amount" in cons ? this.signedAmount(cons.amount) : 0;
		switch (cons.dungeonAction) {
			case "roll-tension-pool":
				return "Roll Tension pool";
			case "modify-tension-pool":
				return "Modify Tension Pool";
			case "modify-clock": {
				const clock = cons.clockId;
				return `${clock} ticks ${signedAmount}`;
			}
			case "close-all-doors":
				return `Close All Doors`;
			case "change-scene-weather":
				return `Change Scene Weather to ${cons.sceneWeatherType}`;
			case "set-clock": {
				const clock = cons.clockId;
				return `${clock} set to ${signedAmount}`;
			}
			case "rename-scene-clock": {
				return `Change Scene Clock details`;
			}
			default:
				cons satisfies never;
				return "ERROR";
		}
	}

	static #printMPAlter(cons: Consequence & {type: "alter-mp"}): string {
		const signedAmount = this.signedAmount(cons.amount);
		switch (cons.subtype) {
			case "direct":
				return `MP ${signedAmount}`;
			case "percent-of-total":
				return `MP Cost ${signedAmount} % of total`;
			default:
				cons.subtype satisfies never;
				return "ERROR";
		}
	}

	static signedAmount(amt?: number): string {
		if (typeof amt != "number" ) {return "";}
		return amt > 0 ?`+${amt}` : `${amt}`;
	}

	static printDamageConsequence(cons: Consequence & {type: "damage-new"}) : string {
		const damageType = "damageType" in cons ? this.translate(cons.damageSubtype, DAMAGE_SUBTYPES): "";
		switch (cons.damageSubtype) {
			case "constant":
				return `${cons.amount} ${damageType} damage`;
			case "high":
				return `High Damage`;
			case "odd-even":
				return `Odd/Even Damage`;
			case "low":
				return `Low Damage`;
			case "allout":
				return `All Out Attack Damage`;
			case "multiplier":
				return `Damage Multiplier ${cons.amount}`;
			case "percentage":
				return `${cons.amount}% of target HP`;
			case "mult-stack":
				return `Damage Multiplier (stacking) ${cons.amount}`;
			default:
				cons satisfies never;
				return "ERROR";
		}
	}
}

export class EMAccessor<T> {
	private _path : string;
	private _owner: FoundryDocument;
	_master: EMAccessor<unknown> | null;

	constructor(owner: FoundryDocument, writePath: string, master: EMAccessor<unknown> | null = null) {
		this._owner = owner;
		this._path = writePath;
		if (this._path.endsWith(".")) {
			throw new PersonaError("What fool put a period here?");
		}
		this._master = master;
	}

	static create<const O extends FoundryDocument, const P extends string, T extends NoArray<GetProperty<O, P>>> ( owner: O, path: P, master?: EMAccessor<unknown>): EMAccessor<T> {
		return new EMAccessor(owner, path, master) as unknown as EMAccessor<T>;

	}
	get data(): T extends Record<number, unknown> ? T[number][] : never {
		const data = foundry.utils.getProperty(this._owner, this._path) as T;
		return ConditionalEffectManager.getVariableEffects(data as any);
	}

	//before datamodel but this doesn't work with embedded
	async update(newData: DeepNoArray<T>) {
		if (!this._master) {
			const updateObj : Record<string, any>= {};
			updateObj[this._path] = newData;
			await this._owner.update(updateObj);
			return this;
		}
		await this._master.#patchUpdate(newData, this._path);
		return this;
	}

		static expandObject<T>(data: T) :T  {
		return Helpers.expandObject(data);
	}

	async #patchUpdate(newData: unknown, updatePath: string) {
		if (this._master) {
			await this._master.#patchUpdate(newData, updatePath);
			return;
		}
		const data = EMAccessor.expandObject(this.data);
		let datapart : any = data;
		const pathdiff = updatePath.slice(this._path.length).split(".");
		while (pathdiff.length > 1) {
			const path = pathdiff.shift();
			if (!path) {continue;}
			if (datapart[path] == undefined) {
				datapart[path] = {};
				console.log(`Had to create path for ${updatePath}`);
			}
			datapart = datapart[path];
		}
		const lastPath = pathdiff.shift()!;
		try {
		datapart[lastPath] = newData;
		await this.update(data as any);
		} catch (e) {
			Debug(updatePath);
			Debug(newData);
			PersonaError.softFail(`Problem patching :${updatePath}`);
			console.error(e);
			throw e;
		}
	}

	delve<const P extends string, Prop extends GetProperty<T,P>>(path: P) : Prop extends Record<string | number | symbol, unknown> ? EMAccessor<Prop> : never;
	delve<I extends Record<number, unknown>> (this: EMAccessor<I>, index: number) : T extends Record<number, unknown> ? EMAccessor<T[number]> : never;
	delve(search: number | string) : EMAccessor<any> {
		if (typeof search == "number") {
			const newPath = `${this._path}.${search}`;
			return new EMAccessor(this._owner, newPath, this) as any;
		} else {
			const newPath = `${this._path}.${search}`;
			return new EMAccessor(this._owner, newPath, this) as any;
		}
	}

	conditions(this: EMAccessor<DeepNoArray<ConditionalEffect[]>>, effectIndex: number): EMAccessor<DeepNoArray<ConditionalEffect["conditions"]>> {
		const x = this.data[effectIndex];
		if (x && x.conditions) {
			const newPath = `${this._path}.${effectIndex}.conditions`;
			return new EMAccessor(this._owner, newPath, this);
		} else {
			return this as any;
		}
	}

	consequences(this: EMAccessor<DeepNoArray<ConditionalEffect[]>>, effectIndex: number) : EMAccessor<DeepNoArray<ConditionalEffect["consequences"]>> {
		const x = this.data[effectIndex];
		if (x && x.conditions) {
			const newPath = `${this._path}.${effectIndex}.consequences`;
			return new EMAccessor(this._owner, newPath, this);
		} else {
			return this as any;
		}
	}

	async addConditionalEffect<I extends DeepNoArray<ConditionalEffect[]>>(this: EMAccessor<I>, effect ?: ConditionalEffect) {
		if (!effect) {
			effect= {
				isDefensive: false,
				conditions: [ {
					type: "always"
				}],
				consequences: []
			};
		}
		const data = this.data;
		data.push(effect);
		await this.update(data as any);
	}

	async deleteConditionalEffect(this: EMAccessor<ConditionalEffect[]>, effectIndex: number) {
		const data = this.data;
		data.splice(effectIndex, 1);
		await this.update(data);
	}

	async addNewConsequence<I extends DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>, cons: Consequence | undefined) : Promise<void>;
	async addNewConsequence<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, cons: Consequence | undefined, effectIndex: number): Promise<void>;
	async addNewConsequence<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>, cons: Consequence | undefined, effectIndex?: number) : Promise<void> {
		if (this.#effectIndexChecker(effectIndex)) {
			return await (this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).consequences(effectIndex).addNewConsequence(cons);
		}
		const item : (ConditionalEffect["consequences"][number]) = cons ? cons : {
			type: "none",
		};
		const that = this as EMAccessor<DeepNoArray<ConditionalEffect["consequences"]>>;
		const newData = that.data;
		newData.push(item);
		await that.update(newData);
	}

	async addNewCondition<I extends DeepNoArray<ConditionalEffect["conditions"]>>( this: EMAccessor<I>, cond ?: Precondition ) : Promise<void>;
	async addNewCondition<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, cond: Precondition | undefined, effectIndex: number): Promise<void>;
	async addNewCondition<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, cond: Precondition | undefined, effectIndex: number): Promise<void>;
	async addNewCondition<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["conditions"]>> ( this: EMAccessor<I>, cond:Precondition | undefined, effectIndex?: number) : Promise<void> {
		if (this.#effectIndexChecker(effectIndex)) {
			return await (this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).conditions(effectIndex).addNewCondition(cond);
		}
		const item : ConditionalEffect["conditions"][number] = cond ? cond : {
			type: "always",
		};
		const that = this as EMAccessor<DeepNoArray<ConditionalEffect["conditions"]>>;
		const newData = that.data;
		newData.push(item);
		await that.update(newData);
	}

	async deleteCondition<I extends DeepNoArray<ConditionalEffect["conditions"]>>( this: EMAccessor<I>, condIndex: number) : Promise<void>;
	async deleteCondition<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, condIndex: number, effectIndex: number): Promise<void>;
	async deleteCondition<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["conditions"]>>( this: EMAccessor<I>, condIndex: number, effectIndex?: number) : Promise<void> {
		if (this.#effectIndexChecker(effectIndex)) {
			return (this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).conditions(effectIndex).deleteCondition(condIndex);
		}
		const that = this as EMAccessor<DeepNoArray<ConditionalEffect["conditions"]>>;
		const d = that.data;
		d.splice(condIndex, 1);
		await that.update(d);
	}

	async deleteConsequence<I extends DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>, consIndex: number) : Promise<void>;
	async deleteConsequence<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, consIndex: number, effectIndex: number): Promise<void>;
	async deleteConsequence<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>, consIndex: number, effectIndex?: number) : Promise<void> {
		if (this.#effectIndexChecker(effectIndex)) {
			await (this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).consequences(effectIndex).deleteConsequence(consIndex);
		}
		const that = this as EMAccessor<DeepNoArray<ConditionalEffect["consequences"]>>;
		const d = that.data;
		d.splice(consIndex, 1);
		await that.update(d);
	}

	#effectIndexChecker(effectIndex: number | undefined): effectIndex is number {
		if (effectIndex != undefined) {
			const item = this.data[effectIndex] as ConditionalEffect;
			if (item && typeof item == "object" && "conditions" in item) {
				return true;
			}
		}
		return false;
	}

}


// **************************************************
// **********   error checking code  *********** ****
// **************************************************

type Intersection<T, U> = T extends U ? T : never;
type x = Intersection<PreconditionType, ConsequenceType>;
type ExpectNever<X extends never> = X;

//if this ever errors, it means there's an intersectio of Precondition and Conseuqence type which could lead to errors.
let x: ExpectNever<x>;

export type CEAction = {
	type: "create-effect",
	effect?: ConditionalEffect
} | {
	type: "delete-effect",
	effectIndex:number,
} | {
	type: "create-conditional",
	effectIndex?:number,
	conditional?: Precondition,
} | {
	type: "create-consequence",
	effectIndex?:number,
	consequence?: Consequence,
} |  {
	type: "delete-conditional",
	effectIndex?:number,
	condIndex: number
} |  {
	type: "delete-consequence",
	effectIndex?:number,
	consIndex: number
};



// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CETypes = [
	"on-use", // does something when power is used
	"passive", // grants bonuses
	"unknown", // can't classify
	"triggered", // triggers
	"defensive", // invoked as a defensive power
	// "social" //social link granted
] as const;

//@ts-expect-error added to window objects
window.CEManager = ConditionalEffectManager;

type ConditonalEffectHolderItem = ModifierContainer & (PersonaItem | PersonaAE) & Partial<{isDefensive : () => boolean, defaultConditionalEffectType: () => TypedConditionalEffect["conditionalType"]}> ;


declare global{

	interface ConditionalEffect {
		isDefensive: boolean;
		conditions: Precondition[];
		consequences: Consequence[];
	}

	interface NonDeprecatedConditionalEffect {
		conditions: SourcedPrecondition<Precondition>[];
		consequences: SourcedConsequence<NonDeprecatedConsequence>[];
		isDefensive: boolean;
	}

	// type SourcedConditionalEffects = SourcedConditionalEffect[];

	type SourcedConditionalEffect<T extends TypedConditionalEffect= TypedConditionalEffect> = Sourced<T>;

	interface TypedConditionalEffect extends NonDeprecatedConditionalEffect {
		conditionalType: typeof CETypes[number];
	}

	export type SourcedConsequence<T extends Consequence= Consequence> = Sourced<T>;

	type SourcedPrecondition<T extends Precondition = Precondition> = 
		Sourced<T>;

	type Sourced<T extends object>= T & {
		source: U<ModifierContainer>;
		owner: U<UniversalActorAccessor<PersonaActor>>;
	}

}


