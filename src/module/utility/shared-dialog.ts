
export class SharedDialog<const T extends SharedDataDefinition> {
	private _dialog: U<Dialog>;
	private _data: SharedDataType<T>;
	name: string;
	private suspended: boolean = false;
	private _definition: T;
	private resolver : (data:SharedDataType<T>) => void;
	private reject : (reason: unknown ) => void;

	constructor (definition: T, name: string) {
		this._definition = definition;
		this.name = name;
		this._data = this.generateDefaultData();
	}

	generateDefaultData() : SharedDataType<T> {
		const data : Partial<typeof this._data> = {};
		for (const [k,v] of Object.entries(this._definition)) {
			const key = k as keyof typeof this._definition;
			switch (true) {
				case ("default" in v && v.default != undefined): {
					//@ts-expect-error TS being annoying
					data[key] = v.default;
					break;
				}
				case ("choices" in v && v.choices.length > 0) :{
					//@ts-expect-error TS being annoying
					data[key] = v.choices.at(0);
					break;
				}
				case ("table" in v) : {
					//@ts-expect-error TS being annoying
					data[key] = Object.keys(v.table).at(0);
					break;
				}
				case (v.type == "string") : {
					//@ts-expect-error TS being annoying
					data[key] = "";
					break;
				}
				case (v.type == "number") : {
					//@ts-expect-error TS being annoying
					data[key] = 0;
					break;
				}
				case (v.type == "boolean") : {
					//@ts-expect-error TS being annoying
					data[key] = false;
					break;
				}
				default: 
					console.log(key, v, this._definition);
					throw new Error(`Bad Data Definition: ${JSON.stringify(this._definition)}`);
			}
		}
		return data as typeof this._data;
	}


	isOpen() : boolean {
		return !!this._dialog && !(this._data && this.suspended);
	}

	setListeners(html : string | JQuery | HTMLElement) : void {
		if (typeof html == "string") {
			html = $(html);
		}
		if (html instanceof HTMLElement) {
			html = $(html);
		}
		html.find('input[name], select[name]').on("change", () => this.refreshData(html));
	}

	openDialog() {
		if (this._dialog) {
			this._dialog.render(true);
		}
	}

	closeDialog() {
		this._dialog = undefined;
	}

	generateHTML() : string {
		const selectors = Object.entries(this._definition)
			.map( ([k,v]) => {
				const label = `<label> ${v.label} </label>`;
				switch (true) {
					case "choices" in v: {
						const options = v.choices
							.map( ch => {
								return `<option value='${ch}'` + 
									(this._data[k] == ch ? "selected" : "")
									+ `${ch}</option>`;
							})
							.join("");
						const elem = `${label}<select name='${k}'>
					${options}
					</select>`;
						return elem;
					}
					case "table" in v: {
						const options = Object.entries(v.table)
							.map( ([key,tv]) => {
								const displayedName = v.type == "localizedString" ? game.i18n.localize(tv) : tv;
								return `<option value='${key}'` + 
									(this._data[k] == key ? "selected" : "")
									+`${displayedName}</option>`;
							})
							.join("");
						const elem = `${label}<select name='${k}'>
					${options}
					</select>`;
						return elem;
					}
					case v.type == "string": {
						const elem = `${label}<input type='string' name='${k}' value='${this._data[k] as string}'>`;
						return elem;
					}
					case v.type == "number": {
						const elem = `${label}<input type='number' name='${k}' value=${this._data[k] as string}>`;
						return elem;
					}
					case v.type == "boolean": {
						const elem = `${label}<input type='checkbox' name='${k}' ${this._data[k] ? 'checked' : ''}>`;
						return elem;
					}
				}
			})
			.join();
		return selectors;
	};

	async open( options : SharedDialogOptions = {}) : Promise<SharedDataType<T>> {
		const content = this.generateHTML();
		if (this._dialog == undefined) {
			this._dialog = new Dialog( {
				title: this.name,
				content,
				render: (html) => this.setListeners(html),
				buttons: {},
				close: () => void (this.isOpen() ? this.openDialog() : this.closeDialog()),
			}, {});
			this.openDialog();
		}
		const promise : Promise <SharedDataType<T>>= new Promise ( (res, rej) => {
			this.resolver = res;
			this.reject = rej;
		});
		return promise;
	}

	collectFormValues($root: JQuery): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		
		$root.find('input[name], select[name]').each((_i, el) => {
			const $el = $(el);
			const name = $el.attr('name');
			
			if (!name) {return;} // skip if no name
			
			let value: unknown;
			
			if ($el.is(':checkbox')) {
				// checkboxes: boolean or list depending on name pattern
				if ($root.find(`input[name="${name}"][type="checkbox"]`).length > 1) {
					// multiple checkboxes with same name
					value = $root
						.find(`input[name="${name}"]:checked`)
						.map((_j, e) => $(e).val())
						.get();
				} else {
					// single checkbox
					value = $el.is(':checked');
				}
			} else if ($el.is(':radio')) {
				// radios: get checked one
				value = $root.find(`input[name="${name}"]:checked`).val() ?? null;
			} else {
				// regular input/select
				value = $el.val();
			}
			
			result[name] = value;
		});
		
		return result;
	}

	refreshData(jquery: JQuery) {
		this._data = this.collectFormValues(jquery) as SharedDataType<T>;
		this.sendData();
	}

	sendData() {
		const data = this._data;
	}

}



type SharedDialogOptions = object;

type SharedFieldDefinition<T extends string | number | boolean> =

	{
		label: string,
		disabled ?: boolean | (() => boolean)
		default ?: T;
	}
	& ({
	type: "string";
	choices: never;
	default ?: string;
} | {
	type: "number";
	default ?: number;
} | {
	type: "boolean";
	default ?: boolean;
}
	|
	(T extends number
		? NumberChoiceFieldDef<T>
		: T extends string ?
		StringChoiceFieldDef<T>
		: never
	)
	)
;

type NumberChoiceFieldDef<T extends number> = {
	type: "number";
	choices: T[];
	default?: T;
};

type StringChoiceFieldDef<T extends string> = 
	{
	type: "string";
	choices: T[];
	default?: T;
} | {
	type : "localizedString";
	table: Record<T, LocalizationString>;
	default?: T;
} | {
	type : "stringTable";
	table: Record<T, string>;
	default?: T;
};

type SharedDataDefinition = Record< string, SharedFieldDefinition<string | number | boolean>>;

type SharedDataType<T extends SharedDataDefinition> = {
	[K in keyof T] : K extends string ? SharedFieldDataType<T[K]> : never};


type SharedFieldDataType<T extends SharedFieldDefinition< string | number | boolean>> =
	"choices" extends keyof T
		? (
			T["choices"] extends Array<unknown>
			? T["choices"][number]
			: never
		)
		: T["type"] extends "number" 
		? number
		: T["type"] extends "string"
		? string
		: T["type"] extends "boolean"
		? boolean
		: "table" extends keyof T
		? keyof T["table"]
		: never;



const x = new SharedDialog( 
	{ "x" : {
		label: "Some Number",
		type: "number",
		choices: [1,2],
		default: 2,
	},
		"bool": {
			label: "boolean",
			type: "boolean",
			default: false,
		}
	}
	, "My Dialog");


