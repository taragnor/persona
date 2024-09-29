import { PersonaError } from "./persona-error.js";
import { PreconditionType } from "../config/precondition-types.js";
import { ConsequenceType } from "../config/effect-types.js";
import { CONSQUENCELIST } from "../config/effect-types.js";
import { PRECONDITIONLIST } from "../config/precondition-types.js";
import { ConditionalEffect } from "./datamodel/power-dm.js";
import { PersonaDB } from "./persona-db.js";

export class ConditionalEffectManager {

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
		const element = data[0];
		if (!element) {return [] as any;}
		if ("consequences" in element) {
			return this.getEffects(data as ConditionalEffect[], null, null) as any;
		}
		const etype = element.type;
		if (PRECONDITIONLIST.includes(etype as any)) {
			return this.getConditionals(data as ConditionalEffect["conditions"], null, null) as any;
		}
		if (CONSQUENCELIST.includes(etype as any)) {
			return this.getConsequences(data as ConditionalEffect["consequences"], null, null) as any;
		}
		Debug(data);
		throw new PersonaError("Cna't recognize type of data");
	}

}


// export class EMAccessor<Owner extends FoundryDocument<any>,  const P extends string,T extends GetProperty<Owner, P> & Record<number, any>>  {

// export class EMAccessor<const O extends FoundryDocument<any>,
// 	const P extends string,
// 	const T extends NoArray<GetProperty<O, P>> & Record<number, any>
// 	>{
export class EMAccessor<T> {
		private _path : string;
		private _owner: FoundryDocument<any>;
	_master: EMAccessor<any> | null;

	constructor(owner: FoundryDocument<any>, writePath: string, master: EMAccessor<any> | null = null) {
		this._owner = owner;
		this._path = writePath;
		this._master = master;
	}

		static create<const O extends FoundryDocument<any>, const P extends string, T extends NoArray<GetProperty<O, P>>> ( owner: O, path: P): EMAccessor<T> {
			return new EMAccessor(owner, path) as unknown as EMAccessor<T>;

		}
		get data(): T extends Record<number, any> ? T[number][] : never {
			const data = foundry.utils.getProperty(this._owner, this._path) as T;
			return ConditionalEffectManager.getVariableEffects(data as any);
		}

	async update(newData: DeepNoArray<T>) {
		const updateObj : Record<string, any>= {};
		updateObj[this._path] = newData;
		if (!this._master) {
			await this._owner.update(updateObj);
			return this;
		}
		const rawData = foundry.utils.getProperty(this._owner, this._path);
		await this._master.#patchUpdate(rawData, newData);
		return this;
	}

	async #patchUpdate(oldData: unknown, newData: unknown) {
		if (this._master) {
			this._master.#patchUpdate(oldData, newData);
			return;
		}
		const patchUpdateSub = function (obj: Record<string, any>, targetData: unknown, writeData: unknown) {
			for (const [k,v] of Object.entries(obj)) {
				if (v == targetData) {
					obj[k] = writeData;
					return true;
				}
				if (typeof v == "object") {
					if (patchUpdateSub(v, targetData, writeData)) {
						return true;
					}
				}
			}
			return false;
		}
		const rawData = foundry.utils.getProperty(this._owner, this._path);
		const x = patchUpdateSub(rawData, oldData, newData);
		if (!x) throw new PersonaError("Couldn't find roperty for data replace");
		await this.update(rawData);
	}

	conditions(this: EMAccessor<DeepNoArray<ConditionalEffect[]>>, effectIndex: number): EMAccessor<DeepNoArray<ConditionalEffect["conditions"]>> {
		const newPath = `${this._path}.${effectIndex}.conditions`;
		return new EMAccessor(this._owner, newPath, this);
	}

	consequences(this: EMAccessor<DeepNoArray<ConditionalEffect[]>>, effectIndex: number) : EMAccessor<DeepNoArray<ConditionalEffect["consequences"]>> {
		const newPath = `${this._path}.${effectIndex}.consequences`;
		return new EMAccessor(this._owner, newPath, this);
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

	deleteConditionalEffect(this: EMAccessor<ConditionalEffect[]>) {

	}

	async addNewConsequence<I extends DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>) : Promise<void>;
	async addNewConsequence<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, effectIndex: number): Promise<void>;
	async addNewConsequence<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>, effectIndex?: number) : Promise<void> {
		if (effectIndex == undefined) {
			const item : ConditionalEffect["consequences"][number] = {
				type: "none",
				amount: 0,
			};
			const that = this as EMAccessor<DeepNoArray<ConditionalEffect["consequences"]>>;
			const newData = that.data;
			newData.push(item);
			await that.update(newData);
		} else {
			await (this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).consequences(effectIndex).addNewConsequence();
		}
	}

	async addNewCondition<I extends DeepNoArray<ConditionalEffect["conditions"]>>( this: EMAccessor<I>) : Promise<void>;
	async addNewCondition<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, effectIndex: number): Promise<void>;
	async addNewCondition<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["conditions"]>> ( this: EMAccessor<I>, effectIndex?: number) : Promise<void> {
		if (effectIndex == undefined) {
			const item : ConditionalEffect["conditions"][number] = {
				type: "always",
			};
			const that = this as EMAccessor<DeepNoArray<ConditionalEffect["conditions"]>>;
			const newData = that.data;
			newData.push(item);
			await that.update(newData);
		} else {
			await (this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).conditions(effectIndex).addNewCondition();
		}
	}

	async deleteCondition<I extends DeepNoArray<ConditionalEffect["conditions"]>>( this: EMAccessor<I>, condIndex: number) : Promise<void>;
	async deleteCondition<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, condIndex: number, effectIndex: number): Promise<void>;
	async deleteCondition<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["conditions"]>>( this: EMAccessor<I>, condIndex: number, effectIndex?: number) : Promise<void> {
		if (effectIndex == undefined) {
			const that = this as EMAccessor<DeepNoArray<ConditionalEffect["conditions"]>>;
			const d = that.data;
			d.splice(condIndex, 1);
			await that.update(d);
		} else {
			(this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).conditions(effectIndex).deleteCondition(condIndex);
		}
	}

	async deleteConsequence<I extends DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>, consIndex: number) : Promise<void>;
	async deleteConsequence<I extends DeepNoArray<ConditionalEffect[]>>( this: EMAccessor<I>, consIndex: number, effectIndex: number): Promise<void>;
	async deleteConsequence<I extends DeepNoArray<ConditionalEffect[]> | DeepNoArray<ConditionalEffect["consequences"]>>( this: EMAccessor<I>, consIndex: number, effectIndex?: number) : Promise<void> {
		if (effectIndex == undefined) {
			const that = this as EMAccessor<DeepNoArray<ConditionalEffect["consequences"]>>;
			const d = that.data;
			d.splice(consIndex, 1);
			await that.update(d);
		} else {
			(this as EMAccessor<DeepNoArray<ConditionalEffect[]>>).consequences(effectIndex).deleteConsequence(consIndex);
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


