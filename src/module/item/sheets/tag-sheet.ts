import {CREATURE_TAGS} from "../../../config/creature-tags.js";
import {EQUIPMENT_TAGS} from "../../../config/equipment-tags.js";
import {HBS_TEMPLATES_DIR} from "../../../config/persona-settings.js";
import {POWER_TAGS} from "../../../config/power-tags.js";
import {ROLL_TAGS_AND_CARD_TAGS} from "../../../config/roll-tags.js";
import {SHADOW_ROLE} from "../../../config/shadow-types.js";
import {TAG_TYPES} from "../../../config/tags-general.js";
import {Tag} from "../persona-item.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

export class PersonaTagSheet extends PersonaEffectContainerBaseSheet {
	declare item: Tag;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/tag-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override async getData() {
		let data = await super.getData();
		data = {
			...data,
			TAG_TYPES: {
				"": "-",
				...TAG_TYPES,
			},
			EQUIPMENT_TAGS : {
				"": "-",
				...EQUIPMENT_TAGS,
			},
			POWER_TAGS :{
				"": "-",
				...POWER_TAGS,
			},
			CREATURE_TAGS :{
				"": "-",
				...CREATURE_TAGS,
			},
			ROLL_TAGS_AND_CARD_TAGS:  {
				// "": "-",
				...ROLL_TAGS_AND_CARD_TAGS,
			} ,
			SHADOW_ROLE: {
				"": "-",
				...SHADOW_ROLE,
			},
		};

		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}
}
