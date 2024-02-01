
declare interface Hooks {
	once< T extends keyof HOOKS>(hookname: T, fn: HOOKS[T]): void;
	on <T extends keyof HOOKS>(hookname: T, fn: HOOKS[T]): void;
}

declare interface HOOKS {
	"init": () => Promise<void>;
	"ready": () => Promise<void>;
	"updateCompendium": () => Promise<void>;
	"applyActiveEffect": ApplyAEHookFn;
	"combatStart": (combat: Combat, updateData: CombatUpdateData) => Promise<void>;
	"combatTurn": (combat: Combat, updateData: CombatUpdateData, updateOptions: CombatUpdateOptions) => Promise<void>;
	"combatRound": (combat: Combat, updateData: CombatUpdateData, updateOptions: CombatUpdateOptions) => Promise<void>;
};

type ApplyAEHookFn = (actor: Actor<any,any>, change: AEChange , current: any , delta: any, changes: Record<string, any>) => Promise<void>;


type CombatUpdateOptions = {
	/**The amount of time in seconds that time is being advanced*/
	advanceTime: number,
	/** A signed integer for whether the turn order is advancing or rewinding */
	direction: number
}
