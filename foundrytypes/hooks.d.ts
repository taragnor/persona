
declare interface Hooks {
	once< T extends keyof HOOKS>(hookname: T, fn: HOOKS[T]): void;
	on <T extends keyof HOOKS>(hookname: T, fn: HOOKS[T]): void;
}

interface HOOKS {
	"init": () => void;
	"ready": () => void;
	"updateCompendium": () =>void;
	"applyActiveEffect": ApplyAEHookFn

};

type ApplyAEHookFn = (actor: Actor<any,any>, change: AEChange , current: any , delta: any, changes: Record<string, any>) => void;

