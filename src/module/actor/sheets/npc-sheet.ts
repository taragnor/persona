import { PersonaActor } from "../persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { NoncombatantSheet } from "./noncombatant-sheet.js";
import { PersonaDB } from "../../persona-db.js";

export class NPCSheet extends NoncombatantSheet  {
	override actor: Subtype<PersonaActor, "npc">;

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/npc-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override async getData() {
		const data= await super.getData();
		data.RELATIONSHIP_TYPES = PersonaDB.allSocialCards()
			.flatMap(card => card.system.qualifiers)
			.map(qual=> qual.relationshipName)
			.filter( (val, i, arr) => arr.indexOf(val) == i);
		return data;

	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}



}

