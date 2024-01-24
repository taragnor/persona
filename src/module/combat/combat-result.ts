import { STATUS_EFFECT_LIST } from "../../config/status-effects.js";
import { STATUS_EFFECT_DURATIONS_LIST } from "../../config/status-effects.js";
import { CONSQUENCELIST } from "../../config/effect-types.js";
import { StatusDuration } from "../../config/status-effects.js";
import { Situation } from "./modifier-list.js";
import { Usable } from "../item/persona-item.js";
import { PC } from "../actor/persona-actor.js";
import { PToken } from "./persona-combat.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { PersonaRoll } from "../persona-roll.js";

export class CombatResult  {
	attacks: Map<AttackResult, TokenChange<PToken>[]> = new Map();
	escalationMod: number = 0;
	costs: TokenChange<PToken>[] = [];

	constructor(atkResult ?: AttackResult) {
		if (atkResult) {
			this.attacks.set(atkResult, []);
			// this.attackResults.push(atkResult);
		}
	}

	addEffect(atkResult: AttackResult | null, target: PToken, cons: Consequence) {
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

			case "modifier":
				break;

			default: {
				cons.type satisfies never;
				throw new Error("Should be unreachable");
			}
		}
		if (atkResult == null) {
			CombatResult.mergeChanges(this.costs, [effect]);
			return;
		}
		if (!this.attacks.has(atkResult)) {
			this.attacks.set(atkResult, []);
		}
		const effects = this.attacks.get(atkResult)!;
		CombatResult.mergeChanges(effects, [effect]);
	}

	merge(other: CombatResult) {
		this.escalationMod += other.escalationMod;
		CombatResult.mergeChanges( this.costs, other.costs);
		for (const [atkResult, changeArr] of other.attacks.entries()) {
			const myRes = this.attacks.get(atkResult);
			if (myRes) {
				CombatResult.mergeChanges(myRes, changeArr);
			} else {
				this.attacks.set(atkResult, changeArr);
			}
		}
	}

	static mergeChanges(mainEffects: TokenChange<PToken>[], newEffects: TokenChange<PToken>[]) {
		for (const newEffect of newEffects) {
			const entry = mainEffects.find( change => change.token == newEffect.token);
			if (!entry) {
				mainEffects.push(newEffect);
			} else {
				const index = mainEffects.indexOf(entry);
				mainEffects[index] = CombatResult.combineChanges(entry, newEffect);
			}
		}
	}

		static normalizeChange(change: TokenChange<PToken>) {
			change.hpchange *= change.hpchangemult;
			change.hpchangemult = 1;

			}

	async toMessage(initiatingToken: PToken, powerUsed: Usable) : Promise<ChatMessage> {

		const rolls : PersonaRoll[] = Array.from(this.attacks.entries()).map( ([attackResult]) => attackResult.roll);
		const attacks = Array.from(this.attacks.entries()).map( ([attackResult, changes])=> {
			for (const change of changes) {
				CombatResult.normalizeChange(change);
			}
			return {
				attackResult,
				changes
			};
		});

		const html = await renderTemplate("systems/persona/other-hbs/combat-roll.hbs", {attacker: initiatingToken, power: powerUsed,  attacks, escalation: this.escalationMod});

		return await ChatMessage.create( {
			speaker: {
				scene: initiatingToken.scene.id,
				actor: undefined,
				token: initiatingToken.id,
				alias: undefined
			},
			rolls: rolls,
			content: html,
			user: game.user,
			type: CONST.CHAT_MESSAGE_TYPES.ROLL
		}, {})
	}

	async print(): Promise<void> {
		const signedFormatter = new Intl.NumberFormat("en-US", {signDisplay : "always"});
		let msg = "";
		if (this.escalationMod) {
			msg += `escalation Mod: ${signedFormatter.format(this.escalationMod)}`;
		}
	}

	async apply(): Promise<void> {
		const escalationChange = this.escalationMod;
		//TODO: change escalation die when that's a thing
		for (const changes of this.attacks.values()) {
			for (const change of changes) {
				await CombatResult.applyChange(change);

			}
		}
		for (const cost of this.costs) {
			await CombatResult.applyChange(cost);
		}
	}

	static async applyChange(change: TokenChange<PToken>) {
		const actor = change.token.actor;
		await actor.modifyHP(change.hpchange * change.hpchangemult);
		for (const status of change.addStatus) {
			await actor.addStatus(status);
		}
		for (const status of change.removeStatus) {
			await actor.removeStatus(status);
		}
		if (actor.system.type == "pc") {
			change.expendSlot.forEach(async (val, i) => {
				await (actor as PC).expendSlot(i, val);
			});
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
	addStatus: StatusEffect[],

	removeStatus: Pick<StatusEffect, "id">[],
	expendSlot: [number, number, number, number];
}

export type StatusEffect = {
		id: StatusEffectId,
		potency ?: number,
		duration : typeof STATUS_EFFECT_DURATIONS_LIST[number],
	};

export type Consequence = {
	type: typeof CONSQUENCELIST[number],
	amount?: number,
	modifiedField?: string,
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
	roll: PersonaRoll,
	printableModifiers: {name: string, modifier:string} [],
};


