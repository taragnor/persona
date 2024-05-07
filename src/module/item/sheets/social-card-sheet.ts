import { SocialCard } from "../persona-item.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";

const PRIMARY_SECONDARY = {
	"primary": "persona.term.primary",
	"secondary": "persona.term.secondary",
};

export class PersonaSocialCardSheet extends PersonaItemSheetBase {
	override item: SocialCard;

	override async getData() {
		const data = await super.getData();
		data.PRIMARY_SECONDARY = PRIMARY_SECONDARY;
		return data;
	}

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/social-card-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"}]
		});
	}

}
