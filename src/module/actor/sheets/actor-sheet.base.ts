import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaEffectContainerBaseSheet } from "../../item/sheets/effect-container.js";
import { ConditionalEffectManager } from "../../conditional-effect-manager.js";
import { DEFENSE_CATEGORY } from "../../../config/defense-categories.js";
import { RESIST_STRENGTHS } from "../../../config/damage-types.js";
import { PersonaActor } from "../persona-actor.js";
import { TAROT_DECK } from "../../../config/tarot.js";
import { DAMAGETYPES } from "../../../config/damage-types.js";
import { INCREMENTAL_ADVANCES } from "../../../config/incremental-advance-types.js";
import { INCREMENTAL_ADVANCE_TYPES } from "../../../config/incremental-advance-types.js";
import { STUDENT_SKILLS } from "../../../config/student-skills.js";
import { AVAILABILITY } from "../../../config/availability-types.js";
import { PersonaDB } from "../../persona-db.js";
import { DAYS } from "../../../config/days.js";

export abstract class PersonaActorSheetBase extends ActorSheet<PersonaActor> {

	override async getData() {
		const data= await super.getData();
		await PersonaDB.waitUntilLoaded();
		data.RELATIONSHIP_TYPES_LIST = PersonaDB.allSocialCards()
			.flatMap(card => card.system.qualifiers)
			.map(qual=> qual.relationshipName)
			.filter( (val, i, arr) => arr.indexOf(val) == i);
		data.RELATIONSHIP_TYPES = Object.fromEntries(
			(data.RELATIONSHIP_TYPES_LIST as string[])
			.map(x=> ([x,x]))
		);
		data.POWERSTUFF = PersonaEffectContainerBaseSheet.powerStuff;

		data.CONST = {
			...PersonaActorSheetBase.CONST(),
			INC: INCREMENTAL_ADVANCE_TYPES.map(x=> ({
				local: INCREMENTAL_ADVANCES[x],
				varname: x,
				val: this.getIncAdvanceValue(x),
			}))
		};
		return data;
	}

	static CONST() {
		return {
			DAYS,
			STUDENT_SKILLS,
			AVAILABILITY,
			DEFENSE_CATEGORY,
			TAROT  : TAROT_DECK,
			RESIST_STRENGTHS : RESIST_STRENGTHS,
			DAMAGETYPES : DAMAGETYPES,
		} as const;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		ConditionalEffectManager.applyHandlers(html, this.actor);
		html.find(".creatureTags .delTag").on("click", this.deleteCreatureTag.bind(this));
		html.find('.addCreatureTag').on("click", this.onAddCreatureTag.bind(this));
	}

	async onAddCreatureTag( _ev: JQuery.ClickEvent) {
		await this.actor.addCreatureTag();
	}

	async deleteCreatureTag(ev: JQuery.ClickEvent) {
		const index = HTMLTools.getClosestData(ev, "tagIndex");
		await this.actor.deleteCreatureTag(Number(index));

	}


	getIncAdvanceValue(val: INCREMENTAL_ADVANCE_TYPES) {
		const actor = this.actor
		switch (actor.system.type) {
			case "npc":
			case "tarot":
				return false;
			default:
				return actor.system.combat.classData.incremental[val];
		}
	}

}
