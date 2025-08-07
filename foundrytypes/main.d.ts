
interface Window {
	CONFIG : typeof CONFIG;
	foundry: FoundryStuff;
	game: Game;
}

declare const CONFIG : CONFIG;
declare const foundry: FoundryStuff;
declare const game: Game;

interface FoundryStuff {
	abstract: FoundryAbstract;
	data: FoundryData;
	documents: {
		BaseCombat: typeof BaseCombat;
	}
	/** audio doesn't exist in v11 */
	audio: {
		AudioHelper: typeof FOUNDRY.AUDIO.AudioHelper;
		Sound: typeof Sound;
	}
	canvas: FoundryCanvasTools;
	utils: FoundryUtil;
	applications: foundryApps.Applications;

}



class BaseCombat {
	static defineSchema() : SchemaReturnObject
}

declare const Hooks: Hooks;

declare const CONFIG : CONFIG;


declare interface Game {
	actors: Collection<Actor<any, any>>;
	i18n: Localization;
	items: Collection<Item<any>>;
	packs: Collection<FoundryCompendium<any>>;
	users: Collection<FoundryUser>;
	system: FoundrySystem;
	user: User;
	scenes: SceneCollection;
	combat?: Foundry.Combat<Actor>;
	settings: ClientSettings;
	socket: Socket;
	messages: Collection<ChatMessage>;
	keybindings: Keybindings;
	combats: Collection<Combat>;
	journal: Collection<JournalEntry>;
	world: World;
	get paused(): boolean;
}


interface Localization{
	localize(localizationString: string) : string;
	/** replaces {X} with substitution data using X as a keylookup*/
	format(localizationString: string, substitutionData: Record<string, string>): string;
}


declare class Actors {
	static unregisterSheet<T extends Actor>(scope: string, sheetClass: typeof ActorSheet<T>): void;
	static registerSheet<T extends Actor>(scope: string, sheetClass: typeof ActorSheet<T>, details: {
		types: string[], makeDefault: boolean}) : void;
}

declare class Items {
	static unregisterSheet<T extends Item>(scope: string, sheetClass: typeof ItemSheet<T>): void;
	static registerSheet<T extends Item>(scope: string, sheetClass: typeof ItemSheet<T>, details: {
		types: string[], makeDefault: boolean}) : void;
}

class Collection<T> extends Map<string, T> {
	contents: T[];
	filter(fn: (item: T) => boolean) : T[];
	[Symbol.iterator]() : Iterator<T>;
	get(id: string) : T | undefined;
	getName(name: string): T | undefined;
	find (fn : (item: T) => boolean): T | undefined;
}

class FoundryCompendium<T extends FoundryDocument> extends FoundryDocument<never> {
	find(condition: (x:T) => boolean): T;
	documentName: FoundryDocumentTypes;
	metadata: CompendiumMetaData;
	async getDocument(id: string): Promise<T>;
	async getDocuments(query : Record<string, unknown> = {}): Promise<T[]>;
}

type CompendiumMetaData = {
	name:string;

}



class SceneCollection extends Collection<Scene> {
	get active(): Scene;
	get current(): Scene;

}


type FoundryDocumentTypes = "Actor" | "Item" | "Scene";


interface FoundrySystem {
	id: string,
	version: string,
}



