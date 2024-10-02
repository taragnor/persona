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
import { BOOLEAN_COMPARISON_TARGET } from "../config/precondition-types.js";
import { CONDITION_TARGETS } from "../config/precondition-types.js";
import { NUMERIC_COMPARISON_TARGET } from "../config/precondition-types.js";
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

	static async alterConditionalEffect<const TP extends string, const P extends string,const  D extends FoundryDocument<any>, Data extends GetProperty<D, P>>(topPath: TP, dataPath: P, action: CEAction, owner: D) {
		const master  = topPath as string != dataPath as string ? new EMAccessor<Data>(owner, topPath) : undefined;
		const acc = new EMAccessor<Data>(owner, dataPath, master);
		switch (action.type) {
			case "create-effect":
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).addConditionalEffect();
			case "delete-effect":
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).deleteConditionalEffect(action.effectIndex);
			case "create-conditional" :
				//@ts-ignore
				return await acc.addNewCondition(action.effectIndex);
			case "create-consequence":
				//@ts-ignore
				return await (acc as EMAccessor<DeepNoArray<ConditionalEffect[]>>).addNewConsequence(action.effectIndex);
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
		const action : CEAction= {
			type: "create-effect",
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

	static applyHandlers<D extends FoundryDocument<any>>(html: JQuery, doc: D) {
		html.find(".add-effect").on("click", async (ev) => await this.handler_addPowerEffect(ev, doc));
		html.find(".del-effect").on("click", async (ev) => await this.handler_deletePowerEffect(ev, doc));
		html.find(".add-condition").on("click", async (ev) => this.handler_addPrecondition(ev, doc));
		html.find(".add-consequence").on("click", async (ev)=> this.handler_addConsequence(ev,doc));
		html.find(".del-consequence").on("click", async (ev) => this.handler_deleteConsequence(ev, doc));
		html.find(".del-condition").on("click", async(ev) => this.handler_deletePrecondition(ev,doc));


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
		return  conditionalEffects.map( eff=> ({
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

	async #patchUpdate(newData: unknown, updatePath: string) {
		if (this._master) {
			this._master.#patchUpdate(newData, updatePath);
			return;
		}
		const data = this.data;
		let datapart : any = data;
		const pathdiff = updatePath.slice(this._path.length).split(".");
		while (pathdiff.length > 1) {
			const path = pathdiff.shift();
			if (!path) continue;
			datapart = datapart[path];
		}
		const lastPath = pathdiff.shift()!;
		datapart[lastPath] = newData;
		await this.update(data as any);
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

	async addConditionalEffect<I extends DeepNoArray<ConditionalEffect[]>>(this: EMAccessor<I>) {
		const item :ConditionalEffect= {
			conditions: [],
			consequences: []
		};
		const data = this.data;
		data.push(item);
		await this.update(data as any);
	}

	async deleteConditionalEffect(this: EMAccessor<ConditionalEffect[]>, effectIndex: number) {
		const data = this.data;
		data.splice(effectIndex, 1);
		await this.update(data);
	}

	async addNewConsequence<I extends DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>) : Promise<void>;
	async addNewConsequence<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, effectIndex: number): Promise<void>;
	async addNewConsequence<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>, effectIndex?: number) : Promise<void> {
		if (this.#effectIndexChecker(effectIndex)) {
			return await (this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).consequences(effectIndex).addNewConsequence();
		}
		const item : ConditionalEffect["consequences"][number] = {
			type: "none",
			amount: 0,
		};
		const that = this as EMAccessor<DeepNoArray<ConditionalEffect["consequences"]>>;
		const newData = that.data;
		newData.push(item);
		await that.update(newData);
	}

	async addNewCondition<I extends DeepNoArray<ConditionalEffect["conditions"]>>( this: EMAccessor<I>) : Promise<void>;
	async addNewCondition<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, effectIndex: number): Promise<void>;
	async addNewCondition<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["conditions"]>> ( this: EMAccessor<I>, effectIndex?: number) : Promise<void> {
		if (this.#effectIndexChecker(effectIndex)) {
			return await (this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).conditions(effectIndex).addNewCondition();
		}
		const item : ConditionalEffect["conditions"][number] = {
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

	static printConditional(cond: Precondition) : string {
		switch (cond.type) {
			case "boolean":
				return printBooleanCond(cond);
			case "numeric":
				return printNumericCond(cond);
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
			default:
				cond satisfies never;
				PersonaError.softFail(`Unknown type ${(cond as any)?.type}`);
		}

	}

	static translate<const T extends string>(items: MultiCheck<T> | T, translationTable?: Record<string, string>) : string {
		if (typeof items == "string")  {
			return translationTable ? translationTable[items] : items;
		}
		return Object.entries(items)
			.flatMap( ([k,v]) => v ? [k] : [])
			.map( x=> translationTable ? translationTable[x] : x)
			.join(", ");
	}

	static printBooleanCond (cond: Precondition & {type: "boolean"}) :string {
		const target1 = ("conditionTarget" in cond) ? this.translate(cond.conditionTarget, CONDITION_TARGETS) : "";
		const target2 = ("conditionTarget2" in cond) ? this.translate(cond.conditionTarget2, CONDITION_TARGETS): "" ;
		const boolComparison = this.translate (cond.boolComparisonTarget, BOOLEAN_COMPARISON_TARGET);
		const not =  !boolComparison  ? "not" : "";
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
				return `${not} a hit/success`;
			case "is-dead":
				return `${target1} is ${not} dead`;
			case "target-owner-comparison";
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
				const link = cond.socialLinkIdOrTarot ? (game.actors.get(cond.socialLinkIdOrTarot) as PersonaActor)?.displayedName : "ERROR";
				return `social Target is ${not} ${link}`;
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
				return `${target1} ${not} has ${cond.itemId} in Inventory`;
			case "creature-type-is":
				const creatureType = this.translate(cond.creatureType, CREATURE_TYPE);
				return `${target1} is ${not} of creature type: ${creatureType}`;
			case "power-slot-is":
				const slot = this.translate(cond.slotType, SLOTTYPES);
				return `Power is ${not} of slot type: ${slot}`;
			case "relationship-type-is":
				return `${target1} is of relationship Type ${cond.relationshipType}`;
			default:
				cond satisfies never
				return "";
		}
	}

	static  printNumericCond(cond: Precondition & {type: "numeric"}) : string {
		switch (cond.comparisonTarget) {
			case "natural-roll":

		}

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
} | {
	type: "delete-effect",
	effectIndex:number,
} | {
	type: "create-conditional",
	effectIndex?:number,
} | {
	type: "create-consequence",
	effectIndex?:number,
} |  {
	type: "delete-conditional",
	effectIndex?:number,
	condIndex: number
} |  {
	type: "delete-consequence",
	effectIndex?:number,
	consIndex: number
};

