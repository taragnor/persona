import { Job } from "../persona-item.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { STUDENT_SKILLS } from "../../../config/student-skills.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { AVAILABILITY } from "../../../config/availability-types.js";

export class PersonaJobSheet extends PersonaItemSheetBase {
	override item: Job;

	override async getData() {
		const data = await super.getData();
		data.STUDENT_SKILLS = STUDENT_SKILLS;
		data.AVAILABILITY = AVAILABILITY;
		return data;
	}

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/job-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"}]
		});
	}


}

