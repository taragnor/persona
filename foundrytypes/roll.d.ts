class Roll {
	constructor (dice_expr: string);

	async roll(options: {async:boolean} = {}): Promise<this>;
	get total(): number;
	get result(): string;
	async toMessage(): Promise<ChatMessage>;
	get dice(): Die[];
	options: Record<string, unknown>;
	toJSON(): string;
	static fromJSON<T extends Roll>(string): T;
}

class Die {
	faces: number;
	number: number;
	get total(): number;
	values: number[]

}

