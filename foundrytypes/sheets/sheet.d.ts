class Sheet<T extends Document> {
	static get defaultOptions() : Object; //TODO: be more specific here
	getData(): Record<number | string, unknown>
	activateListeners(html: JQuery<HTMLElement>): void;
	async render(force: boolean):Promise<void>;
	_state: number;

}




