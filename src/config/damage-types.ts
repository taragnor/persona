export const DAMAGETYPESLIST = [
	"physical",
	"fire",
	"cold",
	"wind",
	"lightning",
	"light",
	"dark",
	"untyped",
	"healing",
	"none"
] as const;

export const DAMAGETYPES = Object.fromEntries(
	DAMAGETYPESLIST.map( x=> [x, `persona.damage.types.${x}`])
);



