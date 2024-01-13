declare class ActiveEffect<T extends Actor, I extends Item> extends FoundryDocument<never>  {
	/** returns if effect is active, by default is !disabled && !isSuppressed() */
	get active(): boolean

	statuses: Set<CONFIG["statusEffects"][number]["id"]>
	disabled: boolean;
	/** always returns false by default but can be overloaded*/
	isSuppressed(): boolean;
	parent:T | I;
}



type AECHANGE = {
	effect: ActiveEffect<any>;
	key: string; //keys to one of the system values
	mode: number,
	priority: number,
	value: string,
}
