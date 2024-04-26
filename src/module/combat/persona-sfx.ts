import { DamageType } from "../../config/damage-types.js";
import { PToken } from "./persona-combat.js";
import { PersonaSounds } from "../persona-sounds.js";
import { waitUntilTrue } from "../utility/async-wait.js";


export class PersonaSFX {
	static async onDamage( token: PToken, hpchange: number, damageType: DamageType) {
		if (hpchange == 0) return;
		if (hpchange > 0) {
			if (damageType == "healing") {
				await this.play("heal");
			}
			return;
		}
		switch (damageType) {
			case "physical":
			case "fire":
			case "cold":
			case "wind":
			case "lightning":
			case "light":
			case "dark":
				await this.play(damageType);
			case "untyped":

			case "healing":
				return;
			case "none":
				return;
			default:
				damageType satisfies never;
		}
	}

	static async onDefend( token: PToken, defenseType: "block" | "absorb" | "miss" | "reflect") {
		const s = await this.play(defenseType);
	}

	static async play(snd: Parameters<typeof PersonaSounds["playBattleSound"]>[0], volume = 1.0) {
		const sound= await PersonaSounds.playBattleSound(snd, volume);
		if (sound) {
			await waitUntilTrue( () => !sound.playing);
		}
	}

}
