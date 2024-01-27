export const CONSQUENCELIST = [
	"none",
	"absorb",
	"hp-loss",
	"dmg-low",
	"dmg-high",
	"dmg-mult",
	"addStatus",
	"removeStatus",
	"escalationManipulation",
	"extraAttack",
	"expend-slot",
	"modifier",

] as const;

export const CONSQUENCETYPES = Object.fromEntries(
CONSQUENCELIST.map( x=> [x, `persona.effecttypes.${x}`])
);

export const PRECONDITIONLIST = [
	"always",
	"natural+",
	"natural-",
	"natural-odd",
	"natural-even",
	"critical",
	"miss",
	"hit",
	"escalation+",
	"escalation-",
	"activation+",
	"activation-",
	"activation-odd",
	"activation-even",
	"in-battle",
	"non-combat",
	"talent-level+",
	"power-damage-type-is",
	"has-tag",

] as const;

export const PRECONDITIONTYPES = Object.fromEntries( PRECONDITIONLIST.map(x=> [x, `persona.preconditions.${x}`]));

export const POWERTYPESLIST = [
	"weapon",
	"magic",
	"other",
	"none",
	"standalone",
] as const;

export type PowerType = typeof POWERTYPESLIST[number];

export const POWERTYPES= Object.fromEntries( POWERTYPESLIST.map(x=> [x, `persona.power.types.${x}`]));


export const TARGETINGLIST = [
	"1-engaged",
	"1-nearby",
	"1d4-random",
	"1d4-random-rep",
	"1d3-random",
	"1d3-random-rep",
	"1-ally",
	"1d4-allies",
	"self",
	"all-enemies",
	"all-allies",
] as const;

export const TARGETING= Object.fromEntries( TARGETINGLIST.map(x=> [x, `persona.power.targets.${x}`]));

