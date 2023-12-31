import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { SLOTTYPES } from "../../../config/slot-types.js";
import { POWERTYPES } from "../../../config/effect-types.js";
import { PRECONDITIONTYPES } from "../../../config/effect-types.js";
import { CONSQUENCETYPES } from "../../../config/effect-types.js";
import { PowerContainer } from "../persona-item.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { DAMAGETYPES } from "../../../config/damage-types.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../../../config/status-effects.js";
import { STATUS_EFFECT_DURATIONS } from "../../../config/status-effects.js";
import { TARGETING } from "../../../config/effect-types.js";

export abstract class PersonaPowerLikeBaseSheet extends PersonaItemSheetBase {
	override item: PowerContainer;

	override getData() {
		const data = super.getData();
		data.POWERSTUFF = {
			POWERTYPES : POWERTYPES,
			SLOTTYPES : SLOTTYPES,
			PRECONDITIONTYPES: PRECONDITIONTYPES,
			CONSTYPES: CONSQUENCETYPES,
			DAMAGETYPES : DAMAGETYPES,
			STATUSEFFECTS: STATUS_EFFECT_TRANSLATION_TABLE,
			STATUSDURATIONS : STATUS_EFFECT_DURATIONS,
			TARGETING : TARGETING,
		}
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".addPowerEffect").on("click", this.addPowerEffect.bind(this));
		html.find(".addCondition").on("click", this.addPrecondition.bind(this));
		html.find(".addConsequence").on("click", this.addConsequence.bind(this));
		html.find(".delConsequence").on("click", this.deleteConsequence.bind(this));
		html.find(".delCondition").on("click", this.deletePrecondition.bind(this));
		html.find(".delEffect").on("click", this.deletePowerEffect.bind(this));
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

	async deletePowerEffect(ev: Event) {
		const index = HTMLTools.getClosestData(ev, "effectIndex");
		this.item.deletePowerEffect(index);
	}

	async deleteConsequence(ev: Event) {
		const index = HTMLTools.getClosestData(ev,
			"consequenceIndex");
		this.item.deletePowerConsequence(index);
	}

	async deletePrecondition(ev: Event) {
		const index = HTMLTools.getClosestData(ev,
			"preconditionIndex");
		this.item.deletePowerPrecondition(index);

	}

}


