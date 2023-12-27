import { PersonaItem } from "../persona-item";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";

export class PersonaItemSheetBase extends ItemSheet<PersonaItem> {

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/item-sheet-base.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		return super.getData();
	}

	override activateListeners(html: HTMLElement) {
		super.activateListeners(html);

	}


}
