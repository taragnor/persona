import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { Power } from "../persona-item.js";
import { SLOTTYPES } from "../../../config/slot-types.js";

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
		const data = super.getData();
		const POWERTYPES : Record<Power["system"]["subtype"], string> = Object.fromEntries(
			[ "weapon", "magic", "other", "none"]
			.map( x=> [x, `persona.power.subtype.${x}`])
		);
		data.POWERTYPES = POWERTYPES;
		data.SLOTTYPES = SLOTTYPES;
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}

}

