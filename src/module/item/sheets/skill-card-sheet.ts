import {HBS_TEMPLATES_DIR} from "../../../config/persona-settings.js";
import {PersonaDB} from "../../persona-db.js";
import {PersonaItemSheetBase} from "./base-item-sheet.js";

export class PersonaCardSheet extends PersonaItemSheetBase {
	declare item: CardItem;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/skill-card-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override async getData() {
		const data = await super.getData();
    let grantedThing : U<Power | Shadow>;
    if (this.item.isSkillCard()) {
      grantedThing = PersonaDB.getPower(this.item.system.skillId);
    }
    if (this.item.isPersonaCard()) {
      grantedThing = PersonaDB.getActor(this.item.system.skillId) as Shadow;
    }
    data["grantedThing"] = grantedThing;
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}

}
