
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
	static unregisterSheet(scope: string, sheetClass: typeof ActorSheet): void;
	static registerSheet(scope: string, sheetClass: typeof ActorSheet, details: {
		types: string[], makeDefault: boolean}) : void;
}

declare class Items {
	static unregisterSheet(scope: string, sheetClass: typeof ActorSheet): void;
	static registerSheet(scope: string, sheetClass: typeof ActorSheet, details: {
		types: string[], makeDefault: boolean}) : void;
}



