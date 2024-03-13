import { PersonaError } from "../../persona-error.js";
import { PersonaActor } from "../persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaActorSheetBase } from "./actor-sheet.base.js";
import { HTMLTools } from "../../utility/HTMLTools.js";

export class NPCSheet extends PersonaActorSheetBase {
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
		const focus = this.actor.focii.find(x=> x.id == focusId);
		if (!focus) {
			throw new PersonaError(`Can't find ${itemType} id ${focusId}`);
		}
		await focus.sheet.render(true);
	}


}

