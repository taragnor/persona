/* eslint-disable @typescript-eslint/no-explicit-any */

type filterFN<I> = (item: I) => boolean;

type ValidDBTypes = "Actor" | "Item";

import { sleep } from "./async-wait.js";

export class DBAccessor<ActorType extends Actor<any, ItemType> , ItemType extends Item<any>> {

private allActorsMap : Map<string, ActorType> = new Map();
private allItemsMap : Map<string, ItemType> = new Map();
	private comp_items: readonly ItemType[] = [];
	private comp_actors: readonly ActorType[] = [];
	private _loaded= false;
	private _requiresReload = true;
	private _edited: Actor[] = [];
	private _editedItems: Item[] = [];

	constructor() {
		Hooks.once("ready", async () => {
			await this.#loadPacks();
			this._initHooks();
			console.log("Database initialized");
			this._loaded = true;
		});
	}

	get isLoaded(): boolean {
		return this._loaded;
	}

	async waitUntilLoaded(): Promise<void> {
		if (this.isLoaded) {return;}
		await new Promise( (conf) => {
			const interval = setInterval( () => {
				if (this.isLoaded) {
					window.clearInterval(interval);
					conf(true);
				}
			});
		});
		await sleep(1000);
	}

	 _initHooks() : void {
		Hooks.on("updateCompendium", this.onUpdateCompendium.bind(this));
		Hooks.on("updateItem", this.#onUpdateItem.bind(this));
		Hooks.on("updateActor", this.#onUpdateActor.bind(this));
		Hooks.on("createActor", this.#onCreateActor.bind(this));
		Hooks.on("createItem", this.#onCreateItem.bind(this));
		Hooks.on("deleteItem", this.#onDeleteItem.bind(this));
		Hooks.on("deleteActor", this.#onDeleteActor.bind(this));
		this.initHooks();
	}

	#onCreateItem(item: ItemType) {
		this._editedItems.push(item);
		this.queueLoad();
	}

	 #onCreateActor(actor: ActorType) {
		this._edited.push(actor);
		this.queueLoad();
	}

	#onDeleteItem(_item: ItemType) {
		this.queueLoad();
	}

	#onDeleteActor(_actor: ActorType) {
		this.queueLoad();
	}

	#onUpdateItem(item: ItemType) {
		if (item.pack ||  item.parent instanceof Actor && item.parent.pack) {
			console.log(`${item.name} curerntly beign edited`);
			this._editedItems.push(item);
		}
	}

	 #onUpdateActor(actor: ActorType) {
		if (actor.pack) {
			console.log(`${actor.name} curerntly beign edited`);
			this._edited.push(actor);
			this.queueLoad();
		}
	}

	queueLoad() {
		if (this._requiresReload)
			{return;}
		this._requiresReload = true;
		setTimeout(() => this.checkReload(), 1000);
	}

	async checkReload() {
		if ( this._editedItems.some(
			i => i.sheet._state > 0)
			|| this._edited.some(
				x=> x.sheet._state > 0
				|| (x.items?.contents?.some(x=> x.sheet._state >0)
				))
		) {
			setTimeout(() => this.checkReload(), 1000);
			return;
		}
		await this.#loadPacks();
	}

	 initHooks() {
		//virtual
	}

	 filterItems(fn: filterFN<ItemType>) : ItemType[]{
		return this.allItems().filter(fn);
	}

	 filterActors(fn: filterFN<ActorType>) : ActorType[]{
		return this.allActors().filter(fn);
	}

	 filterItemsByType(type: string): Subtype<ItemType, typeof type>[] {
		return this.filterItems( x=> x.type == type);
	}

	 filterActorsByType(type: ValidDBTypes): Subtype<ActorType, typeof type>[] {
		return this.filterActors( x=> x.type == type);
	}

	 allItems() : readonly ItemType[] {
		return this.getAllByType ("Item") as ItemType[];
	}

	 allActors() : readonly ActorType[] {
		return this.getAllByType ("Actor") as ActorType[];
	}

	 getActor(id: string) : Option<ActorType> {
		return this.getActorById(id);
	}

	 getActorById<T extends ActorType = ActorType> (id: string) : Option<T> {
		return this.#findById(id, "Actor") as Option<T>;
	}

	 getItemById<T extends ItemType = ItemType> (id : string) : Option<T> {
		return this.#findById(id, "Item") as Option<T>;
	}

	getActorByName (name: string) : Option<ActorType> {
		return this.#findByName(name, "Actor") as Option<ActorType>;
	}

	getItemByName (name: string) : Option<ItemType> {
		return this.#findByName(name, "Item") as Option<ItemType>;
	}

	#findByName(name: string, type: ValidDBTypes): Option<ItemType | ActorType> {
		let retarr;
		switch (type) {
			case "Actor":
				retarr =  this.filterActors( x => x.name == name);
				break;
			case "Item":
				retarr = this.filterItems( x => x.name == name);
				break;
			default:
				throw new Error(`Unsupported Type ${type as string}`);
		}
		if (retarr.length == 0)
			{return null;}
		return retarr[0];
	}

	#findById(id: string, type: ValidDBTypes = "Actor") : Option<ItemType | ActorType> {
		// let retarr: (Actor<any> | Item<any>)[];
		switch (type) {
			case "Actor": {
				const actor = this.allActorsMap.get(id);
				return actor ? actor : null;
			}
			case "Item": {
				const item = this.allItemsMap.get(id);
				return item ? item : null;
			}
			default:
				throw new Error(`Unsupported Type ${type as string}`);
		}
	}

	 getAllByType(type : ValidDBTypes) : readonly (ItemType | ActorType)[] {
		const base_items = this.getBaseItemsByType(type);
		const compendium_items = this.getCompendiumItemsByType(type);
		return base_items.concat(compendium_items);
	}

	 getBaseItemsByType (type: ValidDBTypes) : readonly (ActorType | ItemType)[] {
		switch (type) {
			case "Actor": return game.actors.contents as ActorType[];
			case "Item": return game.items.contents as ItemType[];
			default: throw new Error(`Unsupported Type ${type as string}`);
		}
	}

	 getCompendiumItemsByType(type: ValidDBTypes) : readonly (ActorType | ItemType)[] {
		switch (type) {
			case "Actor": return this.comp_actors;
			case "Item": return this.comp_items;
			default: throw new Error(`Unsupported Type ${type as string}`);
		}
	}

	async #_loadPacks() : Promise<void> {
		console.log("Loading Packs");
		this.comp_items = await this.getCompendiumDataByType("Item") as ItemType[];
		this.comp_actors = await this.getCompendiumDataByType("Actor") as ActorType[];
		const baseActors = this.getBaseItemsByType("Actor") as ActorType[];
		const baseItems = this.getBaseItemsByType("Item") as ItemType[];
		this.allItemsMap = new Map( baseItems.concat(this.comp_items).map( x=> [x.id, x]));
		this.allActorsMap = new Map( baseActors.concat(this.comp_actors).map( x=> [x.id, x]));
	}

	 async onLoadPacks(): Promise<void> { }

	 async #loadPacks() : Promise<void> {
		 await this.#_loadPacks();
		 this._requiresReload = false;
		 this._edited = [];
		 this._editedItems = [];
		 await this.onLoadPacks();
	}

	 getElementById(id: string, supertype :ValidDBTypes) {
		return this.getAllByType(supertype)
			.find(x => x.id == id);
	}

	async getCompendiumDataByType(DBtype: ValidDBTypes) : Promise<(ActorType | ItemType)[]> {
		const pack_finder = ((e: FoundryCompendium<FoundryDocument>) => e.documentName == DBtype && !e.metadata?.name?.includes("item-piles"));
		const packs = game.packs.filter(pack_finder);
		let compendium_content : (ActorType | ItemType)[] = [];
		for (const pack of packs) {
			const packContent = await pack.getDocuments();
			compendium_content = compendium_content.concat(packContent);
		}
		switch (DBtype) {
			case "Actor":
				return compendium_content as ActorType[];
			case "Item":
				return compendium_content as ItemType[];
			default:
				DBtype satisfies never;
				throw new Error(`Bad Type ${DBtype as string}`);
		}
	}

	 onUpdateCompendium(compendium: FoundryCompendium<FoundryDocument>) {
		console.debug("Updating Compendium");
		switch (compendium.documentName) {
			case "Actor":
			case "Item":
				this.queueLoad();
				break;
			default:
				return;
		}
	}

	static namesort<T extends {name: string}>(a: T,b:T) {
		return a.name.localeCompare(b.name);
	}

	isItemAccessor(obj: unknown) : obj is UniversalItemAccessor<Item> {
		const x = obj as Partial<UniversalItemAccessor<Item>>;
		return (typeof x?.itemId == "string");
	}

	isActorAccessor(obj: unknown): obj is UniversalActorAccessor<any> {
		const x = obj as Partial<UniversalActorAccessor<any>>;
		return (typeof x?.actorId == "string");
	}

	isTokenAccessor( obj: unknown): obj is UniversalTokenAccessor<any> {
		const x = obj as Partial<UniversalTokenAccessor<any>>;
		return (typeof x?.tokenId == "string");
	}

	findItem<T extends Item<any>> ({actor, itemId}: UniversalItemAccessor<T>): T {
		if (actor) {
			const foundActor = this.findActor(actor);
			if (!foundActor) {throw new Error(`Actor Id ${actor.actorId} doesn't exist`);}
			const item = foundActor.items.find( (x: T) => x.id == itemId) as U<T>;
			if (!item) {
				throw new Error(`Item Id ${itemId} not found on Actor Id ${foundActor.id}` );
			}
			return item as unknown as T;
		}
		return this.getItemById(itemId) as unknown as T;
	}

	findToken<X extends UniversalTokenAccessor | undefined>(acc: X) : X extends UniversalTokenAccessor<infer R> ? R : undefined  {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		if (!acc) {return undefined as any;}
			const {scene, tokenId} = acc;
		if (scene != null) {
			const sc = game.scenes.get(scene);
			if (!sc)  {
				throw new Error(`Scene Id ${scene} doesn't exist`);
			}
			const tok = sc.tokens.get(tokenId);
			if (!tok) {
				throw new Error(`Token Id ${tokenId} doesn't exist`);
			}
			if (!tok.actor) {
				throw new Error(`No actor on Token Id ${tokenId}`);
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return tok as any;
		}
		const sc = game.scenes.find(x=> x.tokens.get(tokenId) != null);
		if (!sc)
		{throw new Error(`Couldn't find tokenId ${tokenId} on any scene`);}
		const tok = sc.tokens.get(tokenId)!;
		if (!tok.actor) {
			throw new Error(`No actor on Token Id ${tokenId}`);
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return tok as any;
	}

	findActor<T extends Actor<any>>(accessor: UniversalActorAccessor<T>) : T {
		if (accessor.token != undefined) {
			const token =  this.findToken(accessor.token);
			return token.actor as T;
		}
		return this.getActorById(accessor.actorId) as unknown as T;
	}

	findAE<T extends ActiveEffect<any,any>>(accessor: UniversalAEAccessor<T>) : T | undefined {
		if ("actor" in accessor) {
			const actor = this.findActor(accessor.actor);
			return actor.effects.get(accessor.effectId) as T;
		}
		const item = this.findItem(accessor.item);
		return item.effects.get(accessor.effectId) as T;
	}

	find<T extends UniversalAccessorTypes>( accessor: UniversalAccessor<T>) : T extends infer R ? R | undefined : never {
		type returnType = T extends infer R ? R | undefined : never;
		if ("actorId" in accessor) {
			return this.findActor(accessor) as returnType;
		}
		if ("itemId" in accessor) {
			return this.findItem(accessor) as returnType;
		}
		if ("tokenId" in accessor) {
			return this.findToken(accessor) as returnType;
		}
		if ("effectId" in accessor) {
			return this.findAE(accessor) as returnType;
		}
		return undefined as returnType;
	}

	getUniversalAccessor<T extends UniversalAccessorTypes>(document: T) : UniversalAccessor<T>{
		switch (true) {
			case document instanceof Item: 
				return this.getUniversalItemAccessor(document) as UniversalAccessor<T>;
			case document instanceof Actor: 
				return this.getUniversalActorAccessor(document) as UniversalAccessor<T>;
			case document instanceof TokenDocument: 
				return this.getUniversalTokenAccessor(document) as UniversalAccessor<T>;
			case document instanceof ActiveEffect: 
				return this.getUniversalAEAccessor(document) as UniversalAccessor<T>;
			default:
				throw new Error("Unknwon Type!");
		}


	}

	getUniversalItemAccessor<T extends Item<any>>(item: T) : UniversalItemAccessor<T> {
		return {
			actor: (item.parent) ? this.getUniversalActorAccessor(item.parent): undefined,
			itemId: item.id,
		};
	}

	getUniversalActorAccessor<T extends Actor<any>> (actor: T) : UniversalActorAccessor<T> {
		if (actor.token && actor.token.object) {
			return {
				actorId: actor.id,
				token: this.getUniversalTokenAccessor(actor.token.object),
			};
		}
		for (const comb of game.combat?.combatants ?? [])
		{if (comb.actor == actor && comb.token.actorLink) {
			return  {
				actorId: actor.id,
				token: this.getUniversalTokenAccessor(comb.token),
			} as UniversalActorAccessor<T>;
		}}
		return {
			actorId: actor.id,
			token: undefined
		};
	}

	getUniversalAEAccessor<T extends ActiveEffect<any, any> & {parent: Actor<any> | Item<any>}> (effect: T): UniversalAEAccessor<T> {
		const parent = effect.parent as unknown;
		if (parent instanceof Actor) {
			return {
				actor: this.getUniversalActorAccessor(parent),
				effectId: effect.id,
			};
		}
		if (parent instanceof Item) {
			return {
				item: this.getUniversalItemAccessor(parent),
				effectId: effect.id,
			};
		}
		else {throw new Error("Active Effect doesn't have a pvalid parent");}
	}

	getUniversalTokenAccessor<T extends Token<any>>(tok: T) : UniversalTokenAccessor<T["document"]> ;
	getUniversalTokenAccessor<T extends TokenDocument<any>>(tok: T) : UniversalTokenAccessor<T>;
	getUniversalTokenAccessor(tok: Token<any> | TokenDocument<any>) : UniversalTokenAccessor<any> {
		const TokClass =foundry?.canvas?.placeables?.Token ? foundry.canvas.placeables.Token : Token;
		if (tok instanceof TokClass) {
			tok = tok.document;
		}
		return {
			scene: tok.parent.id,
			tokenId: tok.id,
		};
	}

	accessorEq<T extends UniversalTokenAccessor<any> | UniversalItemAccessor<any> | UniversalActorAccessor<any>> ( a: T, b: T) : boolean {
		if ("token" in a && "token" in b && a.token && b.token) {
			return a.token.tokenId == b.token.tokenId;
		}
		if ("actorId" in a && "actorId" in b) {
			return a.actorId == b.actorId && a.token?.tokenId == a.token?.tokenId;
		}
		if ("itemId" in a && "itemId" in b) {
			return a.itemId == b.itemId && a.actor?.actorId == b.actor?.actorId && a.actor?.token?.tokenId == b.actor?.token?.tokenId;
		}
		return false;
	}

} //End of class


declare global {

type UniversalTokenAccessor<T extends TokenDocument<any> = TokenDocument<any>> = {
	scene: string,
	tokenId : T["id"],
};

type UniversalActorAccessor<T extends Actor<any, any, any> = Actor<any, any, any>> = {
	token ?: UniversalTokenAccessor<TokenDocument<T>>,
	actorId : T["id"],
}

type UniversalItemAccessor<T extends Item<any>= Item<any>> = {
	actor?: UniversalActorAccessor<Actor<any, any>>,
	itemId: T["id"],
}

type UniversalAccessorTypes = Actor | TokenDocument | Item | ActiveEffect;

// type UniversalAccessor<T extends UniversalAccessorTypes> = UniversalActorAccessor<T> | UniversalItemAccessor<T> | UniversalTokenAccessor<T> | UniversalAEAccessor<T>;

type UniversalAccessor<T extends UniversalAccessorTypes> =
	(T extends Actor ? UniversalActorAccessor<T> : never)
	| (T extends TokenDocument ? UniversalTokenAccessor<T> : never)
	| (T extends Item ? UniversalItemAccessor<T> : never)
	| (T extends ActiveEffect ? UniversalAEAccessor<T>: never);

type UniversalAEAccessor<T extends ActiveEffect<any,any> = ActiveEffect> =
	{
		effectId: T["id"],
	} &
	(
		{ actor: UniversalActorAccessor}
		| { item: UniversalItemAccessor}
	);

}


