import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { Focus } from "../persona-item.js";

export class PersonaFocusSheet extends PersonaItemSheetBase {
	override item: Focus;

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/focus-sheet.hbs`,
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


