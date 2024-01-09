
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
		scenes: SceneCollection,
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

interface Collection<T> {
	contents: T[];
	filter(fn: (T) => boolean) : T[];
	map(fn: (T) => boolean) : T[];
	[Symbol.iterator]() : Iterator<T>;
	get(id: string) : T | null;
	getName(name: string): T | null;

}

class FoundryCompendium<T extends object> extends FoundryDocument<never> {
	documentName: FoundryDocumentTypes;
	async getDocuments(): Promise<T[]>;
}

class FoundryUser extends FoundryDocument<never>{
	targets: Collection<Token<any>> & {user: FoundryUser};
	role: number;
	viewedScene: string;

}

class Scene extends FoundryDocument<never> {

}

class SceneCollection extends Collection<Scene> {
	get active(): Scene;

}


type FoundryDocumentTypes = "Actor" | "Item" | "Scene";


interface FoundrySystem {
	id: string
}
