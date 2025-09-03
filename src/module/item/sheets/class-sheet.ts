import { DEFENSE_CATEGORY } from "../../../config/defense-categories.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaItem } from "../persona-item.js";
import {PERSONA_AFFINITIES} from "../../datamodel/character-class-dm.js";

export class PersonaClassSheet  extends PersonaItemSheetBase {
	declare item: Subtype<PersonaItem, "characterClass">;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/class-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override async getData() {
		const data=  await super.getData();
		 const CONST = {
				DEFENSE_CATEGORY,
				PERSONA_AFFINITIES,
		 } as const;
		 return {
				...data,
				CONST,
		 };
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}


}


