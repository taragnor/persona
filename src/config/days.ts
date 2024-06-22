export const DAYS_LIST = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Sunday",
	"Saturday"
] as const;

export const DAYS = Object.fromEntries( 
	DAYS_LIST.map( x=> [x,x])
);
