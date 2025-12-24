import { PersonaItem} from "../item/persona-item.js";
import {PersonaDB} from "../persona-db.js";
import {HTMLTools} from "../utility/HTMLTools.js";

export class TagPrinter  extends Application {

	static _instances : Map<Tag["system"]["tagType"], TagPrinter> = new Map();

	tagType: Tag["system"]["tagType"];

	constructor (tagType: Tag["system"]["tagType"]) {
		super();
		this.tagType= tagType;
	}

	static init() {
		this._instances = new Map();
	}

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "tag-list-printer",
			template: "systems/persona/sheets/lists/tag-printout.hbs",
			width: 1000,
			height: 1200,
			minimizable: true,
			resizable: true,
			title: game.i18n.localize("persona.applications.talentPrinter"),
		});
	}

	static async open(tagType: Tag["system"]["tagType"]) {
		await PersonaDB.waitUntilLoaded();
		let instance = this._instances.get(tagType);
		if (!instance) {
			instance = new TagPrinter(tagType);
			this._instances.set(tagType, instance);
		}
		instance.render(true);
		return instance;
	}

	override async getData(options: Record<string, unknown>) {
		await PersonaDB.waitUntilLoaded();
		const data = await super.getData(options);
		data["tagList"]= PersonaDB.tagsArr()
			.filter (tag => tag.system.tagType == this.tagType && !tag.system.hidden)
		.sort( (a,b) => a.displayedName.localeCompare(b.displayedName));
		return data;
	}

	override activateListeners(html: JQuery) {
		super.activateListeners(html);
		html.find(".tag-list .tag").on ("click", (ev) => this.openTag(ev));
	}

	openTag(event: JQuery.ClickEvent) {
		const tagId = HTMLTools.getClosestData(event, "tagId");
		const talent = PersonaDB.getItemById(tagId);
		if (!talent) {
			throw new Error(`Can't find Tag ${tagId}`);
		}
		void talent.sheet.render(true);
	}

}

Hooks.on("updateItem", function (item: PersonaItem ) {
	if (!item.isTag())  {return;}
	const instance = TagPrinter._instances.get(item.system.tagType);
	if (!instance) {return;}
	instance.render(false);
});

//@ts-expect-error adding to global
window.TagPrinter = TagPrinter;

