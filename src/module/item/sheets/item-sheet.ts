import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { InvItem } from "../persona-item.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { EQUIP_SLOTS } from "../../../config/equip-slots.js";


export class PersonaItemSheet extends PersonaItemSheetBase {
	override item: InvItem;

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/item-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		const data = super.getData();
		data.EQUIP_SLOTS = EQUIP_SLOTS;

		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}

}

