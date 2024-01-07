import { RESIST_STRENGTHS } from "../../../config/damage-types.js";
import { PersonaActor } from "../persona-actor.js";
import { tarotDeck} from "../../../config/tarot.js";
import { DAMAGETYPES } from "../../../config/damage-types.js";

export abstract class PersonaActorSheetBase extends ActorSheet<PersonaActor> {

	override getData() {
		const data= super.getData();
		data.CONST = {
			TAROT  : tarotDeck,
			RESIST_STRENGTHS : RESIST_STRENGTHS,
			DAMAGETYPES : DAMAGETYPES,
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


}
