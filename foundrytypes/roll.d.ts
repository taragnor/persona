class Roll {
	constructor (dice_expr: string);

	async roll(): Promise<this>;
	get total(): number;
	get result(): string;
	async toMessage(): Promise<ChatMessage>;

}

