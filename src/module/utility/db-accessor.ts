type filterFN<I> = (item: I) => boolean;

type ValidDBTypes = "Actor" | "Item";

export class DBAccessor<ActorType extends Actor<any, ItemType> , ItemType extends Item<any>> {

	comp_items: ItemType[] = [];
	comp_actors: ActorType[] = [];

	constructor() {
		Hooks.once("ready", () => {
			this._loadPacks();
			this._initHooks();
			console.log("Database initialized");
		});
	}

	 _initHooks() : void {
		Hooks.on("updateCompendium", this.onUpdateCompendium.bind(this));
		this.initHooks();
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
		let retarr;
		switch (type) {
			case "Actor":
				retarr =  this.filterActors( x => x.id == id);
				break;
			case "Item":
				retarr = this.filterItems( x => x.id == id);
				break;
			default:
				throw new Error(`Unsupported Type ${type}`);
		}
		if (retarr.length == 0)
			return null;
		return retarr[0];
	}

	 getAllByType(type : ValidDBTypes) : (ItemType | ActorType)[] {
		const base_items = this.getBaseItemsByType(type);
		const compendium_items = this.getCompendiumItemsByType(type);
		return base_items.concat(compendium_items);
	}

	 getBaseItemsByType (type: ValidDBTypes) : (ActorType | ItemType)[] {
		switch (type) {
			case "Actor": return Array.from(game.actors) as ActorType[];
			case "Item": return Array.from(game.items) as ItemType[];
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

	async _loadPacks() : Promise<void> {
		console.log("Loading Packs");
		this.comp_items = await this.getCompendiumDataByType("Item") as ItemType[];
		this.comp_actors = await this.getCompendiumDataByType("Actor") as ActorType[];
		this.loadPacks();
	}

	 async loadPacks() : Promise<void> {
		//virtual, designed to be extended
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
				await this.loadPacks();
			default:
				return;
		}
	}

	static namesort<T extends FoundryDocument<any>>(a: T,b:T) {
		return a.name.localeCompare(b.name);
	}


} //End of class


