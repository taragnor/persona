
declare interface Hooks {
	once< T extends keyof HOOKS>(hookname: T, fn: HOOKS[T]): void;
	on <T extends keyof HOOKS>(hookname: T, fn: HOOKS[T]): void;
	callAll(hookname:keyof HOOKS): void;
}

declare interface HOOKS {
	"init": () => Promise<void>;
	"ready": () => Promise<void>;
	"updateCompendium": () => Promise<void>;
	"applyActiveEffect": ApplyAEHookFn;
	"combatStart": (combat: Combat, updateData: CombatUpdateData) => Promise<void>;
	"combatTurn": (combat: Combat, updateData: CombatUpdateData, updateOptions: CombatUpdateOptions) => Promise<void>;
	"combatRound": (combat: Combat, updateData: CombatUpdateData, updateOptions: CombatUpdateOptions) => Promise<void>;
	"chatMessage": (chatLog: ChatLog, contents: string, chatMsgData: unknown) => Promise<void>;
	"preCreateChatMessage": (msg: ChatMessage, spkdata: unknown, otherstuff: unknown, id: string) => Promise<void>;
	"createChatMessage": (msg: ChatMessage, otherstuff: unknown, id: string) => Promise<void>;
	"renderChatMessage": (msg: ChatMessage, htmlElement: JQuery<HTMLElement>, data: unknown) => Promise<void>;
	"updateActor": (actor: Actor<any>, changes: Record<string, unknown>, diffObject: DiffObject, id: string) => Promise<void>,
		"preUpdateActor": (actor: Actor<any>, changes: Record<string, unknown>, diffObject: DiffObject, id: string) => Promise<false | void>,
		"preUpdateCombat": UpdateHook<Combat, {advanceTime: number, direction?:number, type: string}>,
		"updateCombat": UpdateHook<Combat, {advanceTime: number, direction?:number, type: string}>,
		"deleteCombat": DeleteHook<Combat>,
		"updateItem": UpdateHook<Item<any>>,
		"deleteItem": DeleteHook<Item<any>>,
		"createItem": CreateHook<Item<any>>,
		"createToken": CreateHook<TokenDocument<any>>,
		"updateToken": UpdateHook<TokenDocument<any>>,
		"deleteToken": DeleteHook<TokenDocument<any>>,
		"deleteActor": DeleteHook<Actor<any>>,
		"updateScene": UpdateHook<Scene>,
		"renderCombatTracker": RenderCombatTabFn,

};

type ApplyAEHookFn = (actor: Actor<any,any>, change: AEChange , current: any , delta: any, changes: Record<string, any>) => Promise<void>;

type UpdateHook<T, Diff = {}> = (updatedItem: T, changes: Record<string, unknown>, diff: DiffObject & Diff, id: string) => Promise<void>;

type DeleteHook<T> = (deletedItem: T, something: Record<string, unknown>, id: string) => Promise<void>;

type DiffObject = {
	diff: boolean,
	render: boolean
}

type CombatUpdateOptions = {
	/**The amount of time in seconds that time is being advanced*/
	advanceTime: number,
	/** A signed integer for whether the turn order is advancing or rewinding */
	direction: number
}


type RenderCombatTabFn= (item: CombatTracker, element: JQuery<HTMLElement>, options: RenderCombatTabOptions) => Promise<void>;

type RenderCombatTabOptions = {
	combat: Combat;
	combatCount: number;
	combats: Combat[];
	control: boolean;
	cssClass: string;
	cssId: string;
	currentIndex: number;
	hasCombat: boolean;
	labels: Record<string, string>;
	linked: boolean;
	nextId: unknown | null;
	previousId: unknown | null;
	round: number;
	settings: Record<string, unknown>;
	started: undefined | unknown;
	tabName: string;
	turn: number;
	turns: unknown[];
	user: FoundryUser
};

