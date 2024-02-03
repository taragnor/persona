import { PersonaItem } from "./item/persona-item.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaError } from "./persona-error.js";
import { StatusDuration } from "../config/status-effects.js";

export class PersonaAE extends ActiveEffect<PersonaActor, PersonaItem> {

	static async applyHook (actor: PersonaActor, change: AEChange, current: any, delta: any, changes: Record<string, any> ) {
		//*changes object is a record of valeus taht may get changed by applying the AE;
		// example: changes["system.hp"] = 25
	}

	get potency(): number {
		try {
			const potency = Number(this.getFlag<string>("persona", "potency"));
			return potency ?? 0;
		} catch (e) {
			PersonaError.softFail("Can't convert Potency for status");
			return 0;
		}
	}

	get statusDuration() : StatusDuration {
		const potency = this.getFlag<string>("persona", "duration") as StatusDuration;
		return potency;
	}

	async setPotency(potency: number) : Promise<void> {
		await this.setFlag("persona", "potency", potency);
	}

	async setDuration(duration: StatusDuration) : Promise<void> {
		await this.setFlag("persona", "potency", duration);
	}

	durationLessThan(x : StatusDuration): boolean {
		return  PersonaAE.getStatusValue(this.statusDuration) < PersonaAE.getStatusValue(x);
	}

	static getStatusValue (duration : StatusDuration) : number {
		switch (duration) {
			case "expedition":
				return 10;
			case "combat":
				return 9;
			case "save-hard":
				return 6;
			case "save-normal":
				return 5;
			case "save-easy":
				return 4;
			case "UEoNT":
				return 3;
			case "USoNT":
				return 2;
			case "instant":
				return 1;
			default:
				duration satisfies never;
				throw new PersonaError(`Unknwon duration ${duration}`);
		}
	}

}

Hooks.on("applyActiveEffect", PersonaAE.applyHook);

//Sachi told me to disable this because it sucks apparently
CONFIG.ActiveEffect.legacyTransferral = false;


