import { SLOT_TYPES_EXPANDED } from "../../../config/slot-types.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { PowerContainer } from "../persona-item.js";
import { SLOTTYPES } from "../../../config/slot-types.js";
import { POWERTYPES } from "../../../config/effect-types.js";
import { PRECONDITIONTYPES } from "../../../config/effect-types.js";
import { CONSQUENCETYPES } from "../../../config/effect-types.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { DAMAGETYPES } from "../../../config/damage-types.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../../../config/status-effects.js";
import { STATUS_EFFECT_DURATIONS } from "../../../config/status-effects.js";
import { TARGETING } from "../../../config/effect-types.js";
import { POWER_TAGS } from "../../../config/power-tags.js";
import { MODIFIERS_TABLE } from "../../../config/item-modifiers.js";
import { DEFENSECHOICES } from "../../datamodel/power-dm.js";
import { SHADOW_CHARGE_REQ } from "../../../config/effect-types.js";
import { PersonaDB } from "../../persona-db.js";
import { TRIGGERS } from "../../../config/triggers.js";
import { OTHER_CONSEQUENCES } from "../../datamodel/other-effects.js";
import { CONDITION_TARGETS } from "../../preconditions.js";
import { COMPARISON_TARGET } from "../../preconditions.js";
import { COMPARATORS } from "../../preconditions.js";

export abstract class PersonaEffectContainerBaseSheet extends PersonaItemSheetBase {
	override item: PowerContainer;

	override async getData() {
		if (this.item.isOwner) {
			await this.item.sanitizeEffectsData();//required becuase foundry input hates arrays;
		}
		const data = await super.getData();
		data.POWERSTUFF = {
			COMPARISON_TARGET: COMPARISON_TARGET,
			COMPARATORS,
			CONDITION_TARGETS,
			OTHER_CONSEQUENCES : OTHER_CONSEQUENCES,
			TRIGGERS: TRIGGERS,
			POWERTYPES : POWERTYPES,
			SLOTTYPES : SLOTTYPES,
			PRECONDITIONTYPES: PRECONDITIONTYPES,
			CONSTYPES: CONSQUENCETYPES,
			DAMAGETYPES : DAMAGETYPES,
			STATUSEFFECTS: STATUS_EFFECT_TRANSLATION_TABLE,
			STATUSDURATIONS : STATUS_EFFECT_DURATIONS,
			TARGETING : TARGETING,
			TAGS: POWER_TAGS,
			MODIFIER_TARGETS: MODIFIERS_TABLE,
			DEFENSES: Object.fromEntries(DEFENSECHOICES.map( x=> [x, x])),
			SHADOW_CHARGE_REQ: SHADOW_CHARGE_REQ,
			SLOT_TYPES_EXPANDED: SLOT_TYPES_EXPANDED,
			COMPENDIUM_POWERS: Object.fromEntries(
				PersonaDB.allPowers()
				.sort((a,b) => a.name.localeCompare(b.name))
				.map(pwr=> ([pwr.id, pwr.name]))
			),
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
		const effindex = HTMLTools.getClosestData(ev, "effectIndex");
		const conindex = HTMLTools.getClosestData(ev,
			"consequenceIndex");
		this.item.deletePowerConsequence(effindex, conindex);
	}

	async deletePrecondition(ev: Event) {
		const effIndex = HTMLTools.getClosestData(ev, "effectIndex");
		const condIndex = HTMLTools.getClosestData(ev,
			"preconditionIndex");
		this.item.deletePowerPrecondition(effIndex, condIndex);

	}


}
