import { RESIST_STRENGTHS } from "../../../config/damage-types.js";
import { PersonaActor } from "../persona-actor.js";
import { tarotDeck} from "../../../config/tarot.js";
import { DAMAGETYPES } from "../../../config/damage-types.js";
import { INCREMENTAL_ADVANCES } from "../../../config/incremental-advance-types.js";
import { INCREMENTAL_ADVANCE_TYPES } from "../../../config/incremental-advance-types.js";
import { STUDENT_SKILLS } from "../../../config/student-skills.js";

export abstract class PersonaActorSheetBase extends ActorSheet<PersonaActor> {

	override async getData() {
		const data= await super.getData();
		data.CONST = {
			STUDENT_SKILLS,

			TAROT  : tarotDeck,
			RESIST_STRENGTHS : RESIST_STRENGTHS,
			DAMAGETYPES : DAMAGETYPES,
			INC: INCREMENTAL_ADVANCE_TYPES.map(x=> ({
				local: INCREMENTAL_ADVANCES[x],
				varname: x,
				val: this.getIncAdvanceValue(x),
			}))
		};
		return data;


	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}


	getIncAdvanceValue(val: INCREMENTAL_ADVANCE_TYPES) {
		const actor = this.actor
		switch (actor.system.type) {
			case "npc":
				return false;
			default:
				return actor.system.combat.classData.incremental[val];
		}

	}


}
