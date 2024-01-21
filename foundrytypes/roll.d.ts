class Roll {
	constructor (dice_expr: string);

	async roll(): Promise<this>;
	get total(): number;
	get result(): string;
	async toMessage(): Promise<ChatMessage>;
	get dice(): Die[];

}

class Die {
	faces: number;
	number: number;
	get total(): number;
	values: number[]




}

