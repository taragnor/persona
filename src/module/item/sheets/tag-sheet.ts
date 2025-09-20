import {HBS_TEMPLATES_DIR} from "../../../config/persona-settings.js";
import {Tag} from "../persona-item.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

export class PersonaTagSheet extends PersonaEffectContainerBaseSheet {
	declare item: Tag;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/tag-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override async getData() {
		const data = await super.getData();
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}
}
