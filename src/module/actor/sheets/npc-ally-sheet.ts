import { PersonaItem } from "../../item/persona-item.js";
import { NPCAlly } from "../persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PCLikeSheet } from "./pc-like-sheet.js";
import { Power } from "../../item/persona-item.js";

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

	override async _onDropItem(_event: Event, itemD: unknown, ..._rest:any[]) {
		//@ts-ignore
		const item: PersonaItem = await Item.implementation.fromDropData(itemD);
		switch (item.system.type) {
			case "power": {
				const power = item as Power;
				const actor = this.actor as NPCAlly;
				if (power.isNavigator()) {
					await actor.setNavigatorSkill(power);
					return power;
				}
			}
		}
		return super._onDropItem(_event, itemD);
	}
}
