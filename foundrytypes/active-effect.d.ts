declare class ActiveEffect<A extends Actor<any,I>, I extends Item<any>> extends FoundryDocument<never>  {
	/** returns if effect is active, by default is !disabled && !isSuppressed() */
	get active(): boolean

	statuses: Set<CONFIG["statusEffects"][number]["id"]>
	disabled: boolean;
	/** always returns false by default but can be overloaded*/
	isSuppressed(): boolean;
	parent:A | I;
	origin: Option<unknown>;
	icon: string;
	name: string;
	changes: unknown[];
	description: string;
	duration: Record<string, unknown>;
	transfer: boolean;
}



type AEChange = {
	effect: ActiveEffect<any>;
	key: string; //keys to one of the system values
	mode: number,
	priority: number,
	value: string,
}
