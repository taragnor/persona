import { PersonaActor } from "../persona-actor";
import { TEMPLATESDIR } from "../../../config/persona-settings";

export class NPCSheet extends ActorSheet<PersonaActor> {

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${TEMPLATESDIR}/npc-sheet.hbs`,
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

