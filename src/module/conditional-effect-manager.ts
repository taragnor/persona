/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// import { NumericV2 } from "./conditionalEffects/numericV2.js";

import { PersonaSettings } from "../config/persona-settings.js";
import { NonDeprecatedModifierTarget } from "../config/item-modifiers.js";
import { ModifierContainer, PersonaItem} from "./item/persona-item.js";
import { Helpers } from "./utility/helpers.js";
import { Consequence, DeprecatedConsequence, NonDeprecatedConsequence } from "../config/consequence-types.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { NonDeprecatedPrecondition } from "../config/precondition-types.js";
import { HTMLTools } from "./utility/HTMLTools.js";
import { PersonaError } from "./persona-error.js";
import { PreconditionType } from "../config/precondition-types.js";
import { ConsequenceType } from "../config/effect-types.js";
import { CONSQUENCELIST } from "../config/effect-types.js";
import { PRECONDITIONLIST } from "../config/precondition-types.js";
import { PersonaDB } from "./persona-db.js";
import {ConsequenceConverter} from "./migration/convertConsequence.js";
import {PreconditionConverter} from "./migration/convertPrecondition.js";
import {ConditionalEffectC} from "./conditionalEffects/conditional-effect-class.js";
import {PersonaAE} from "./persona-ae.js";

export class ConditionalEffectManager {

  static cache = {
    preconditions: new WeakMap() as DataCache<NonDeprecatedPrecondition<Precondition>[]>,
    consequences: new WeakMap() as DataCache<NonDeprecatedConsequence[]>,
    conditionalEffectType: new WeakMap() as DataCache<TypedConditionalEffect["conditionalType"]>,
    hits: 0,
    misses: 0,
  };

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
		if (topPath == undefined) {
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

	static canModifyStat (effects: readonly ConditionalEffectC[] | ConditionalEffectC, stat: NonDeprecatedModifierTarget): boolean {
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

	static getAllActiveConsequences(condEffects: ConditionalEffectC[], situation: Situation) : Consequence[] {
		return condEffects.flatMap( effect=> effect.getActiveConsequences(situation));
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

	static getEffects<T extends PersonaActor, I extends ConditonalEffectHolderItem> (CEObject: DeepNoArray<ConditionalEffect[]> | ConditionalEffect[], sourceItem: I | null, sourceActor: T | null, realSource ?: ConditonalEffectHolderItem) : ConditionalEffectC[] {
		const conditionalEffects = Array.isArray(CEObject) ? CEObject : (this.ArrayCorrector(CEObject) as ConditionalEffect[]);
		return conditionalEffects
		.map( ce=> new ConditionalEffectC(ce, sourceItem, sourceActor, realSource)) satisfies SourcedConditionalEffect[];
	}

	static getConditionalType<I extends ConditonalEffectHolderItem>( ce: ConditionalEffect, sourceItem ?: I | null ) : TypedConditionalEffect["conditionalType"] {

    const cached = this.cache.conditionalEffectType.get(ce);
    if (cached) {
      ++this.cache.hits;
      return cached;
    }
    const data =  this._getConditionalType(ce, sourceItem);
    ++this.cache.misses;
    this.cache.conditionalEffectType.set(ce, data);
    return data;
  }

	private static _getConditionalType<I extends ConditonalEffectHolderItem>( ce: ConditionalEffect, sourceItem ?: I | null ) : TypedConditionalEffect["conditionalType"] {
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

  static getConditionals<T extends PersonaActor, I extends ModifierContainer & (Item | ActiveEffect)>
    (
      condObject: DeepNoArray<ConditionalEffect["conditions"]>,
      sourceItem: I | null,
      sourceActor: T | null, realSource: null | U<ModifierContainer>
    ) : SourcedConditionalEffect["conditions"] {
      return this.getUnsourcedConditionals(condObject)
      .map( eff =>
        this.applySourceInformation(eff, sourceItem, sourceActor, realSource)
      );
      // const conditionalEffects = this.ArrayCorrector(condObject);
      // return conditionalEffects.map( maybeDeprecatedEff=> {
      //   const eff = PreconditionConverter.convertDeprecated (maybeDeprecatedEff);
      //   return this.applySourceInformation(eff, sourceItem, sourceActor, realSource);
      // });
        // return {
        //   ...eff,
        //   owner: (sourceActor? PersonaDB.getUniversalActorAccessor(sourceActor) : undefined) as UniversalActorAccessor<ValidAttackers>,
        //   source: sourceItem != null ? sourceItem : undefined,
        //   realSource: realSource ? realSource : undefined,
        // };
      // });
    }

  static getUnsourcedConditionals
    (
      condObject: DeepNoArray<ConditionalEffect["conditions"]>,
    ) : NonDeprecatedPrecondition<Precondition>[] {
      if (!condObject) {
        return [];
      }
      const cached = this.cache.preconditions.get(condObject);
      if (cached) {
        ++this.cache.hits;
        return cached;
      }
      const conditionalEffects = this.ArrayCorrector(condObject);
      const data =  conditionalEffects.map( maybeDeprecatedEff=> {
        const eff = PreconditionConverter.convertDeprecated (maybeDeprecatedEff);
        return eff;
      });
        ++this.cache.misses;
      this.cache.preconditions.set(condObject, data);
      return data;
    }

  static getUnsourcedConsequences<I extends (ModifierContainer & (PersonaItem | PersonaAE))>(consObject: DeepNoArray<ConditionalEffect["consequences"]>, sourceItem: I | null): NonDeprecatedConsequence[] {
      const cached = this.cache.consequences.get(consObject);
    if (cached) {
      ++this.cache.hits;
      return cached;
    }
    const consequences = this.ArrayCorrector(consObject);
    const data=  consequences.map( eff=> {
      const nondep = ConsequenceConverter.convertDeprecated(eff as DeprecatedConsequence, sourceItem instanceof Item ? sourceItem : null);
      return nondep;
    });
    ++this.cache.misses;
    this.cache.consequences.set(consObject, data);
    return data;
  }


	static getConsequences<T extends PersonaActor, I extends (ModifierContainer & (PersonaItem | PersonaAE))>(consObject: DeepNoArray<ConditionalEffect["consequences"]>, sourceItem: I | null, sourceActor: T | null, realSource: null | U<ModifierContainer>): SourcedConditionalEffect["consequences"] {
    return this.getUnsourcedConsequences(consObject, sourceItem)
    .map(cons=> this.applySourceInformation(cons, sourceItem, sourceActor, realSource));
		// const consequences = this.ArrayCorrector(consObject);
		// return consequences.map( eff=> {
		// 	const nondep = ConsequenceConverter.convertDeprecated(eff as DeprecatedConsequence, sourceItem instanceof Item ? sourceItem : null);
        // return this.applySourceInformation(nondep, sourceItem, sourceActor, realSource);
			// return {
			// 	...nondep,
			// 	owner: (sourceActor? PersonaDB.getUniversalActorAccessor(sourceActor) : eff.actorOwner) as UniversalActorAccessor<ValidAttackers>,
			// 	source: sourceItem != null ? sourceItem: undefined,
			// 	realSource: realSource ? realSource : undefined,
			// };
		// });
	}


  static applySourceInformation <T extends object, ActorType extends PersonaActor, ItemType extends ModifierContainer & (Item | ActiveEffect)>( obj: T, sourceItem: N<ItemType>, sourceActor: N<ActorType>, realSource: UN<ModifierContainer>) : Sourced<T> {
    return {
      ...obj,
      owner: (sourceActor? PersonaDB.getUniversalActorAccessor(sourceActor) : undefined) as UniversalActorAccessor<ValidAttackers>,
      source: sourceItem != null ? sourceItem.accessor : undefined,
      realSource: realSource ? realSource.accessor : undefined,
    };
  }

	static ArrayCorrector<T>(obj: T[] | DeepNoArray<T[]>) : T[] {
		try {
			if (obj == null) {return[];}
			if (!Array.isArray(obj)) {
				if (PersonaSettings.debugMode()) {
					console.debug("Array Correction Required");
				}
				return Object.keys(obj).map(function(k) { return obj[Number(k)]; }) as T[];
			}
		} catch (e) {
			Debug(obj);
			throw new PersonaError("Conversion for Array failed", e);
		}
		return obj;
	}

	static getVariableEffects<T extends ConditionalEffect[] | ConditionalEffect["conditions"] | ConditionalEffect["consequences"]>(data: DeepNoArray<T>): T{
		if (!data) {return [] as ConditionalEffect[] as T;}
		const element = data[0];
		if (!element) {return [] as ConditionalEffect[] as T;}
		if ("consequences" in element || "effects" in element) {
			const eff= this.getEffects(data as ConditionalEffect[], null, null);
			const effJSON =  eff.map(x => x.toJSON());
			return effJSON as T;
		}
		const etype = element.type;
		if (PRECONDITIONLIST.includes(etype as any)) {
			return this.getConditionals(data as ConditionalEffect["conditions"], null, null, null) as any;
		}
		if (CONSQUENCELIST.includes(etype as any)) {
			return this.getConsequences(data as ConditionalEffect["consequences"], null, null, null) as any;
		}
		return data as any;
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
		type retType = T extends Record<number, unknown> ? T[number][] : never ;
		const data = foundry.utils.getProperty(this._owner, this._path) as T;
		const data2=  ConditionalEffectManager.getVariableEffects(data as any);
		if (Array.isArray(data2) && data2.at(0) instanceof ConditionalEffectC) {
			return (data2 as ConditionalEffectC[]).map(x=> x.toJSON()) as retType;
		}
		return data2 as retType;
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
				isEmbedded: false,
				isAura: false,
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

export const CETypes = [
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
		isEmbedded: boolean;
		isAura: boolean;
		conditions: Precondition[];
		consequences: Consequence[];
	}

	interface NonDeprecatedConditionalEffect {
		conditions: SourcedPrecondition<NonDeprecatedPrecondition<Precondition>>[];
		consequences: SourcedConsequence<NonDeprecatedConsequence>[];
		isDefensive: boolean;
		isEmbedded: boolean;
		isAura: boolean;
	}

	// type SourcedConditionalEffects = SourcedConditionalEffect[];

	type SourcedConditionalEffect<T extends TypedConditionalEffect= TypedConditionalEffect> = Sourced<T>;

	interface TypedConditionalEffect extends NonDeprecatedConditionalEffect {
		conditionalType: typeof CETypes[number];
	}

	export type SourcedConsequence<T extends Consequence= NonDeprecatedConsequence> = Sourced<T>;

	type SourcedPrecondition<T extends Precondition = NonDeprecatedPrecondition<Precondition>> = 
		Sourced<T>;

	type Sourced<T extends object>= T & {
		source: U<ModifierContainer["accessor"]>;
		owner: U<UniversalActorAccessor<PersonaActor>>;
		realSource: U<ModifierContainer["accessor"]>;
	}

}


type DataCache<T> = WeakMap<object, T>;

//@ts-expect-error adding to global state for debug
window.ConditionalEffectManager = ConditionalEffectManager;
