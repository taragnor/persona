import { RESIST_STRENGTHS } from "../../../config/damage-types.js";
import { PersonaActor } from "../persona-actor.js";
import { tarotDeck} from "../../../config/tarot.js";
import { DAMAGETYPES } from "../../../config/damage-types.js";
import { INCREMENTAL_ADVANCES } from "../../../config/incremental-advance-types.js";
import { INCREMENTAL_ADVANCE_TYPES } from "../../../config/incremental-advance-types.js";

export abstract class PersonaActorSheetBase extends ActorSheet<PersonaActor> {

	override getData() {
		const data= super.getData();
		data.CONST = {
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
		html.find(".addItem").on("click", this.#addItem.bind(this));
	}

	#addItem(_ev: JQuery<Event>) {
		this.actor.createNewItem();
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
