import { STATUS_EFFECT_DURATION_TYPES } from "../config/status-effects.js";
import { Helpers } from "./utility/helpers.js";
import { multiCheckToArray } from "./preconditions.js";
import { TAROT_DECK } from "../config/tarot.js";
import { localize } from "./persona.js";
import { CREATURE_TAGS } from "../config/creature-tags.js";
import { MODIFIER_VARIABLES } from "../config/effect-types.js";
import { MODIFIERS_TABLE } from "../config/item-modifiers.js";
import { Consequence } from "../config/consequence-types.js";
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
import { Precondition } from "../config/precondition-types.js";
import { HTMLTools } from "./utility/HTMLTools.js";
import { PersonaError } from "./persona-error.js";
import { PreconditionType } from "../config/precondition-types.js";
import { ConsequenceType } from "../config/effect-types.js";
import { CONSQUENCELIST } from "../config/effect-types.js";
import { PRECONDITIONLIST } from "../config/precondition-types.js";
import { ConditionalEffect } from "./datamodel/power-dm.js";
import { PersonaDB } from "./persona-db.js";

export class ConditionalEffectManager {

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
				// @ts-ignore
				return await acc.addNewCondition(action.conditional, action.effectIndex);
			case "create-consequence":
				//@ts-ignore
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).addNewConsequence(action.consequence, action.effectIndex);
			case "delete-conditional":
				//@ts-ignore
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).deleteCondition(action.condIndex, action.effectIndex);
			case "delete-consequence":
				//@ts-ignore
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
		}
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

	static #getEffectIndex(ev: JQuery.ClickEvent) {
		const effectIndex = Number(HTMLTools.getClosestDataSafe(ev, "effectIndex", -1));
		return effectIndex >= 0 ? effectIndex: undefined;
	}

	static async handler_addPowerEffect<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		let effect : ConditionalEffect  | undefined = undefined;
		if ("defaultConditionalEffect" in item.sheet && typeof item.sheet.defaultConditionalEffect == "function") {
			effect = item.sheet.defaultConditionalEffect(ev) as ConditionalEffect;
		}

		const action : CEAction= {
			type: "create-effect",
			effect
		}
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_deletePowerEffect<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const effectIndex = this.#getEffectIndex(ev);
		if (effectIndex == undefined) throw new PersonaError("Can't get effect Index");
		const action : CEAction= {
			type: "delete-effect",
			effectIndex
		}
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_addPrecondition<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const effectIndex = this.#getEffectIndex(ev);
		const action : CEAction= {
			type: "create-conditional",
			effectIndex
		}
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);
	}

	static async handler_addConsequence<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item: D) {
		const effectIndex = this.#getEffectIndex(ev);
		const action : CEAction= {
			type: "create-consequence",
			effectIndex
		}
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
		}
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
		}
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
		}
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
		}
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
		}
		const {topPath, dataPath} = this.#getPaths(ev);
		await this.alterConditionalEffect(topPath, dataPath, action, item);


	}

	static async handler_copyEffect<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item:D) {
		const effectIndex = this.#getEffectIndex(ev);
		if (effectIndex == undefined ) {
			throw new PersonaError("Can't get effect index");
		}
		const {topPath, dataPath} = this.#getPaths(ev);
		const master  = topPath as string != dataPath as string ? new EMAccessor<D>(item, topPath) : undefined;
		const acc = new EMAccessor<D>(item, dataPath, master);
		this.clipboard.effect = acc.data[effectIndex];
	}

	static async handler_copyCondition<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item:D) {
		const condIndex = Number(HTMLTools.getClosestData(ev,
			"preconditionIndex"));
		// const effectIndex = this.#getEffectIndex(ev);
		const {topPath, dataPath} = this.#getPaths(ev);
		const master  = topPath as string != dataPath as string ? new EMAccessor<D>(item, topPath) : undefined;
		const acc = new EMAccessor<D>(item, dataPath, master);
		this.clipboard.condition = acc.data[condIndex];
	}

	static async handler_copyConsequence<D extends FoundryDocument<any>>(ev: JQuery.ClickEvent, item:D) {
		const consIndex = Number(HTMLTools.getClosestData(ev, "consequenceIndex"));
		// const effectIndex = this.#getEffectIndex(ev);
		const {topPath, dataPath} = this.#getPaths(ev);

		const master  = topPath as string != dataPath as string ? new EMAccessor<D>(item, topPath) : undefined;
		const acc = new EMAccessor<D>(item, dataPath, master);
		this.clipboard.consequence = acc.data[consIndex];
	}

	static applyHandlers<D extends FoundryDocument<any>>(html: JQuery, doc: D) {
		html.find(".add-effect").on("click", async (ev) => await this.handler_addPowerEffect(ev, doc));
		html.find(".del-effect").on("click", async (ev) => await this.handler_deletePowerEffect(ev, doc));
		html.find(".add-condition").on("click", async (ev) => this.handler_addPrecondition(ev, doc));
		html.find(".add-consequence").on("click", async (ev)=> this.handler_addConsequence(ev,doc));
		html.find(".del-consequence").on("click", async (ev) => this.handler_deleteConsequence(ev, doc));
		html.find(".del-condition").on("click", async(ev) => this.handler_deletePrecondition(ev,doc));
		html.find(".paste-effect").on("click", async(ev) => this.handler_pasteEffect(ev, doc))
		html.find(".paste-consequence").on("click", async(ev) => this.handler_pasteConsequence(ev, doc))
		html.find(".paste-condition").on("click", async(ev) => this.handler_pasteCondition(ev, doc))
		html.find(".copy-effect").on("click", async(ev) => this.handler_copyEffect(ev, doc))
		html.find(".copy-consequence").on("click", async(ev) => this.handler_copyConsequence(ev, doc))
		html.find(".copy-condition").on("click", async(ev) => this.handler_copyCondition(ev, doc))


	}

	static getEffects<T extends Actor<any>, I extends Item<any>>(CEObject: DeepNoArray<ConditionalEffect[]> | ConditionalEffect[], sourceItem: I | null, sourceActor: T | null) : ConditionalEffect[] {
		const Arr = this.ArrayCorrector;
		const conditionalEffects = Arr(CEObject);
		return conditionalEffects.map( ce=> ({
			conditions: this.getConditionals(ce.conditions, sourceItem, sourceActor),
			consequences: this.getConsequences(ce.consequences, sourceItem, sourceActor),
		})
		);
	}

	static getConditionals<T extends Actor<any>, I extends Item<any>>(condObject: DeepNoArray<ConditionalEffect["conditions"]>, sourceItem: I | null, sourceActor: T | null): ConditionalEffect["conditions"] {
		const Arr = this.ArrayCorrector;
		const conditionalEffects = Arr(condObject);
		return conditionalEffects.map( eff=> ({
			...eff,
			actorOwner: sourceActor? PersonaDB.getUniversalActorAccessor(sourceActor) : eff.actorOwner,
			sourceItem: sourceItem ? PersonaDB.getUniversalItemAccessor(sourceItem): (eff as any).sourceItem,
		}));
	}

	static getConsequences<T extends Actor<any>, I extends Item<any>>(consObject: DeepNoArray<ConditionalEffect["consequences"]>, sourceItem: I | null, sourceActor: T | null): ConditionalEffect["consequences"] {
		const Arr = this.ArrayCorrector;
		const consequences = Arr(consObject);
		return  consequences.map( eff=> ({
			...eff,
			actorOwner: sourceActor? PersonaDB.getUniversalActorAccessor(sourceActor) : eff.actorOwner,
			sourceItem: sourceItem ? PersonaDB.getUniversalItemAccessor(sourceItem): eff.sourceItem,
		}));

	}

	static ArrayCorrector<T extends any>(obj: (T[] | Record<string | number, T>)): T[] {
		try {
			if (obj == null) return[];
			if (!Array.isArray(obj)) {
				console.debug("Array Correction Required");
				return Object.keys(obj).map(function(k) { return obj[k] });
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
				return this.#printNumericCond(cond);
			case "always":
				return "always";
			case "miss-all-targets":
				return "Miss All Targets"
			case "save-versus":
				const saveType = this.translate(cond.status!, STATUS_EFFECT_TRANSLATION_TABLE);
				return `on save versus ${saveType}`;
			case "on-trigger":
				const trig = this.translate(cond.trigger!, TRIGGERS);
				return `trigger: ${trig}`
			case "never":
				return "Never";
			case "disable-on-debug":
				return "Disabled on Debug Mode"
			default:
				cond satisfies never;
				PersonaError.softFail(`Unknown type ${(cond as any)?.type}`);
				return "ERROR";
		}
	}

	static translate<const T extends string>(items: MultiCheck<T> | T, translationTable?: Record<string, string>) : string {
		if (typeof items == "string")  {
			return translationTable ? localize(translationTable[items]) : items;
		}
		return Object.entries(items)
			.flatMap( ([k,v]) => v ? [k] : [])
			.map( x=> translationTable ? localize(translationTable[x]) : x)
			.join(", ");
	}

	static #printBooleanCond (cond: Precondition & {type: "boolean"}) :string {
		const target1 = ("conditionTarget" in cond) ? this.translate(cond.conditionTarget, CONDITION_TARGETS) : "";
		const target2 = ("conditionTarget2" in cond) ? this.translate(cond.conditionTarget2, CONDITION_TARGETS): "" ;
		// const boolComparison = this.translate (cond.boolComparisonTarget, BOOLEAN_COMPARISON_TARGET);
		const not =  !cond.booleanState ? "not" : "";
		switch (cond.boolComparisonTarget) {
			case "engaged":
				return `${target1} is ${not} engaged with anyone`
			case "engaged-with":
				return `${target1} is ${not} engaged with ${target2}`
			case "metaverse-enhanced":
				return `metaverse is ${not} enhanced`;
			case "is-shadow":
				return `${target1} is ${not} enemy type`;
			case "is-pc":
				return `${target1} is ${not} PC type`;
			case "has-tag":
				const powerTag = this.translate(cond.powerTag, POWER_TAGS);
				return `used power ${not} has tag: ${powerTag}`;
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
			case "damage-type-is":
				const damageType = this.translate(cond.powerDamageType, DAMAGETYPES);
				return `Power Damage Type is ${not} ${damageType}`;
			case "power-type-is":
				const powerType = this.translate(cond.powerType, POWERTYPES);
				return `Power Type is ${not} ${powerType}`;
			case "has-status":
				const status = this.translate(cond.status, STATUS_EFFECT_TRANSLATION_TABLE);
				return `${target1} ${not} has status: ${status}`;
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
			case "power-target-type-is":
				const targetType = this.translate(cond.powerTargetType, TARGETING);
				return `used power targets type is ${not}: ${targetType}`; 
			case "weather-is":
				const weather = this.translate(cond.weatherComparison, WEATHER_TYPES);
				return `weather is ${not}: ${weather}`;
			case "weekday-is":
				const weekday = this.translate(cond.days, DAYS);
				return `weekday is ${not} : ${weekday}`;
			case "social-target-is":
				const link = cond.socialLinkIdOrTarot ? (game.actors.get(cond.socialLinkIdOrTarot as string) as PersonaActor)?.displayedName : "ERROR";
				return `social Target is ${not} ${link}`;
			case "social-target-is-multi":
				const actors = multiCheckToArray(cond.socialLinkIdOrTarot)
					.map( x=> x ? (game.actors.get(x as string) as PersonaActor)?.displayedName ?? x : "ERROR");
				return `social Target is ${not} ${actors.join(", ")}`;
			case "shadow-role-is":
				const shadowRole = this.translate(cond.shadowRole, SHADOW_ROLE);
				return `${target1} role is is ${not} ${shadowRole}`;
			case "is-distracted":
				return `${target1} is ${not} distracted`;
			case "active-scene-is":
				return `Active Scene is ${not} ${cond.sceneId}`;
			case "is-gm":
				return `User is ${not} GM`;
			case "has-item-in-inventory":
				const item = game.items.get(cond.itemId);
				return `${target1} ${not} has ${item?.name ?? "Unknown Item"} in Inventory`;
			case "creature-type-is":
				const creatureType = this.translate(cond.creatureType, CREATURE_TYPE);
				return `${target1} is ${not} of creature type: ${creatureType}`;
			case "power-slot-is":
				const slot = this.translate(cond.slotType, SLOTTYPES);
				return `Power is ${not} of slot type: ${slot}`;
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
			default:
				cond satisfies never
				return "";
		}
	}

	static  #printNumericCond(cond: Precondition & {type: "numeric"}) : string {
		const endString = function(cond: Precondition & {type: "numeric"}, derivedVar?: string) {
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
						return `${cond.comparator} ${cond.num}`;
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
			case "social-link-level":
				const socialTarget  = PersonaDB.allActors()
					.find( x=> x.id == cond.socialLinkIdOrTarot)
					?? PersonaDB.socialLinks()
					.find(x=> x.tarot?.name  == cond.socialLinkIdOrTarot);
				const name = socialTarget ? socialTarget.displayedName : "Unknown";
				return `${name} SL ${endString(cond)}`;
			case "student-skill":
					const skill = this.translate(cond.studentSkill!, STUDENT_SKILLS);
				return `${skill} ${endString(cond)}`;
			case "character-level":
					return `Character Level ${endString(cond)}`;
			case "has-resources":
				return `Resources ${endString(cond)}`;
			case "resistance-level":
				const resist = this.translate(cond.resistLevel, RESIST_STRENGTHS);
				const damage = this.translate(cond.element, DAMAGETYPES);
				return `${damage} resistance ${endString(cond, resist)}`;
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
			case "itemCount":
				const item = game.items.get(cond.itemId);
				return `Has Amount of ${item?.name ?? "UNKNOWN"} ${endString(cond)}`;
			case "opening-roll":
				return `Opening Roll natural value ${endString(cond)}`;
			case "links-dating":
				return `Amount of people being dated ${endString(cond)}`;
			case "social-variable":
				return `Value of Social variable ${cond.variableId} ${endString(cond)}`;
			case "round-count":
				return `Round Count ${endString(cond)}`;
			default:
				cond satisfies never;
				return "UNKNOWN CONDITION"
		}
	}

	static printConsequences(cons: Consequence[]) : string {
		return this.getConsequences(cons, null , null)
			.map(x=> this.printConsequence(x))
			.filter(x => x)
			.join (", ");
	}

	static printConsequence (cons: Consequence) : string {
		switch (cons.type) {
			case "none":
				return "";
			case "absorb":
				return "Absorb";
			case "modifier-new":
				const modifiers = this.translate(cons.modifiedFields, MODIFIERS_TABLE);
				let amt: string;
				switch (cons.modifierType) {

					case "constant":
						amt = String(cons.amount);
						break;
					case"system-variable":
						amt = cons.makeNegative? "-" : "" + this.translate(cons.varName, MODIFIER_VARIABLES);
						break;
					default:
						cons satisfies never;
						amt = "error";
				}
				return `${modifiers}: ${amt}`;
			case "damage-new":
				return this.printDamageConsequence(cons);
			case "addStatus": {
				const status = this.translate(cons.statusName!, STATUS_EFFECT_TRANSLATION_TABLE);
				let dur = cons.statusDuration;
				if (!dur) return `ERROR`;
				const duration = this.translate(dur, STATUS_EFFECT_DURATION_TYPES);
				return `Add Status ${status} (${duration})`;
			} case "removeStatus": {
				const status = this.translate(cons.statusName!, STATUS_EFFECT_TRANSLATION_TABLE);
				return `Remove Status ${status}`;
			} case "escalationManipulation":
				return `Modify Escalation Die ${cons.amount}`;
			case "extraAttack":
				return `extra attack`;
			case "expend-slot":
				return `expend Slot`;
			case "half-hp-cost":
				return `halve hp costs`;
			case "revive":
				return `heal percentage of health ${cons.amount}`;
			case "extraTurn":
				return `Take an extra turn`;
			case "expend-item":
				return `expend item`;
			case "add-power-to-list":
				return `Add power to list ${cons.id}`
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
				const resistType =this.translate(cons.resistType, DAMAGETYPES);
				const resistLevel = this.translate(cons.resistanceLevel, RESIST_STRENGTHS);;
				return `Raise ${resistType} Resistance ${resistLevel}` ; }
			case "lower-resistance" : {
				const resistType =this.translate(cons.resistType, DAMAGETYPES);
				const resistLevel = this.translate(cons.resistanceLevel!, RESIST_STRENGTHS);;
				return `Lower ${resistType} Resistance ${resistLevel}` ;
			} case "use-power":
				const power = PersonaDB.getPower(cons.powerId);
				return `Use Power ${power?.name}`;
			case "alter-mp":
				return this.#printMPAlter(cons);
			case "save-slot":
				return "";
			case "recover-slot":
				return "";
			case "modifier": {
				const modified = this.translate(cons.modifiedField!, MODIFIERS_TABLE);
				return `${modified} ${cons.amount}`;
			} case "add-escalation": {
				const modified = this.translate(cons.modifiedField!, MODIFIERS_TABLE);
				return `add escalation to ${modified}`;
			}
			case "dmg-low":
				return "Low Damage";
			case "dmg-high":
				return "High Damage"
			case "dmg-allout-low":
			case "dmg-allout-high":
				return "";
			case "dmg-mult":
				return `damage multiplier: ${cons.amount}`;
			case "hp-loss":
				return `HP loss: ${cons.amount}`;
			case "teach-power": {
				const power = PersonaDB.getPower(cons.id);
				return `Teach Power ${power?.displayedName ?? "ERROR"}`;
			}
			case "raise-status-resistance":
				return `${this.translate(cons.resistanceLevel, RESIST_STRENGTHS)} status ${this.translate(cons.statusName, STATUS_EFFECT_TRANSLATION_TABLE)}`;
			default:
				cons satisfies never;
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
				return `Remaining events ${signedAmount}`
			case "gain-money":
				return `Resources ${signedAmount}`;
			case "modify-progress-tokens":
				return `Progress Tokens ${signedAmount}`;
			case "alter-student-skill":
				const skill = this.translate(cons.studentSkill!, STUDENT_SKILLS);
				return `${skill} ${signedAmount}`;
			case "modify-progress-tokens-cameo":
				return `Cameo Progress Tokens ${signedAmount}`;
			case "replace-card-events":
				return `Replace Card Events with events of card ${cons.cardId}`;
			case "add-card-events-to-list":
				return `Add Card Events card ${cons.cardId}`;
			case "set-temporary-variable":
				return `${cons.operator} ${cons.value} to social variable ${cons.variableId}`;
			default:
				cons satisfies never;
				return "ERROR";
		}
	}

	static #printDungeonAction(cons: Consequence & {type :"dungeon-action"}) : string {
		const signedAmount = this.signedAmount(cons.amount);
		switch (cons.dungeonAction) {
			case "roll-tension-pool":
				return "Roll Tension pool";
			case "modify-tension-pool":
				return "Modify Tension Pool";
			case "modify-clock":
				const clock = cons.clockId;
				return `${clock} ticks ${signedAmount}`;
			case "close-all-doors":
				return `Close All Doors`;
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
			case "cost-reduction":
				return `MP Cost * ${cons.amount}`;
			case "percent-of-total":
				return `MP Cost ${signedAmount} % of total`;
			default:
				cons.subtype satisfies never;
				return "ERROR";
		}
	}

	static signedAmount(amt?: number): string {
		if (!amt) return "";
		return amt! > 0 ?`+${amt}` : `${amt}`
	}

	static printDamageConsequence(cons: Consequence & {type: "damage-new"}) : string {
		const damageType = "damageType" in cons ? this.translate(cons.damageSubtype, DAMAGETYPES): "";
		switch (cons.damageSubtype) {
			case "constant":
				return `${cons.amount} ${damageType} damage`;
			case "high":
				return `High Damage`;
			case "low":
				return `Low Damage`;
			case "allout-high":
				return `AoA high`;
			case "allout-low":
				return `AoA Low`;
			case "multiplier":
				return `Damage Multiplier ${cons.amount}`;
			case "percentage":
				return `${cons.amount}% of target HP`;
			default:
				cons satisfies never;
				return "ERROR";
		}
	}

}

export class EMAccessor<T> {
	private _path : string;
	private _owner: FoundryDocument<any>;
	_master: EMAccessor<any> | null;

	constructor(owner: FoundryDocument<any>, writePath: string, master: EMAccessor<any> | null = null) {
		this._owner = owner;
		this._path = writePath;
		if (this._path.endsWith(".")) {
			throw new PersonaError("What fuckhole put a period here?");
		}
		this._master = master;
	}

	static create<const O extends FoundryDocument<any>, const P extends string, T extends NoArray<GetProperty<O, P>>> ( owner: O, path: P, master?: EMAccessor<any>): EMAccessor<T> {
		return new EMAccessor(owner, path, master) as unknown as EMAccessor<T>;

	}
	get data(): T extends Record<number, any> ? T[number][] : never {
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

	static expandObject<T extends unknown>(data: T) :T  {
		return Helpers.expandObject(data);
	}

	async #patchUpdate(newData: unknown, updatePath: string) {
		if (this._master) {
			this._master.#patchUpdate(newData, updatePath);
			return;
		}
		const data = EMAccessor.expandObject(this.data);
		let datapart : any = data;
		const pathdiff = updatePath.slice(this._path.length).split(".");
		while (pathdiff.length > 1) {
			const path = pathdiff.shift();
			if (!path) continue;
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

	delve<const P extends string, Prop extends GetProperty<T,P>>(path: P) : Prop extends Record<any, any> ? EMAccessor<Prop> : never;
	delve<I extends Record<number, any>> (this: EMAccessor<I>, index: number) : T extends Record<number, any> ? EMAccessor<T[number]> : never;
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
		const item : ConditionalEffect["consequences"][number] = cons ? cons : {
			type: "none",
			amount: 0,
		};
		const that = this as EMAccessor<DeepNoArray<ConditionalEffect["consequences"]>>;
		const newData = that.data;
		newData.push(item);
		await that.update(newData);
	}

	async addNewCondition<I extends DeepNoArray<ConditionalEffect["conditions"]>>( this: EMAccessor<I>, cond ?: Precondition | undefined ) : Promise<void>;
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
			return (this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).conditions(effectIndex!).deleteCondition(condIndex);
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
			(this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).consequences(effectIndex).deleteConsequence(consIndex);
		}
		const that = this as EMAccessor<DeepNoArray<ConditionalEffect["consequences"]>>;
		const d = that.data;
		d.splice(consIndex, 1);
		await that.update(d);
	}

	#effectIndexChecker(effectIndex: number | undefined): effectIndex is number {
		if (effectIndex != undefined) {
			const item = this.data[effectIndex];
			if (item && "conditions" in item) {
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

//@ts-ignore
window.CEManager = ConditionalEffectManager;
