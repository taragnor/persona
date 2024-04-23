import { DamageType } from "../../config/damage-types.js";
import { PToken } from "./persona-combat.js";
import { PersonaSounds } from "../persona-sounds.js";
import { waitUntilTrue } from "../utility/async-wait.js";

async function play(snd: Parameters<typeof PersonaSounds["playBattleSound"]>[0]) {
	const sound= await PersonaSounds.playBattleSound(snd);
	if (sound) {
		await waitUntilTrue( () => !sound.playing);
	}
}

export class PersonaSFX {
	static async onDamage( token: PToken, hpchange: number, damageType: DamageType) {
		if (hpchange == 0) return;
		if (hpchange > 0) {
			if (damageType == "healing") {
				await play("heal");
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
				await play(damageType);
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
		const s = await play(defenseType);
	}

}
