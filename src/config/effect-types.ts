export const CONSQUENCELIST = [
	"none",
	"half-damage",
	"healing",
	"addStatus",
	"removeStatus",
	"removeStatus-self",
	"addStatus-self",
	"escalationManipulation",
	"extraAttack",
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
] as const;

export const PRECONDITIONTYPES = Object.fromEntries( PRECONDITIONLIST.map(x=> [x, `persona.preconditions.${x}`]));

export const POWERTYPESLIST = [
	"weapon",
	"magic",
	"other",
	"none",
] as const;

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

