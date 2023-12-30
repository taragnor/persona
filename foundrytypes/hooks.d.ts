
declare interface Hooks {
	once(hookname: keyof HOOKS, fn: HOOKS[keyof HOOKS]): void;
	on (hookname: keyof HOOKS, fn: HOOKS[keyof HOOKS]): void;
}

interface HOOKS{
	"init": () => void;
	"ready": () => void;
	"updateCompendium": () =>void;
};

type HOOKS_NAMES= keyof HOOKS;
type HOOK_FNs= HOOKS[HOOKS_NAMES];


