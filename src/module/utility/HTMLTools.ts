
export class HTMLTools {
	static getClosestData <ReturnType extends string | number = string> ( eventOrJQObj: Event | JQuery<HTMLElement> | JQuery.Event, prop: string) : ReturnType {
		const target = ("currentTarget" in eventOrJQObj) ? (eventOrJQObj).currentTarget : eventOrJQObj;
		if (!target) {throw new Error("No target for event");}
		const convert = function (str: string) {
			return Array.from(str).map(x => {
				if (x === x.toLowerCase()) {return x;}
				else {return "-" + x.toLowerCase();}
			}).join("");
		};
		if (prop === undefined)
			{throw new Error("Property name is undefined");}
		const cssprop = convert(prop);
		const data = $(target).closest(`[data-${cssprop}]`).data(prop) as unknown;
		if (data != null) {return data as ReturnType;}
		else {
			throw new Error(`Couldn't find ${prop} property`);
		}
	}

	static getClosestDataNumber <ReturnType extends number = number> ( eventOrJQObj: Event | JQuery<HTMLElement> | JQuery.Event, prop: string) : ReturnType {
		const num = Number(this.getClosestData(eventOrJQObj, prop));
		if (Number.isNaN(num)) {throw new Error("NaN result");}
		return num as ReturnType;
	}

	static getClosestDataSafe<T extends string | number> (eventOrJQObj: Event | JQuery<HTMLElement> | JQuery.Event, prop: string, elseValue: T): T {
		try {
			return this.getClosestData(eventOrJQObj, prop);
		} catch {
			return elseValue;
		}
	}

	static convertForm(str: string) {
		return Array.from(str).map(x => {
			if (x === x.toLowerCase()) {return x;}
			else {return "-" + x.toLowerCase();}
		}).join("");
	}

	static async editItemWindow<T extends Item>(item: T):  Promise<Option<T>> {
		await item.sheet.render(true);
		return await new Promise ( (keep, _brk) => {
			const checker = () =>  {
				const isOpen = item.sheet._state != -1; //window state check
				if (isOpen)
					{setTimeout( checker, 500);}
				else
					{keep(item);}
			};
			setTimeout(checker, 1000);
		});
	}

// **************************************************
// *****************   Dialogs  ****************** *
// **************************************************

	static async confirmBox(title: string, text: string, defaultYes = false) {
		// const templateData = {text};
		const html = `<div>
		${text}
			</div>`;
		return await new Promise( (conf, _reject) => {
			Dialog.confirm({
				title,
				content: html,
				yes: conf.bind(null, true) as typeof conf,
				no: conf.bind(null, false) as typeof conf,
				defaultYes,
				close: () => {
					conf(false);
				},
			});
		});
	}


	static async singleChoiceBox<K extends string, const T extends Record<K, unknown>>(choices: T, options: ChoiceBoxOptions<T> = {}) : Promise<K | null> {
		const localize = options.localize ?? false;
		const defaultChoice = options.default ?? undefined;
		const html = await foundry.applications.handlebars.renderTemplate(`systems/${game.system.id}/module/utility/singleChoiceBox.hbs`, {choices, localize, defaultChoice});
		return await new Promise( (conf, _rej) => {
			const dialog = new Dialog( {
				title: options.title ?? "Choose One",
				content: html,
				buttons: {
					submit: {
						icon: `<i class="fas fa-check"></i>`,
						label: "Confirm",
						callback: (htm: string) => {
							const ret =
								$(htm).find("select.selection").find(":selected").val();
							if (!ret) {conf(null);}
							conf(ret as K);
						}
					},
					cancel : {
						icon: `<i class="fas fa-times"></i>`,
						label: "Cancel",
						callback: () => conf(null)

					}
				},
				close: () => {
					conf(null);
				},
			},
				{}
			);
			dialog.render(true);
		});
	}

	static async getNumber(comment: string) : Promise<number> {
		const html = `<div> ${comment} </div>
		<input type='number' class='numInput' value=0>
		`;
		return await new Promise( (conf, reject) => {
			const dialog = new Dialog({
				title: `Prompt`,
				content: html,
				render: (html: string) => {
					$(html).find(".numInput").focus();
				},
				buttons: {
					one: {
						icon: `<i class="fas fa-check"></i>`,
						label: "Confirm",
						callback: (htm: string) => {
							const value = Number($(htm).find(".numInput").val());
							if (value == undefined) {
								reject( new Error("Something weird happened"));
								return;
							}
							conf(value);
						}
					},
					two: {
						icon: `<i class="fas fa-times"></i>`,
						label: "Cancel",
						callback: () => reject(new CanceledDialgogError("Cancel")),
					}
				},
				default: "one",
				close: () => {
					reject(new CanceledDialgogError("close"));
				},
			}, {});
			dialog.render(true);
		});
	}

	static async numberButtons(msg: string, min: number, max :number) : Promise<number> {
		const html = `<div> ${msg} </div> `;
		const buttons : Record<string, ButtonOptions> = { };
		return await new Promise( (conf, rej) => {
			for (let i = min; i<= max; i++) {
				buttons[`${i}`] = {
					label: `${i}`,
					callback: (_htm: string) => conf(i),
				};
			};
			const dialog = new Dialog ( {
				title: `Prompt`,
				content: html,
				buttons,
				default: `${min}`,
				close: () => rej (new Error("closed")),
			}, {});
			dialog.render(true);
		});
	}

	/** creates a localiation object from an array. The localization header should contain all of the locatization string except for the ending '.name'*/
	static createLocalizationObject<const T extends readonly string[]> ( array: T, localizationHeader: string) : Readonly<Record<T[number], string>> {
		const obj = Object.fromEntries(
			array.map( x=> [x, `${localizationHeader}.${x}`])
		);
		return obj as Readonly<Record<T[number], string>>;
	}


static generateDefaultData<T extends HTMLDataInputDefinition>(definition: T) : HTMLInputReturnType<T> {
		const data : Partial<HTMLInputReturnType<T>> = {};
		for (const [k,v] of Object.entries(definition)) {
			const key = k as keyof typeof definition;
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
					console.log(key, v, definition);
					throw new Error(`Bad Data Definition: ${JSON.stringify(definition)}`);
			}
		}
		return data as HTMLInputReturnType<T>;
	}

	private static _getDisabledState( editingIds: U<FoundryUser["id"][]>) : "" | " disabled" {
		if (editingIds == undefined) {return "";}
		if (game.user.isGM || editingIds.includes (game.user.id))
		{return "";}
		return " disabled";
	}


	static generateFormHTML<T extends HTMLDataInputDefinition>(definition: T, data?: HTMLInputReturnType<T> | null, _options : HTMLGenerationOptions = {}) : string {
		if (!data) {
			data = this.generateDefaultData(definition);
		}
		const selectors = Object.entries(definition)
			.map( ([k,v]) => {
				const label = `<label> ${v.label} </label>`;
				const disabled = this._getDisabledState(v.editingUsers);
				switch (true) {
					case "choices" in v: {
						const options = v.choices
							.map( ch => {
								return `<option value='${ch}'` +
									(data[k] == ch ? "selected" : "")
									+ `${disabled}>`
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
									(data[k] == key ? "selected" : "")
									+ `${disabled}>`
									+ `${displayedName}</option>`;
							})
							.join("");
						const elem = `${label}<select name='${k}'>
					${options}
					</select>`;
						return elem;
					}
					case v.type == "string": {
						const elem = `${label}<input type='string' name='${k}' value='${data[k] as string}' ${disabled}>`;
						return elem;
					}
					case v.type == "number": {
						const elem = `${label}<input type='number' name='${k}' value=${data[k] as string} ${disabled}>`;
						return elem;
					}
					case v.type == "boolean": {
						const elem = `${label}<input type='checkbox' name='${k}' ${data[k] ? 'checked' : ''} ${disabled}>`;
						return elem;
					}
				}
			})
			.map( x=> `<div> ${x} </div>`)
			.join("");
		return selectors;
	}

	static collectFormValues($root: JQuery): Record<string, unknown> {
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

// **************************************************
// **************   EventHandlers  *************** *
// **************************************************

	static middleClick (handler: (ev: Event)=>unknown ) {
		return function (event: MouseEvent) {
			if (event.which == 2) {
				event.preventDefault();
				event.stopPropagation();
				return handler(event);
			}
		};
	}

	static rightClick (handler: (ev:Event)=>unknown) {
		return function (event: MouseEvent) {
			if (event.which == 3) {
				event.preventDefault();
				event.stopPropagation();
				return handler(event);
			}
		};
	}

	static initCustomJqueryFunctions() {
		if (!jQuery.fn.middleclick) {
			jQuery.fn.middleclick = function (handler) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				this.mousedown(HTMLTools.middleClick(handler));
			};
		}
		if (!jQuery.fn.rightclick) {
			jQuery.fn.rightclick = function (handler) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
				this.mousedown(HTMLTools.rightClick(handler));
			};
		}
	}

} // end of class

// Jquery Addons

HTMLTools.initCustomJqueryFunctions();

declare global{
	interface JQuery {
		middleclick( fn: (ev: Event)=> unknown): void;
		rightclick( fn: (ev: Event)=> unknown): void;
	}
}


type ChoiceBoxOptions<T> = {
	localize?: boolean;
	title ?: string;
	default?: keyof T;
}

export class CanceledDialgogError extends Error {

}


type HTMLGenerationOptions = object;

export type HTMLInputFieldDefinition<T extends string | number | boolean> =
	{
		label: string,
		disabled ?: boolean | (() => boolean)
		default ?: T;
		editingUsers ?: FoundryUser["id"][];
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
	choices: readonly T[];
	default?: T;
};

type StringChoiceFieldDef<T extends string> =
	{
	type: "string";
	choices: readonly T[];
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

export type HTMLDataInputDefinition = Record< string, HTMLInputFieldDefinition<string | number | boolean>>;

export type HTMLInputReturnType<T extends HTMLDataInputDefinition> = {
	[K in keyof T] : K extends string ? HTMLReturnField<T[K]> : never};


type HTMLReturnField<T extends HTMLInputFieldDefinition< string | number | boolean>> =
	"choices" extends keyof T
		? (
			T["choices"] extends readonly unknown[]
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


