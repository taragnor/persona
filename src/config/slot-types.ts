export const SLOTTYPES = Object.fromEntries(
	[0, 1, 2, 3].map( x=> [x, `persona.slottypes.${x}.name`])
);

export type SlotType = "0" | "1" | "2" | "3"| "lowest" | "highest";

export const SLOT_TYPES_EXPANDED = {
	...SLOTTYPES,
	lowest: "persona.slottypes.lowest.name",
	highest: "persona.slottypes.highest.name",
} as const;
