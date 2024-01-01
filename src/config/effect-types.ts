export const EFFECTLIST= [
	"damage",
	"healing",
	"addStatus",
	"removeStatus",
	"escalationManipulation",
] as const;

export const EFFECTTYPES = Object.fromEntries(
EFFECTLIST.map( x=> [x, `persona.effecttypes.${x}`])
);



export const PRECONDITIONLIST = [
	"natural+",
	"natural-",
	"naturalodd",
	"naturaleven",
	"critical",
	"miss",
	"hit",
	"escalation+",
	"escalation-",
]

export const PRECONDITIONTYPES = Object.fromEntries( PRECONDITIONLIST.map(x=> [x, `persona.preconditions.${x}`]));

export const POWERTYPESLIST = [
	"weapon",
	"magic",
	"other",
	"none",
]

export const POWER= Object.fromEntries( POWERTYPESLIST.map(x=> [x, `persona.power.types.${x}`]));

