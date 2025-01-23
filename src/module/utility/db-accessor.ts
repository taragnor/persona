
type filterFN<I> = (item: I) => boolean;

type ValidDBTypes = "Actor" | "Item";

import { sleep } from "./async-wait.js";

export class DBAccessor<ActorType extends Actor<any, ItemType> , ItemType extends Item<any>> {

	private comp_items: ItemType[] = [];
	private comp_actors: ActorType[] = [];
	private _loaded= false;
	private _requiresReload = true;
	private _edited: Actor[] = [];
	private _editedItems: Item[] = [];

	constructor() {
		Hooks.once("ready", async () => {
			this.#loadPacks();
			this._initHooks();
			console.log("Database initialized");
			this._loaded = true;
		});
	}

	get isLoaded(): boolean {
		return this._loaded;
	}

	async waitUntilLoaded(): Promise<void> {
		if (this.isLoaded) return;
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
		Hooks.on("updateItem", this.onUpdateItem.bind(this));
		Hooks.on("updateActor", this.onUpdateActor.bind(this));
		Hooks.on("createActor", this.onUpdateActor.bind(this));
		Hooks.on("createItem", this.onUpdateItem.bind(this));
		this.initHooks();
	}


	onUpdateItem(item: Item) {
		if (item.pack ||  item.parent instanceof Actor && item.parent.pack) {
			console.log(`${item.name} curerntly beign edited`);
			this._editedItems.push(item);
		}
	}

	async onUpdateActor(actor: Actor) {
		if (actor.pack) {
			console.log(`${actor.name} curerntly beign edited`);
			this._edited.push(actor);
			this.queueLoad();
		}
	}

	queueLoad() {
		if (this._requiresReload)
			return;
		this._requiresReload = true;
		setTimeout(() => this.checkReload(), 1000);
	}

	checkReload() {
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
		this.#loadPacks();
	}

	 initHooks() {
		//virtual
	}

	 filterItems(fn: filterFN<ItemType>) : ItemType[]{
		return this.allItems().filter(fn);
	}

	 filterActors(fn: filterFN<ActorType>) {
		return this.allActors().filter(fn);
	}

	 filterItemsByType(type: string): Subtype<ItemType, typeof type>[] {
		return this.filterItems( x=> x.type == type);
	}

	 filterActorsByType(type: ValidDBTypes): Subtype<ActorType, typeof type>[] {
		return this.filterActors( x=> x.type == type);
	}

	 allItems() : ItemType[] {
		return this.getAllByType ("Item") as ItemType[];
	}

	 allActors() : ActorType[] {
		return this.getAllByType ("Actor") as ActorType[];
	}

	 getActor(id: string) : Option<ActorType> {
		return this.getActorById(id);
	}

	 getActorById (id: string) : Option<ActorType> {
		return this.#findById(id, "Actor") as Option<ActorType>;
	}

	 getItemById (id : string) : Option<ItemType> {
		return this.#findById(id, "Item") as Option<ItemType>;
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
				throw new Error(`Unsupported Type ${type}`);
		}
		if (retarr.length == 0)
			return null;
		return retarr[0];
	}

	#findById(id: string, type: ValidDBTypes = "Actor") : Option<ItemType | ActorType> {
		let retarr: (Actor<any> | Item<any>)[];
		switch (type) {
			case "Actor":
				retarr =  this.filterActors( x => x.id == id);
				break;
			case "Item":
				retarr = this.filterItems( x => x.id == id);
				if (retarr.length == 0) {
					const x= this.allActors().find( x=> x.items.find( item => item.id == id));
					if (!x) break;
					retarr = [x.items.find(x=> x.id == id)! as Item<any>];

				}
				break;
			default:
				throw new Error(`Unsupported Type ${type}`);
		}
		if (retarr.length == 0) {
			return null;
		}
		return retarr[0] as ItemType | ActorType;
	}

	 getAllByType(type : ValidDBTypes) : (ItemType | ActorType)[] {
		const base_items = this.getBaseItemsByType(type);
		const compendium_items = this.getCompendiumItemsByType(type);
		return base_items.concat(compendium_items);
	}

	 getBaseItemsByType (type: ValidDBTypes) : (ActorType | ItemType)[] {
		switch (type) {
			case "Actor": return game.actors.contents as ActorType[];
			case "Item": return game.items.contents as ItemType[];
			default: throw new Error(`Unsupported Type ${type}`);
		}
	}

	 getCompendiumItemsByType(type: ValidDBTypes) : (ActorType | ItemType)[] {
		switch (type) {
			case "Actor": return this.comp_actors;
			case "Item": return this.comp_items;
			default: throw new Error(`Unsupported Type ${type}`);
		}
	}

	async #_loadPacks() : Promise<void> {
		console.log("Loading Packs");
		this.comp_items = await this.getCompendiumDataByType("Item") as ItemType[];
		this.comp_actors = await this.getCompendiumDataByType("Actor") as ActorType[];
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
		const pack_finder = ((e: FoundryCompendium<any>) => e.documentName == DBtype);
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
				throw new Error(`Bad Type ${DBtype}`);
		}
	}

	 async onUpdateCompendium(compendium: FoundryCompendium<any>) {
		console.debug("Updating Compendium");
		switch (compendium.documentName) {
			case "Actor":
			case "Item":
				this.queueLoad();
			default:
				return;
		}
	}

	static namesort<T extends FoundryDocument<any>>(a: T,b:T) {
		return a.name.localeCompare(b.name);
	}

	findItem<T extends Item<any>> ({actor, itemId}: UniversalItemAccessor<T>): T {
		if (actor) {
			const foundActor = this.findActor(actor);
			if (!foundActor) throw new Error(`Actor Id ${actor.actorId} doesn't exist`);
			const item = foundActor.items.find( x=> x.id == itemId);
			if (!item) {
				throw new Error(`Item Id ${itemId} not found on Actor Id ${foundActor.id}` );
			}
			return item as unknown as T;
		}
		return this.getItemById(itemId) as unknown as T;
	}

	findToken<X extends UniversalTokenAccessor<any> | undefined>(acc: X) : X extends UniversalTokenAccessor<infer R> ? R : undefined  {
		if (!acc) return undefined as any;
			const {scene, tokenId} = acc;
		if (scene != null) {
			const sc = game.scenes.get(scene);
			if (!sc)  {
				throw new Error(`Scene Id ${scene} doesn't exist`);
			}
			const tok = sc.tokens.get(tokenId!);
			if (!tok) {
				throw new Error(`Token Id ${tokenId} doesn't exist`);
			}
			if (!tok.actor) {
				throw new Error(`No actor on Token Id ${tokenId}`);
			}
			return tok as any;
		}
		const sc = game.scenes.find(x=> x.tokens.get(tokenId) != null);
		if (!sc)
		throw new Error(`Couldn't find tokenId ${tokenId} on any scene`);
		const tok = sc.tokens.get(tokenId)!;
		if (!tok.actor) {
			throw new Error(`No actor on Token Id ${tokenId}`);
		}
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

	getUniversalItemAccessor<T extends Item<any>>(item: T) : UniversalItemAccessor<T> {
		return {
			actor: (item.parent) ? this.getUniversalActorAccessor(item.parent): undefined,
			itemId: item.id,
		}
	}

	getUniversalActorAccessor<T extends Actor<any>> (actor: T) : UniversalActorAccessor<T> {
		if (actor.token && actor.token.object) {
			return {
				actorId: actor.id,
				token: this.getUniversalTokenAccessor(actor.token.object),
			};
		}
		for (const comb of game.combat?.combatants ?? [])
		if (comb.actor == actor && comb.token.actorLink) {
			return  {
				actorId: actor.id,
				token: this.getUniversalTokenAccessor(comb.token),
			} as UniversalActorAccessor<T>;
		}
		return {
			actorId: actor.id,
			token: undefined
		}
	}

	getUniversalAEAccessor<T extends ActiveEffect<any, any> & {parent: Actor<any> | Item<any>}> (effect: T): UniversalAEAccessor<T> {
		const parent = effect.parent;
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
		else throw new Error("Active Effect doesn't have a pvalid parent");
	}

	getUniversalTokenAccessor<T extends Token<any>>(tok: T) : UniversalTokenAccessor<T["document"]> ;
	getUniversalTokenAccessor<T extends TokenDocument<any>>(tok: T) : UniversalTokenAccessor<T>;
	getUniversalTokenAccessor(tok: Token<any> | TokenDocument<any>) : UniversalTokenAccessor<any> {
		if (tok instanceof Token) tok = tok.document;
		return {
			scene: tok.parent.id,
			tokenId: tok.id,
		};
	}

	accessorEq<T extends UniversalTokenAccessor<any> | UniversalItemAccessor<any> | UniversalActorAccessor<any>> ( a: T, b: T) : boolean {
		if ("tokenId" in a && "tokenId" in b) {
			return a.tokenId == b.tokenId
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


export type UniversalTokenAccessor<T extends TokenDocument<any>> = {
	scene: string,
	tokenId : T["id"],
};

export type UniversalActorAccessor<T extends Actor<any, any, any>> = {
	token ?: UniversalTokenAccessor<TokenDocument<T>>,
	actorId : T["id"],
}

export type UniversalItemAccessor<T extends Item<any>> = {
	actor?: UniversalActorAccessor<Actor<any, any>>,
	itemId: T["id"],
}


export type UniversalAEAccessor<T extends ActiveEffect<any,any>> =
	{
		effectId: T["id"],
	} &
	(
		{ actor: UniversalActorAccessor<any>}
		| { item: UniversalItemAccessor<any>}
	);
