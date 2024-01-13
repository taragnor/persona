class Sheet<T extends Document> {
	static get defaultOptions() : Object; //TODO: be more specific here
	getData(): SheetData | Promise<SheetData>;
	activateListeners(html: JQuery<HTMLElement>): void;
	async render(force: boolean):Promise<void>;
	_state: number;
	_getSubmitData(data: Record<string, any>): Record<string, any>;

}




type SheetData = Record<number | string, unknown>;
