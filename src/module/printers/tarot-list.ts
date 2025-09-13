import {PersonaItem} from "../item/persona-item.js";
import {PersonaDB} from "../persona-db.js";
import {HTMLTools} from "../utility/HTMLTools.js";

export class TarotPrinter extends Application {
	static _instance : U<TarotPrinter>;

	static init() {

	}

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "tarot-list-printer",
			template: "systems/persona/sheets/lists/tarot-printout.hbs",
			width: 1000,
			height: 1200,
			minimizable: true,
			resizable: true,
			title: game.i18n.localize("persona.applications.tarotPrinter"),
		});
	}

	static async open() {
		await PersonaDB.waitUntilLoaded();
		if (!this._instance) {
			this._instance = new TarotPrinter();
		}
		this._instance.render(true);

		return this._instance;
	}

	override async getData(options: Record<string, unknown>) {
		await PersonaDB.waitUntilLoaded();
		const data = await super.getData(options);
		const tarot = PersonaDB.tarotCards();
		data["tarotDeck"] = tarot;
		return data;
	}

	override activateListeners(html: JQuery) {
		super.activateListeners(html);
		html.find(".focus-name").on("click", (ev) => this.openFocus(ev));
	}

	openFocus(event: JQuery.ClickEvent) : void {
		const tarotId = HTMLTools.getClosestData(event, "tarotId");
		const focusId = HTMLTools.getClosestData(event, "focusId");
		const tarot = PersonaDB.getActorById(tarotId)!;
		const focus = tarot.items.find(f => f.id == focusId);
		if (focus) {
			void focus.sheet.render(true);
		}
	}

}

Hooks.on("updateItem", function (item: PersonaItem ) {
	const instance = TarotPrinter._instance;
	if (instance && item?.parent?.type == "tarot")  {
		instance.render(true);
	}

});


Hooks.on("DBrefresh", function () {
	const instance = TarotPrinter._instance;
	if (instance && instance._state >= 2) {
		instance.render(true);
	}
});


//@ts-expect-error adding to global
window.TarotPrinter = TarotPrinter;
