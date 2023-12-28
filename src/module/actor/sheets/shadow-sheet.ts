import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaActorSheetBase } from "./actor-sheet.base.js";

export class ShadowSheet extends PersonaActorSheetBase {

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/shadow-sheet.hbs`,
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

