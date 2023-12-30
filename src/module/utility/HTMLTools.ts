
export class HTMLTools {
	static getClosestData ( eventOrJQObj: Event | JQuery<HTMLElement>, prop: string) {
		const target = ("currentTarget" in eventOrJQObj) ? (eventOrJQObj as Event).currentTarget : eventOrJQObj;
		if (!target) throw new Error("No target for event");
		const convert = function (str: string) {
			return Array.from(str).map(x => {
				if (x === x.toLowerCase()) return x;
				else return "-" + x.toLowerCase();
			}).join("");
		};
		if (prop === undefined)
			throw new Error("Property name is undefined");
		const cssprop = convert(prop);
		const data = $(target).closest(`[data-${cssprop}]`).data(prop);
		if (data != null) return data;
		else {
			throw new Error(`Couldn't find ${prop} property`);
		}
	}

	static convertForm(str: string) {
		return Array.from(str).map(x => {
			if (x === x.toLowerCase()) return x;
			else return "-" + x.toLowerCase();
		}).join("");
	}

	static async editItemWindow<T extends Item<any>>(item: T):  Promise<Option<T>> {
		item.sheet.render(true);
		return await new Promise ( (keep, _brk) => {
			const checker = () =>  {
				const isOpen = item.sheet._state != -1; //window state check
				if (isOpen)
					setTimeout( checker, 500);
				else
					keep(item);
			}
			setTimeout(checker, 1000);
		});
	}

// **************************************************
// *****************   Dialogs  ****************** *
// **************************************************

	static async confirmBox(title: string, text: string, defaultYes = false) {
		const templateData = {text};
		const html = await renderTemplate(`systems/${game.system.id}/module/tools/confirmation-dialog.hbs`, templateData);
		return await new Promise( (conf, _reject) => {
			Dialog.confirm({
				title,
				content: html,
				yes: conf.bind(null, true),
				no: conf.bind(null, false),
				defaultYes,
				close: () => {
					conf(false);
				},
			});
		});
	}

	static async ItemSelectionDialog<T extends (Actor<any, any> | Item<any>)> ( itemlist: T[], title= "Select One", list_of_properties = [])  {
		const revlist = itemlist.map ( x=> {
			return {
				id: x.id,
				description: x.system.description
			};
		} );
		return await this.singleChoiceBox( revlist, title);
	}

	static async singleChoiceBox< T extends unknown>( list: T[], headerText: string) {
		//List is in form of {id, data: [rows], description}
		const options = {};
		const templateData = {list};
		const html = await renderTemplate(`systems/${game.system.id}/module/tools/singleChoiceBox.hbs`, templateData);
		return await new Promise( (conf, _reject) => {
			const dialog = new Dialog({
				title: `${headerText}`,
				content: html,
				buttons: {
					one: {
						icon: `<i class="fas fa-check"></i>`,
						label: "Confirm",
						callback: (htm: string) => {
							let selection : string[] = [];
							$(htm).find(".single-choice-box").find("input:checked").each(function() {
								const v = $(this).val();
								if (v)
									selection.push(String(v));
							});
							if (selection.length  > 1) {
								throw new Error(`Problem with selection, Length is ${selection.length}`);
							}
							if (selection.length > 0) {
								conf(selection[0]);
							} else {
								conf(null);
							}
						}
					},
					two: {
						icon: `<i class="fas fa-times"></i>`,
						label: "Cancel",
						callback: () => conf(null)
					}
				},
				close: () => {
					conf(null);
				},
			}, options);
			dialog.render(true);
		});
	}

// **************************************************
// **************   EventHandlers  *************** *
// **************************************************

	static middleClick (handler: (ev: Event)=>any ) {
		return function (event: MouseEvent) {
			if (event.which == 2) {
				event.preventDefault();
				event.stopPropagation();
				return handler(event);
			}
		}
	}

	static rightClick (handler: (ev:Event)=>any) {
		return function (event: MouseEvent) {
			if (event.which == 3) {
				event.preventDefault();
				event.stopPropagation();
				return handler(event);
			}
		}
	}

	static initCustomJqueryFunctions() {
		if (!jQuery.fn.middleclick) {
			jQuery.fn.middleclick = function (handler) {
				this.mousedown(HTMLTools.middleClick(handler));
			}
		}
		if (!jQuery.fn.rightclick) {
			jQuery.fn.rightclick = function (handler) {
				this.mousedown(HTMLTools.rightClick(handler));
			}
		}
	}
} // end of class

// Jquery Addons

HTMLTools.initCustomJqueryFunctions();

declare global{
	interface JQuery<TElement = HTMLElement> {
		middleclick( fn: (ev: Event)=> any): void;
		rightclick( fn: (ev: Event)=> any): void;
	}
}


