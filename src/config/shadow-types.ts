export const SHADOW_ROLE_LIST = [
	"base",
	"soldier",
	"lurker",
	"support",
	"tank",
	"brute",
	"elite",
	"miniboss",
	"boss",
] as const;

export type ShadowRole = typeof SHADOW_ROLE_LIST[number];

export const SHADOW_ROLE= Object.fromEntries(
	SHADOW_ROLE_LIST.map( x=> [x, `persona.shadow.role.${x}`])
);
