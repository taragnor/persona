import { ResistanceShiftEffect } from "./combat/combat-result.js";
import { ResistStrength } from "../config/damage-types.js";
import { ResistType } from "../config/damage-types.js";
import { PersonaItem } from "./item/persona-item.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaError } from "./persona-error.js";
import { StatusDuration } from "../config/status-effects.js";
import { StatusEffectId } from "../config/status-effects.js";

export class PersonaAE extends ActiveEffect<PersonaActor, PersonaItem> {

	override statuses: Set<StatusEffectId>;

	static async applyHook (actor: PersonaActor, change: AEChange, current: any, delta: any, changes: Record<string, any> ) {
		//*changes object is a record of valeus taht may get changed by applying the AE;
		// example: changes["system.hp"] = 25
	}

	get displayedName() {
		return game.i18n.localize(this.name);
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
		return this.getFlag<StatusDuration>("persona", "duration");
	}

	async setPotency(potency: number) : Promise<void> {
		await this.setFlag("persona", "potency", potency);
	}

	async setDuration(duration: StatusDuration) : Promise<void> {
		await this.setFlag("persona", "duration", duration);
		if (duration == "3-rounds") {
			await this.update({"duration.rounds": 3});
		}
	}

	durationLessThanOrEqualTo(x : StatusDuration): boolean {
		return  PersonaAE.getStatusValue(this.statusDuration) <= PersonaAE.getStatusValue(x);
	}

	get statusId() : StatusEffectId | undefined {
		for (const status of this.statuses) {
			return status;
		}
		return undefined;
	}

	static getStatusValue (duration : StatusDuration) : number {
		switch (duration) {
			case "expedition":
				return 10;
			case "combat":
				return 9;
			case "3-rounds":
				return 8
			case "presave-hard":
			case "save-hard":
				return 6;
			case "presave-normal":
			case "save-normal":
				return 5;
			case "presave-easy":
			case "save-easy":
				return 4;
			case "UEoNT":
				return 3;
			case "USoNT":
				return 2;
			case "UEoT":
				return 1;
			case "instant":
				return 1;
			case "permanent":
			case undefined: //custom statuses player added
				return 11;
			default:
				duration satisfies never;
				PersonaError.softFail(`Unknwon duration ${duration}`);
				return 100;
		}
	}

	get linkedFlagId() : undefined | string {
		return this.getFlag<string>("persona", "linkedEffectFlag") ?? undefined;
	}

	async linkToEffectFlag( flagId: string) {
		await this.setFlag("persona", "linkedEffectFlag", flagId);
	}

	static async onPreDelete(effect: PersonaAE) {
		const flag = effect.linkedFlagId;
		try {
			// await effect.unsetFlag("persona", "LinkedEffectFlag");
		} catch (e)  {
			console.log(e);
		}
		if (flag && effect.parent instanceof PersonaActor) {
			(effect as any)["_flaggedDeletion"] = true;
			await effect.parent.setEffectFlag(flag, false);
		}
	}


}

Hooks.on("preDeleteActiveEffect", PersonaAE.onPreDelete);

Hooks.on("applyActiveEffect", PersonaAE.applyHook);

//Sachi told me to disable this because it sucks apparently
CONFIG.ActiveEffect.legacyTransferral = false;


