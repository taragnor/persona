import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";

export class PersonaPowerSheet  extends PersonaItemSheetBase {
	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/power-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}

}

