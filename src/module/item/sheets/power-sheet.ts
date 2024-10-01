import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { Power } from "../persona-item.js";
import { PersonaPowerLikeBaseSheet } from "./powerlike-base-sheet.js";

export class PersonaPowerSheet extends PersonaPowerLikeBaseSheet {
	declare item: Power;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/power-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		const data = super.getData();
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}


}

