import { STATUS_EFFECT_LIST } from "../../config/status-effects.js";
import { STATUS_EFFECT_DURATIONS_LIST } from "../../config/status-effects.js";
import { CONSQUENCELIST } from "../../config/effect-types.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { StatusDuration } from "../../config/status-effects.js";
import { Situation } from "./modifier-list.js";
import { Usable } from "../item/persona-item.js";

import { PToken } from "./persona-combat.js";

export class CombatResult  {
	attackResults : AttackResult[] = [];
	changes : TokenChange<PToken>[] = [];
	escalationMod: number = 0;

	constructor(atkResult ?: AttackResult) {
		if (atkResult) {
			this.attackResults.push(atkResult);
		}
	}

	addEffect(target: PToken, cons:Consequence) {
		const effect : TokenChange<PToken>= {
			token: target,
			hpchange: 0,
			hpchangemult: 1,
			addStatus: [],
			removeStatus: [],
			expendSlot: [0, 0, 0, 0],
		};
		switch (cons.type) {
			case "none":
				break;
			case "absorb":
				effect.hpchangemult = Math.abs(effect.hpchangemult) * -1;
				break;
			case "dmg-mult":
				effect.hpchangemult *= cons.amount ?? 0;
				break;
			case "dmg-high":
			case "dmg-low":
					effect.hpchange -= cons.amount ?? 0;
				break;

			case "addStatus": {
				const id = cons.statusName!;
				effect.addStatus.push({
					id,
					potency: cons.amount ?? 0,
					duration: cons.statusDuration ?? "instant",
				});
				break;
			}
			case "removeStatus" : {
				const id = cons.statusName!;
				effect.removeStatus.push({
					id,
				});
				break;
			}
			case "escalationManipulation" : {
				this.escalationMod += cons.amount ?? 0;
				break;
			}
			case "hp-loss": {
				effect.hpchange -= cons.amount ?? 0;
				break;
			}

			case "extraAttack":
					break;

			case "expend-slot": {
				const slot = cons.amount;
				if (slot == undefined) {
					const err= "Slot is undefined";
					ui.notifications.error(err);
					throw new Error(err);
				}
				effect.expendSlot[slot]+= 1;
				break;
			}

			default: {
				cons.type satisfies never;
				throw new Error("Should be unreachable");
			}
		}
		this.#mergeEffect(effect);
	}

	merge(other: CombatResult) {
		this.attackResults = this.attackResults.concat(other.attackResults);
		this.escalationMod += other.escalationMod;
		for (const change of other.changes)  {
			this.#mergeEffect(change);
		}

	}

	#mergeEffect(newEffect: TokenChange<PToken> ) {
		const entry = this.changes.find( change=> change.token == newEffect.token);
		if (!entry) {
			this.changes.push(newEffect);
		} else {
			const index = this.changes.indexOf(entry);
			this.changes[index] = CombatResult.combineChanges(entry, newEffect);
		}
	}

	/** combines other's data into initial*/
	static combineChanges (initial: TokenChange<PToken>, other: TokenChange<PToken>) : TokenChange<PToken> {
		return {
			token: initial.token,
			hpchange: initial.hpchange + other.hpchange,
			hpchangemult: initial.hpchangemult * other.hpchangemult,
			addStatus : initial.addStatus.concat(other.addStatus),
			removeStatus : initial.removeStatus.concat(other.removeStatus),
			expendSlot : initial.expendSlot.map( (x,i)=> x + other.expendSlot[i]) as [number, number, number, number],
		};
	}


}

export interface TokenChange<T extends Token<any>> {
	token: T;
	hpchange: number;
	hpchangemult: number;
	addStatus: {
		id: (typeof STATUS_EFFECT_LIST)[number]["id"],
		potency ?: number,
		duration : typeof STATUS_EFFECT_DURATIONS_LIST[number],
	}[];
	removeStatus: {
		id: (typeof STATUS_EFFECT_LIST)[number]["id"],
	}[];
	expendSlot: [number, number, number, number];
}


export type Consequence = {
	type: typeof CONSQUENCELIST[number],
	amount?: number,
	statusName?: StatusEffectId,
	statusDuration?: StatusDuration,
	applyToSelf?: boolean,
}

export type AttackResult = {
	result: "hit" | "miss" | "crit" | "reflect" | "block" | "absorb",
	validAtkModifiers: [number, string][],
	validDefModifiers: [number, string][],
	target: PToken,
	attacker: PToken,
	power: Usable,
	situation: Situation,
};


