import { STATUS_EFFECT_LIST } from "../../config/status-effects";
import { STATUS_EFFECT_DURATIONS_LIST } from "../../config/status-effects";
import { PersonaActor } from "../actor/persona-actor";
import { Power } from "../item/persona-item";
import { ModifierList } from "./modifier-list";

export class PersonaCombat {
	static usePowerOn(attacker: PToken, power: Power, targets: PToken[]) : CombatResult<PToken> {
		const attackbonus= this.getAttackBonus(attacker, power);
		return {
			tokens: [],
			escalationMod: 0,
		}; //Placeholder
	}

	static getAttackBonus(attacker: PToken, power:Power): ModifierList {
		const actor = attacker.actor;
		if (power.system.subtype == "weapon")
			return actor.wpnAtkBonus();
		if (power.system.subtype == "magic")
			return actor.magAtkBonus();
		return new ModifierList();
	}

	static usePower(attacker: PToken, power: Power) {
		const targets= this.getTargets();
		return this.usePowerOn(attacker, power, targets);
	}

	static getTargets(): PToken[] {
		const targets = game.user.targets.contents;
		return targets;
	}

}

type ValidAttackers = Subtype<PersonaActor, "pc"> | Subtype<PersonaActor, "shadow">;

type PToken = Token<ValidAttackers>;


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

