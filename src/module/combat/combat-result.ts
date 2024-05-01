import { ModifierTarget } from "../../config/item-modifiers.js";
import { ValidSound } from "../persona-sounds.js";
import { PersonaSFX } from "./persona-sfx.js";
import { DamageType } from "../../config/damage-types.js";

import { PersonaSockets } from "../persona.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { SlotType } from "../../config/slot-types.js";
import { PersonaError } from "../persona-error.js";
import { STATUS_EFFECT_DURATIONS_LIST } from "../../config/status-effects.js";
import { CONSQUENCELIST } from "../../config/effect-types.js";
import { StatusDuration } from "../../config/status-effects.js";
import { Situation } from "../preconditions.js";
import { Usable } from "../item/persona-item.js";
import { PC } from "../actor/persona-actor.js";
import { PToken } from "./persona-combat.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { PersonaRoll } from "../persona-roll.js";
import { UniversalTokenAccessor } from "../utility/db-accessor.js";
import { UniversalItemAccessor } from "../utility/db-accessor.js";
import { PersonaCombat } from "./persona-combat.js";
import { PersonaDB } from "../persona-db.js";
import { PersonaActor } from "../actor/persona-actor.js";

declare global {
	interface SocketMessage {
"COMBAT_RESULT_APPLY" : string;
	}
}


export class CombatResult  {
	tokenFlags: WeakMap<PersonaActor, OtherEffect[]> = new WeakMap();
	attacks: Map<AttackResult, TokenChange<PToken>[]> = new Map();
	escalationMod: number = 0;
	costs: TokenChange<PToken>[] = [];
	sounds: {sound: ValidSound, timing: "pre" | "post"}[] = [];

	constructor(atkResult ?: AttackResult) {
		if (atkResult) {
			this.attacks.set(atkResult, []);
			// this.attackResults.push(atkResult);
		}
	}

	toJSON() : string {
		const obj = {
			attacks: Array.from(this.attacks),
			escalationMod: this.escalationMod,
			costs: this.costs,
		}
		const json = JSON.stringify(obj);
		return json;
	}

	static fromJSON(json: string) : CombatResult {
		const x = JSON.parse(json);
		const ret = new CombatResult();
		ret.attacks = new Map(x.attacks);
		ret.escalationMod = x.escalationMod;
		ret.costs = x.costs;
		return ret;
	}

	addSound(sound: ValidSound, timing: this["sounds"][number]["timing"]) {
		this.sounds.push({sound, timing});
	}

	addEffect(atkResult: AttackResult | null, target: PToken, cons: Consequence, damageType ?: DamageType) {
		const effect : TokenChange<PToken>= {
			token: PersonaDB.getUniversalTokenAccessor(target),
			otherEffects: [],
			hpchange: 0,
			damageType: "none",
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
			case "dmg-allout-high":
			case "dmg-allout-low":
					if (damageType) {
						effect.damageType = damageType;
					}
				effect.hpchange = -(cons.amount ?? 0);
				break;
			case "addStatus": {
				let status_damage : number | undefined = undefined;
				if (atkResult && cons.statusName == "burn") {
					const power= PersonaDB.findItem(atkResult.power);
					const attacker = PersonaDB.findToken(atkResult.attacker).actor;
					status_damage = power.getDamage(attacker, "low");

				}
				const id = cons.statusName!;
				effect.addStatus.push({
					id,
					potency: status_damage ?? cons.amount ?? 0,
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
				this.escalationMod += Number(cons.amount) ?? 0;
				break;
			}
			case "hp-loss": {
				effect.hpchange -= Math.floor(cons.amount ?? 0);
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
			case "add-escalation":
				break;
			case "save-slot":
				effect.otherEffects.push({ type: "save-slot"});
				break;
			case "half-hp-cost":
				effect.otherEffects.push({type: "half-hp-cost"});
				break;

			case "revive":
				effect.removeStatus.push({ id: "fading"});
				effect.hpchange = Math.round(target.actor.mhp * (cons.amount ?? 0.01));
				effect.hpchangemult = 1;
				break;
			case "extraTurn":
					effect.otherEffects.push({ type: "extraTurn"});
				break;
			case "expend-item":
					effect.otherEffects.push({
						type: 	"expend-item",
						itemAcc: cons.itemAcc!
					});
				break;
			case "recover-slot":
				effect.otherEffects.push( {
					type: "recover-slot",
					slot: cons.slotType!,
				});
				break;
			case "add-power-to-list":
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
			const entry = mainEffects.find( change => change.token.tokenId == newEffect.token.tokenId);
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
		change.hpchange = Math.trunc(change.hpchange);

	}

	getOtherEffects(token : PToken): OtherEffect[] {
		const acc = PersonaDB.getUniversalTokenAccessor(token);
		return Array
			.from(this.attacks.values())
			.flat()
			.filter(x => x.token == acc && x.otherEffects.length > 0)
			.flatMap( x=> x.otherEffects)
	}

	async finalize() {
		this.clearFlags();
		for (const changes of this.attacks.values()) {
			for (const change of changes) {
				await this.finalizeChange(change);
			}
		}
		for (const cost of this.costs) {
			const token = PersonaDB.findToken(cost.token);
			if (this.hasFlag(token.actor, "half-hp-cost")) {
				cost.hpchangemult *= 0.5;
			}
			if (this.hasFlag(token.actor, "save-slot")) {
				cost.expendSlot = [0, 0, 0, 0];
			}
			if (this.hasFlag(token.actor, "extraTurn")) {
				const status : StatusEffect = {
					id: "bonus-action",
					duration: "UEoT",
				};
				cost.addStatus.push( status);
			}
			await this.finalizeChange(cost);
		}
	}

	emptyCheck() : this | undefined {
		const attacks = Array.from(this.attacks.entries());
		if (this.escalationMod == 0 && this.costs.length == 0 && attacks.length ==0) return undefined;
		return this;
	}


	async toMessage(initiatingToken: PToken, effectName: string) : Promise<ChatMessage> {
		const rolls : PersonaRoll[] = Array.from(this.attacks.entries()).map( ([attackResult]) => attackResult.roll);
		const attacks = Array.from(this.attacks.entries()).map( ([attackResult, changes])=> {
			return {
				attackResult,
				changes
			};
		});
		const manualApply = !PersonaSettings.autoApplyCombatResults() || !game.users.contents.some( x=> x.isGM && x.active);
		const html = await renderTemplate("systems/persona/other-hbs/combat-roll.hbs", {attacker: initiatingToken, effectName,  attacks, escalation: this.escalationMod, result: this, costs: this.costs, manualApply});
		const chatMsg = await ChatMessage.create( {
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
		if (!manualApply) {
			if (game.user.isGM) {
				await this.apply();
			} else  {
				const gmTarget = game.users.find(x=> x.isGM && x.active);
				if (gmTarget)  {
					PersonaSockets.simpleSend("COMBAT_RESULT_APPLY", this.toJSON(), [gmTarget.id])
				} else {
					await chatMsg.setFlag("persona", "atkResult", this.toJSON());
				}
			}
		} else {
			await chatMsg.setFlag("persona", "atkResult", this.toJSON());
		}
		return chatMsg;
	}

	async print(): Promise<void> {
		const signedFormatter = new Intl.NumberFormat("en-US", {signDisplay : "always"});
		let msg = "";
		if (this.escalationMod) {
			msg += `escalation Mod: ${signedFormatter.format(this.escalationMod)}`;
		}
	}

	static async applyHandler(x: SocketMessage["COMBAT_RESULT_APPLY"]) : Promise<void> {
		const result = CombatResult.fromJSON(x);
		await result.apply();
	}

	async apply(): Promise<void> {
		const escalationChange = this.escalationMod;
		if (escalationChange) {
			const combat = PersonaCombat.ensureCombatExists();
			combat.setEscalationDie(combat.getEscalationDie() + escalationChange);
		}
		this.clearFlags();
		for (const [result, changes] of this.attacks.entries()) {
			switch (result.result) {
				case "miss":
				case "absorb":
				case "block":
				case "reflect":
					await PersonaSFX.onDefend(PersonaDB.findToken(result.target), result.result);
			}
			let token: PToken | undefined;
			for (const change of changes) {
				await this.applyChange(change);
				token = PersonaDB.findToken(change.token);
			}
			if (token && !token.actor.isAlive()) {
				const attacker = PersonaDB.findToken(result.attacker);
				this.merge(
					PersonaCombat.onTrigger("on-kill-target", token)
				);
			}
		}
		for (const cost of this.costs) {
			const token = PersonaDB.findToken(cost.token);
			if (this.hasFlag(token.actor, "half-hp-cost")) {
				cost.hpchangemult *= 0.5;
			}
			await this.applyChange(cost);
		}
	}

	clearFlags() {
		this.tokenFlags = new WeakMap();
	}

	addFlag(actor: PersonaActor, flag: OtherEffect) {
		const list = this.tokenFlags.get(actor);
		if (!list) {
			const newlist = [flag];
			this.tokenFlags.set(actor, newlist);
			return;
		} else {
			if (!list.includes(flag))
				list.push(flag);
		}
	}

	hasFlag(actor: PersonaActor, flag: OtherEffect["type"]) : boolean{
		return !!this.tokenFlags.get(actor)?.find(x=> x.type == flag);

	}

	async finalizeChange(change: TokenChange<PToken>) {
		const actor = PersonaDB.findToken(change.token).actor;
		for (const otherEffect of change.otherEffects) {
			switch (otherEffect.type) {
				case "expend-item":
					break;
				case "save-slot":
					this.addFlag(actor, otherEffect);
					break;
				case "half-hp-cost":
					this.addFlag(actor, otherEffect);
					break;
				case "extraTurn":
					this.addFlag(actor, otherEffect);
					break;
				case "recover-slot":
					break;
				default:
					otherEffect satisfies never;
			}

		}
		CombatResult.normalizeChange(change);
	}

	async applyChange(change: TokenChange<PToken>) {
		const token = PersonaDB.findToken(change.token);
		const actor = token.actor;
		if (change.hpchange != 0) {
			if (change.hpchange < 0) {
				setTimeout( () => {
					PersonaCombat
						.onTrigger("on-damage", token)
						.emptyCheck()
						?.toMessage(token, "Reaction (Taking Damage)" )
				});
			}
			await PersonaSFX.onDamage(token, change.hpchange, change.damageType);
			Hooks.callAll("onTakeDamage", token, change.hpchange, change.damageType);
			await actor.modifyHP(change.hpchange * change.hpchangemult);
		}
		for (const status of change.addStatus) {
			if (await actor.addStatus(status)) {
				Hooks.call("onAddStatus", token, status);
				await PersonaSFX.onStatus(token, status.id);
			}
		}
		for (const status of change.removeStatus) {
			await actor.removeStatus(status);
		}
		for (const otherEffect of change.otherEffects) {
			switch (otherEffect.type) {
				case "expend-item":
					const item = PersonaDB.findItem(otherEffect.itemAcc);
					if ( item.parent) {
						await (item.parent as PersonaActor).expendConsumable(item);
					} else  {
						PersonaError.softFail("Can't find item's parent to execute consume item");
					}
					break;
				case "save-slot":
					break;
				case "half-hp-cost":
					break;
				case "extraTurn":
					break;
				case "recover-slot":
					break;
				default:
					otherEffect satisfies never;
			}
		}
		const saveSlot = this.tokenFlags.get(actor)?.find(x=> x.type == "save-slot");
		if (!saveSlot && actor.system.type == "pc") {
			change.expendSlot.forEach(async (val, i) => {
				await (actor as PC).expendSlot(i, val);
			});
		}
	}

	/** combines other's data into initial*/
	static combineChanges (initial: TokenChange<PToken>, other: TokenChange<PToken>) : TokenChange<PToken> {
		return {
			token: initial.token,
			hpchange: absMax(initial.hpchange, other.hpchange),
			damageType : initial.damageType == "untyped" ? other.damageType : initial.damageType,
			hpchangemult: initial.hpchangemult * other.hpchangemult,
			addStatus : initial.addStatus.concat(other.addStatus),
			removeStatus : initial.removeStatus.concat(other.removeStatus),
			expendSlot : initial.expendSlot.map( (x,i)=> x + other.expendSlot[i]) as [number, number, number, number],
			otherEffects: initial.otherEffects.concat(other.otherEffects)
		};
	}
}


export interface TokenChange<T extends Token<any>> {
	token: UniversalTokenAccessor<T>;
	hpchange: number;
	damageType: DamageType;
	hpchangemult: number;
	addStatus: StatusEffect[],
	otherEffects: OtherEffect[]
	removeStatus: Pick<StatusEffect, "id">[],
	expendSlot: [number, number, number, number];
}

type ExpendOtherEffect= {
	type: "expend-item";
	itemAcc: UniversalItemAccessor<Usable>;
}

type RecoverSlotEffect = {
	type: "recover-slot",
	slot: SlotType
}

type SimpleOtherEffect = {
	type: "save-slot" | "half-hp-cost" | "extraTurn";
}

export type OtherEffect =  ExpendOtherEffect | SimpleOtherEffect | RecoverSlotEffect;

export type StatusEffect = {
	id: StatusEffectId,
	potency ?: number,
	duration : typeof STATUS_EFFECT_DURATIONS_LIST[number],
};

export type Consequence = {
	type: typeof CONSQUENCELIST[number],
	amount?: number,
	modifiedField?: ModifierTarget,
	statusName?: StatusEffectId,
	statusDuration?: StatusDuration,
	applyToSelf?: boolean,
	itemAcc?: UniversalItemAccessor<Usable>,
	slotType?: SlotType,
	id?: string,
}

export type AttackResult = {
	result: "hit" | "miss" | "crit" | "reflect" | "block" | "absorb",
	validAtkModifiers?: [number, string][],
	validDefModifiers?: [number, string][],
	target: UniversalTokenAccessor<PToken>,
	attacker: UniversalTokenAccessor<PToken>,
	power: UniversalItemAccessor<Usable>,
	situation: Situation,
	roll: PersonaRoll,
	critBoost: number,
	printableModifiers: {name: string, modifier:string} [],
};


function absMax(...nums : number[]) {
	const absnums = nums.map( x=> Math.abs(x));
	const maxabs = Math.max(...absnums);
	const index = absnums.indexOf(maxabs);
	return nums[index];
}


Hooks.on("renderChatMessage", async (msg: ChatMessage, html: JQuery<HTMLElement>) => {
	const flag = msg.getFlag("persona", "atkResult") as string;
	if (!flag) {
		html.find(".applyChanges").each( function () { this.remove()});
	}
	html.find(".applyChanges").on("click", async () => {
		const flag = msg.getFlag("persona", "atkResult") as string;
		if (!flag) throw new PersonaError("Can't apply twice");
		if (!game.user.isGM) {
			throw new PersonaError("Only GM can click this");
		}
		const res = CombatResult.fromJSON(flag);
		await res.apply();
		await msg.unsetFlag("persona", "atkResult");
	});
});

Hooks.on("socketsReady", async () => {
	PersonaSockets.setHandler("COMBAT_RESULT_APPLY", CombatResult.applyHandler.bind(CombatResult));
});
