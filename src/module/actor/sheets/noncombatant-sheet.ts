import { PersonaActorSheetBase } from "./actor-sheet.base.js";

export class NoncombatantSheet extends PersonaActorSheetBase {
	declare actor: NPC | Tarot;

	override getData() {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}


}

