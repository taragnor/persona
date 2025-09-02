import { STUDENT_SKILLS } from "../../../config/student-skills.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { AVAILABILITY } from "../../../config/availability-types.js";
import { PersonaDB } from "../../persona-db.js";
import { DAYS } from "../../../config/days.js";
import { SOCIAL_CARD_TYPES } from "../../../config/social-card-config.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

export class PersonaJobSheet extends PersonaItemSheetBase {
	// declare item: Job;

	override async getData() {
		const data = await super.getData();
		data.CONST = {
			DAYS
		};
		data.SOCIAL_CARD_TYPES = SOCIAL_CARD_TYPES;
		data.STUDENT_SKILLS = STUDENT_SKILLS;
		data.AVAILABILITY = AVAILABILITY;
		data.RELATIONSHIP_TYPES_LIST = PersonaDB.allSocialCards()
			.flatMap(card => card.system.qualifiers)
			.map(qual=> qual.relationshipName)
			.filter( (val, i, arr) => arr.indexOf(val) == i);
		data.RELATIONSHIP_TYPES = Object.fromEntries(
			(data.RELATIONSHIP_TYPES_LIST as string[])
			.map(x=> ([x,x]))
		);
		return data;
	}


	override activateListeners(html : JQuery<HTMLElement>) {
		super.activateListeners(html);
	}

	get powerStuff() {
		const data = PersonaEffectContainerBaseSheet.powerStuff;
		return data;
	}

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/job-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"}]
		});
	}


}

