export const AVAILABILITY_LIST = [
	"++",
	"+",
	"-",
	"--",
	"N/A",
] as const;

export const AVAILABILITY = Object.fromEntries( AVAILABILITY_LIST.map(x=> [x, `persona.availability.${x}`]));

export type Availability = (typeof AVAILABILITY_LIST)[number];
