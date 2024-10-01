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

