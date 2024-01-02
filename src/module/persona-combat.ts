import { STATUS_EFFECT_LIST} from "../config/status-effects";
import { STATUS_EFFECT_DURATIONS_LIST } from "../config/status-effects";
import { PersonaActor } from "./actor/persona-actor";

import { Power } from "./item/persona-item";
export class PersonaCombat {
	static usePowerOn(attacker: Token<PersonaActor>, power: Power, targets: Token<PersonaActor>[]) : CombatResult<Token<PersonaActor>> {
		return {
			tokens: [],
			escalationMod: 0,
		}; //Placeholder
	}


	static usePower(attacker: Token<PersonaActor>, power: Power) {
		const targets= this.getTargets();
		return this.usePowerOn(attacker, power, targets);


	}

	static getTargets(): Token<PersonaActor>[] {
		const targets = game.user.targets.contents;
		return targets;
	}


}


export interface CombatResult<T extends Token<any>> {
	tokens: TokenChange<T>[];
	escalationMod: number;
}

export interface TokenChange<T extends Token<any>> {
	token: T;
	hpchange: number;
	addStatus: {
		id: (typeof STATUS_EFFECT_LIST)[number]["id"],
		potency ?: number,
		duration : typeof STATUS_EFFECT_DURATIONS_LIST[number],
	}[];
	removeStatus: {
		id: (typeof STATUS_EFFECT_LIST)[number]["id"],
	}[];
}
