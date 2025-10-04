import {PersonaItem} from "../item/persona-item.js";
import {PersonaDB} from "../persona-db.js";
import {HTMLTools} from "../utility/HTMLTools.js";

export class TalentPrinter extends Application {
	static _instance : U<TalentPrinter>;

	static init() {

	}

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "talent-list-printer",
			template: "systems/persona/sheets/lists/talent-printout.hbs",
			width: 1000,
			height: 1200,
			minimizable: true,
			resizable: true,
			title: game.i18n.localize("persona.applications.talentPrinter"),
		});
	}

	static async open() {
		await PersonaDB.waitUntilLoaded();
		if (!this._instance) {
			this._instance = new TalentPrinter();
		}
		this._instance.render(true);
		return this._instance;
	}

	override async getData(options: Record<string, unknown>) {
		await PersonaDB.waitUntilLoaded();
		const data = await super.getData(options);
		data["talentList"]= PersonaDB.allTalents()
			.filter (talent => !talent.system.hideOnList
				&& !talent.system.shadowOnly
			);
		return data;
	}

	override activateListeners(html: JQuery) {
		super.activateListeners(html);
		html.find(".talent-list .talent").on ("click", (ev) => this.openTalent(ev));
	}

	openTalent(event: JQuery.ClickEvent) {
		const talentId = HTMLTools.getClosestData(event, "talentId");
		const talent = PersonaDB.getItemById(talentId);
		if (!talent) {
			throw new Error(`Can't find Talent ${talentId}`);
		}
		void talent.sheet.render(true);
	}

	}

Hooks.on("updateItem", function (item: PersonaItem ) {
	const instance = TalentPrinter._instance;
	if (instance && item.isTalent())  {
		instance.render(true);
	}
});

//@ts-expect-error adding to global
window.TalentPrinter = TalentPrinter;

