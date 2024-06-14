import { RESIST_STRENGTHS } from "../../../config/damage-types.js";
import { TAROT_DECK } from "../../../config/tarot.js";
import { SLOT_TYPES_EXPANDED } from "../../../config/slot-types.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { PowerContainer } from "../persona-item.js";
import { SLOTTYPES } from "../../../config/slot-types.js";
import { POWERTYPES } from "../../../config/effect-types.js";
import { PRECONDITIONTYPES } from "../../../config/precondition-types.js";
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
import { CONDITION_TARGETS } from "../../../config/precondition-types.js";
import { NUMERIC_COMPARISON_TARGET } from "../../../config/precondition-types.js";
import { BOOLEAN_COMPARISON_TARGET } from "../../../config/precondition-types.js";
import { COMPARATORS } from "../../../config/precondition-types.js";
import { SocialCard } from "../persona-item.js";

export abstract class PersonaEffectContainerBaseSheet extends PersonaItemSheetBase {
	override item: PowerContainer | SocialCard;
	_powerStuffBase?: Record<string, any>;

	override async getData() {
		if (this.item.isOwner && this.item.type != "socialCard") {
			await (this.item as PowerContainer).sanitizeEffectsData();//required becuase foundry input hates arrays;
		}
		const data = await super.getData();
		const SOCIAL_LINKS = Object.fromEntries(
			PersonaDB.socialLinks().map(actor => [actor.id, actor.name])
		);
		SOCIAL_LINKS[""] = "-";
		data.POWERSTUFF = this.powerStuff;
		return data;
	}

	get powerStuffBase() :Record<string, any> {
		if (this._powerStuffBase)  {
			return this._powerStuffBase;
		}
		this._powerStuffBase = {
			TAROT_DECK,
			NUMERIC_COMPARISON_TARGET,
			BOOLEAN_COMPARISON_TARGET,
			RESIST_STRENGTHS,
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
		};
		return this._powerStuffBase;
	}


	get powerStuff(): Record<string, any> {
		const SOCIAL_LINKS = Object.fromEntries(
			PersonaDB.socialLinks().map(actor => [actor.id, actor.name])
		);
		SOCIAL_LINKS[""] = "-";
		return {
			...this.powerStuffBase,
			SOCIAL_LINKS,
			COMPENDIUM_POWERS: Object.fromEntries(
				PersonaDB.allPowers()
				.sort((a,b) => a.name.localeCompare(b.name))
				.map(pwr=> ([pwr.id, pwr.name]))
			),
		};
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
		if (this.item.system.type != "socialCard") {
			await (this.item as PowerContainer).addNewPowerEffect();
		}
	}

	async addPrecondition(event: Event) {
		const index= Number(HTMLTools.getClosestData(event, "effectIndex"));
		if (this.item.system.type != "socialCard") {
		await (this.item as PowerContainer).addNewPowerPrecondition(index);
	}

	async addConsequence(event: Event) {
		const index= Number(HTMLTools.getClosestData(event, "effectIndex"));
		await this.item.addNewPowerConsequence(index);
	}


	async deletePowerEffect(ev: Event) {
		const index = Number(HTMLTools.getClosestData(ev, "effectIndex"));
		this.item.deletePowerEffect(index);
	}

	async deleteConsequence(ev: Event) {
		const effindex = Number(HTMLTools.getClosestData(ev, "effectIndex"));
		const conindex = HTMLTools.getClosestData(ev,
			"consequenceIndex");
		this.item.deletePowerConsequence(effindex, Number(conindex));
	}

	async deletePrecondition(ev: Event) {
		const effIndex = HTMLTools.getClosestData(ev, "effectIndex");
		const condIndex = HTMLTools.getClosestData(ev,
			"preconditionIndex");
		this.item.deletePowerPrecondition(Number(effIndex), Number(condIndex));

	}


}
