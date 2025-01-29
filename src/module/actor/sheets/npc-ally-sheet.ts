import { NPCAlly } from "../persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PCLikeSheet } from "./pc-like-sheet.js";

export class NPCAllySheet extends PCLikeSheet {

	declare actor: NPCAlly;
	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/npc-ally-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"}]
		});
	}

	override activateListeners(html: JQuery) {
		super.activateListeners(html);
	}

}
