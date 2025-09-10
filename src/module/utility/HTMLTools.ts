
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
		const html = await renderTemplate(`systems/${game.system.id}/module/utility/singleChoiceBox.hbs`, {choices, localize, defaultChoice});
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
