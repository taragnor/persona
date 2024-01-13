import { PersonaItem } from "./item/persona-item";
import { PersonaActor } from "./actor/persona-actor";

export class PersonaAE extends ActiveEffect<PersonaActor, PersonaItem> {


	static applyHook (actor: PersonaActor, change: AEChange, current: any, delta: any, changes: Record<string, any> ) {

		//*changes object is a record of valeus taht may get changed by applying the AE;
		// example: changes["system.hp"] = 25

	}

}

Hooks.on("applyActiveEffect", PersonaAE.applyHook);


CONFIG.ActiveEffect.legacyTransferral = false;
