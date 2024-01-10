class Roll {
	constructor (dice_expr: string);

	async roll(): Promise<this>;
	total: number;

}

