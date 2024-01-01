export const CONSQUENCELIST= [
	"damage",
	"healing",
	"addStatus",
	"removeStatus",
	"escalationManipulation",
	"extraAttack"
] as const;

export const CONSQUENCETYPES = Object.fromEntries(
CONSQUENCELIST.map( x=> [x, `persona.effecttypes.${x}`])
);

export const PRECONDITIONLIST = [
	"always",
	"natural+",
	"natural-",
	"naturalodd",
	"naturaleven",
	"critical",
	"miss",
	"hit",
	"escalation+",
	"escalation-",
] as const;

export const PRECONDITIONTYPES = Object.fromEntries( PRECONDITIONLIST.map(x=> [x, `persona.preconditions.${x}`]));

export const POWERTYPESLIST = [
	"weapon",
	"magic",
	"other",
	"none",
] as const;

export const POWERTYPES= Object.fromEntries( POWERTYPESLIST.map(x=> [x, `persona.power.types.${x}`]));

