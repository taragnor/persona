import { PersonaDB } from "../../persona-db.js";
import { PersonaError } from "../../persona-error.js";
import { PersonaActorSheetBase } from "./actor-sheet.base.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { NPC } from "../persona-actor.js";
import { Tarot } from "../persona-actor.js";

export class NoncombatantSheet extends PersonaActorSheetBase {
	override actor: NPC | Tarot;

	override getData() {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".delFocus").on("click", this.deleteFocus.bind(this));
		html.find(".addFocus").on("click", this.onAddFocus.bind(this));
		html.find(".focusName").on("click", this.openFocus.bind(this));
	}

	async deleteFocus(event: Event) {
		const focusId = HTMLTools.getClosestData(event, "focusId");
		if (focusId == undefined) {
			const err = `Can't find talent at index $focusId}`;
			throw new PersonaError(err);
		}
		if (await HTMLTools.confirmBox("Confirm Delete", "Are you sure you want to delete this Focus?")) {
			this.actor.deleteFocus(focusId);
		}
	}

	async onAddFocus(_ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Social Link Benefit",
			type: "focus",
		}]);
	}

	async openFocus(event: Event) {
		const itemType = "Focus";
		const focusId = HTMLTools.getClosestData(event, "focusId");
		if (focusId == undefined) {
			throw new PersonaError(`Can't find ${itemType}`);
		}
		const focus = this.actor.focii
			.find(x=> x.id == focusId)
			?? PersonaDB.tarotCards().find(x=> x.items.find(x=> x.id == focusId))
				?.items.find(x=> x.id == focusId) ;
		if (!focus) {
			throw new PersonaError(`Can't find ${itemType} id ${focusId}`);
		}
		await focus.sheet.render(true);
	}

}

