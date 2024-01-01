import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { SLOTTYPES } from "../../../config/slot-types.js";
import { POWERTYPES } from "../../../config/effect-types.js";
import { PRECONDITIONTYPES } from "../../../config/effect-types.js";
import { CONSQUENCETYPES } from "../../../config/effect-types.js";
import { PersonaItem } from "../persona-item.js";
import { HTMLTools } from "../../utility/HTMLTools.js";

export class PersonaPowerSheet  extends PersonaItemSheetBase {
	override item: Subtype<PersonaItem, "power">;

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/power-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		const data = super.getData();
		data.POWERTYPES = POWERTYPES;
		data.SLOTTYPES = SLOTTYPES;
		data.PRECONDITIONTYPES= PRECONDITIONTYPES;
		data.CONSTYPES= CONSQUENCETYPES;
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".addPowerEffect").on("click", this.addPowerEffect.bind(this));
		html.find(".addCondition").on("click", this.addPrecondition.bind(this));
		html.find(".addConsequence").on("click", this.addConsequence.bind(this));
	}

	async addPowerEffect() {
		await this.item.addNewPowerEffect();
	}

	async addPrecondition(event: Event) {
		const index= Number(HTMLTools.getClosestData(event, "effectIndex"));
		await this.item.addNewPowerPrecondition(index);
	}

	async addConsequence(event: Event) {
		const index= Number(HTMLTools.getClosestData(event, "effectIndex"));
		await this.item.addNewPowerConsequence(index);
	}

}

