
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { ModifierContainer } from "../persona-item.js";
import { PRECONDITIONTYPES } from "../../../config/effect-types.js";
import { MODIFIERS_TABLE } from "../../../config/item-modifiers.js";

export abstract class PersonaModifierContainerBaseSheet extends PersonaItemSheetBase {
	override item: ModifierContainer;

	override async getData() {
		await this.item.sanitizeModifiersData();//required becuase foundry input hates arrays;
		const data = await super.getData();
		data.MODSTUFF = {
			PRECONDITIONTYPES: PRECONDITIONTYPES,
			MODIFIERTYPES: MODIFIERS_TABLE,

		}
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}

}
