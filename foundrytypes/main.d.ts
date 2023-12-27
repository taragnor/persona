
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


declare interface CONFIG {
	Actor: {
		dataModels: Record<string, typeof foundry.abstract.DataModel>;
		documentClass: typeof Actor<T>;
	}
	Item: {
		dataModels: Record<string, typeof foundry.abstract.DataModel>;
		documentClass: typeof Item<T>;
	}

}


declare interface Game {
	actors: Collection<Actor>

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



