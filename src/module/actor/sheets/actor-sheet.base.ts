import { PersonaActor } from "../persona-actor.js";
import { tarotDeck} from "../../../config/tarot.js";

export abstract class PersonaActorSheetBase extends ActorSheet<PersonaActor> {

	override getData() {
		const data= super.getData();
		data.TAROT  = tarotDeck;
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