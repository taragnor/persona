import { PersonaItem } from "./item/persona-item";
import { PersonaActor } from "./actor/persona-actor";

export class PersonaAE extends ActiveEffect<PersonaActor, PersonaItem> {


	static applyHook (actor: PersonaActor, change: AEChange, current: any, delta: any, changes: Record<string, any> ) {

	}

}

Hooks.on("applyActiveEffect", PersonaAE.applyHook);

