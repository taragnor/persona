export const SEARCH_ACTIONS_LIST = [
	"undecided",
	"search",
	"careful-search",
	"guard",
	"leave",
	"disconnected"
] as const;

export type SearchAction = typeof SEARCH_ACTIONS_LIST[number];

export const SEARCH_ACTIONS = Object.fromEntries(
	SEARCH_ACTIONS_LIST.map( x=> [x, `persona.search.actions.${x}`]));

