declare class Combat<T extends Actor<any, any>> extends FoundryDocument {
	active: boolean;
	round: number;
	turn: number;
	sort: number;
	current?: {
		combatantId: string,
		round: number,
		tokenId: string,
		turn: 0
	}
	combatants: Collection<Combatant<T>>;
	turns: Combatant<T>[];



}
