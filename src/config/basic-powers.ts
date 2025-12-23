const BASIC_POWER_NAMES = [
	"Basic Attack",
] as const;

export const BASIC_PC_POWER_NAMES = [
	...BASIC_POWER_NAMES,
	"All-out Attack",
	"Defend",
	"Fight in Spirit (Offense)",
	"Fight in Spirit (Defense)",
	"Fight in Spirit (Recovery)",
] as const;

export const BASIC_SHADOW_POWER_NAMES = [
	...BASIC_POWER_NAMES,
	"Gather Power",
] as const;

