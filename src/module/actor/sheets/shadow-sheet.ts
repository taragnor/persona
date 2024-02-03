import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaActor } from "../persona-actor.js";
import { CombatantSheetBase } from "./combatant-sheet.js";

export class ShadowSheet extends CombatantSheetBase {
	override actor: Subtype<PersonaActor, "shadow">;

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/shadow-sheet.hbs`,
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
		html.find('.addShadowPower').on("click", this.onAddPower.bind(this));
		html.find('.addShadowFocus').on("click", this.onAddFocus.bind(this));

	}

	async onAddPower( _ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Power",
			type: "power",
		}]);
	}

	async onAddFocus(_ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Focus",
			type: "focus",
		}]);
	}

}

