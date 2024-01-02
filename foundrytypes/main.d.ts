
interface Window {
	CONFIG : typeof CONFIG,
	foundry: typeof foundry,
		game: Game
}

declare const game : Game;

declare const foundry:   {
	abstract: FoundryAbstract;
	data: FoundryData;
}

declare const Hooks: Hooks;

declare const CONFIG : CONFIG;



declare interface Game {
	actors: Collection<Actor<any, any>>;
	items: Collection<Item<any>>,
		packs: Collection<FoundryCompendium<any>>,
		users: Collection<FoundryUser>,
		system: FoundrySystem,
		user: FoundryUser,
}


declare class Actors {
	static unregisterSheet<T>(scope: string, sheetClass: typeof ActorSheet<T>): void;
	static registerSheet<T>(scope: string, sheetClass: typeof ActorSheet<T>, details: {
		types: string[], makeDefault: boolean}) : void;
}

declare class Items {
	static unregisterSheet<T>(scope: string, sheetClass: typeof ItemSheet<T>): void;
	static registerSheet<T>(scope: string, sheetClass: typeof ItemSheet<T>, details: {
		types: string[], makeDefault: boolean}) : void;
}

declare interface Collection<T> {
	contents: T[];
	filter(fn: (T) => boolean) : T[];
	map(fn: (T) => boolean) : T[];
	[Symbol.iterator]() : Iterator<T>;
	get(id: string) : T | null;
	getName(name: string): T | null;

}

declare class FoundryCompendium<T extends object> {
	documentName: FoundryDocumentTypes;
	async getDocuments(): Promise<T[]>;
}

declare class FoundryUser extends FoundryDocument<never>{
	targets: Collection<Token<any>> & {user: FoundryUser};
	role: number;
	viewedScene: string;

}

type FoundryDocumentTypes = "Actor" | "Item" | "Scene";


interface FoundrySystem {
	id: string
}
