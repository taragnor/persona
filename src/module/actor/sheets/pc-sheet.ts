import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { CombatantSheetBase } from "./combatant-sheet.js";
import { PersonaActor } from "../persona-actor.js";
import { PersonaSocial } from "../../social/persona-social.js";
import { SocialStat } from "../../../config/student-skills.js";
import { STUDENT_SKILLS_LIST } from "../../../config/student-skills.js";

export class PCSheet extends CombatantSheetBase {
	override actor: Subtype<PersonaActor, "pc">;
	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/pc-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"}]
		});
	}

	override getData() {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		for (const stat of STUDENT_SKILLS_LIST) {
			html.find(`.${stat} .roll-icon`).on("click", this.rollSocial.bind(this, stat));
		}
		super.activateListeners(html);
	}

	async rollSocial (socialStat: SocialStat) {
		PersonaSocial.rollSocialStat(this.actor, socialStat);
	}

}
