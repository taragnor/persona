import { Metaverse } from "../metaverse.js";
import { Consequence } from "../../config/consequence-types.js";
import { SocialCardActionEffect } from "../../config/consequence-types.js";
import { OtherEffect } from "../../config/consequence-types.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { PersonaSocial } from "../social/persona-social.js";
import { ScanDialog } from "./scan-dialog.js";
import { Shadow } from "../actor/persona-actor.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";
import { ValidSound } from "../persona-sounds.js";
import { PersonaSFX } from "./persona-sfx.js";
import { DamageType } from "../../config/damage-types.js";

import { PersonaSockets } from "../persona.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { PersonaError } from "../persona-error.js";
import { Situation } from "../preconditions.js";
import { Usable } from "../item/persona-item.js";
import { PC } from "../actor/persona-actor.js";
import { PToken } from "./persona-combat.js";
import { RollBundle } from "../persona-roll.js";
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
	tokenFlags: {
		actor: UniversalActorAccessor<PC |Shadow>,
			effects: OtherEffect[]
		}[] = [] ;
	attacks: Map<AttackResult, ActorChange<PC | Shadow>[]> = new Map();
	escalationMod: number = 0;
	costs: ActorChange<PC | Shadow>[] = [];
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
			tokenFlags: this.tokenFlags,
		}
		const json = JSON.stringify(obj);
		return json;
	}

	findEffects<T extends OtherEffect["type"]>(effectType: T): (OtherEffect & {type:T})[] {
		let arr = [] as (OtherEffect & {type:T})[];
		for (const v of this.attacks.values()) {
			for (const eff of v.flatMap(chg => chg.otherEffects) ) {
				if (eff.type == effectType)
					arr.push( eff as OtherEffect & {type:T});
			}
		}
		for (const eff of this.costs.flatMap(chg => chg.otherEffects) ) {
			if (eff.type == effectType)
				arr.push( eff as OtherEffect & {type:T});
		}
		return arr;
	}

	static fromJSON(json: string) : CombatResult {
		const x = JSON.parse(json);
		const ret = new CombatResult();
		ret.attacks = new Map(x.attacks);
		ret.escalationMod = x.escalationMod;
		ret.costs = x.costs;
		ret.tokenFlags = x.tokenFlags;
		return ret;
	}

	addSound(sound: ValidSound, timing: this["sounds"][number]["timing"]) {
		this.sounds.push({sound, timing});
	}

	addEffect(atkResult: AttackResult | null, target: PC | Shadow, cons: Consequence, damageType ?: DamageType) {
		const effect : ActorChange<PC | Shadow>= {
			actor: target.accessor,
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
					status_damage = attacker ? power.getDamage(attacker, "low"): 0;

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
				this.escalationMod += Number(cons.amount ?? 0);
				break;
			}

			case "extraAttack":
				effect.otherEffects.push({
					type: "extra-attack",
					maxChain: cons.amount ?? 1,
					iterativePenalty: -Math.abs(cons.iterativePenalty ?? 0),
				});
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
			case "raise-resistance":
			case "lower-resistance":
				break;
			case "add-escalation":
				break;
			case "save-slot":
				effect.otherEffects.push({ type: "save-slot"});
				break;
			case "hp-loss":
				effect.otherEffects.push({ type: "hp-loss", amount: Math.floor(cons.amount ?? 0)});
				break;
			case "half-hp-cost":
				effect.otherEffects.push({type: "half-hp-cost"});
				break;

			case "revive":
				effect.removeStatus.push({ id: "fading"});
				effect.hpchange = Math.round(target.mhp * (cons.amount ?? 0.01));
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
					amt: cons.amount ?? 1,
				});
				break;
			case "add-power-to-list":
				break;
			case "other-effect":
				break;
			case "set-flag":
				effect.otherEffects.push( {
					type: "set-flag",
					flagId: cons.flagId ?? "",
					flagName: cons.flagName ?? "",
					state: cons.flagState ?? true,
					duration: cons.statusDuration ?? "permanent",
				});
				break;
			case "inspiration-cost":
				effect.otherEffects.push( {
					type: "Inspiration",
					amount: cons.amount ?? 1,
					linkId: cons.id ?? "",
				});
				break;
			case "display-msg":
				effect.otherEffects.push( {
					type: "display-message",
					msg: cons.msg ?? "",
				});
				break;
			case "use-power":  {
				if (!cons.actorOwner) {
					PersonaError.softFail("No actor owner for usepower ability");
					break;
				}
				effect.otherEffects.push( {
					newAttacker:  cons.actorOwner,
					type: cons.type,
					powerId : cons.powerId,
					target: cons.target,
				});
				break;
			}
			case "scan":
				effect.otherEffects.push( {
					type: cons.type,
					level: cons.amount ?? 1,
				});
				break;
			case "social-card-action":
				//must be executed playerside as event execution is a player thing
				console.log("Executing social card action");
				const otherEffect : SocialCardActionEffect = {
					type: cons.type,
					action: cons.cardAction,
					eventLabel: cons.eventLabel,
					amount: cons.amount ?? 0,
					studentSkill: cons.studentSkill,
				};
				PersonaSocial.execSocialCardAction(otherEffect);
				effect.otherEffects.push( otherEffect);
				break;
			case "dungeon-action":
				effect.otherEffects.push( {
					type: cons.type,
					dungeonAction: cons.dungeonAction,
					amount: cons.amount,
				});
				break;
			default: {
				cons satisfies never;
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

	static mergeChanges(mainEffects: ActorChange<PC | Shadow>[], newEffects: ActorChange<PC | Shadow>[]) {
		for (const newEffect of newEffects) {
			const entry = mainEffects.find( change => PersonaDB.accessorEq(change.actor, newEffect.actor));
			if (!entry) {
				mainEffects.push(newEffect);
			} else {
				const index = mainEffects.indexOf(entry);
				mainEffects[index] = CombatResult.combineChanges(entry, newEffect);
			}
		}
	}

	static normalizeChange(change: ActorChange<PC | Shadow>) {
		change.hpchange *= change.hpchangemult;
		change.hpchangemult = 1;
		change.hpchange = Math.trunc(change.hpchange);

	}

	getOtherEffects(actor : PC | Shadow): OtherEffect[] {
		const acc = actor.accessor;
		return Array
			.from(this.attacks.values())
			.flat()
			.filter(x => PersonaDB.accessorEq(x.actor,acc) && x.otherEffects.length > 0)
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
			const actor = PersonaDB.findActor(cost.actor);
			if (this.hasFlag(actor, "half-hp-cost")) {
				// cost.hpchangemult *= 0.5;
				cost.hpchangemult *= 0.666;
			}
			if (this.hasFlag(actor, "save-slot")) {
				cost.expendSlot = [0, 0, 0, 0];
			}
			await this.finalizeChange(cost);
		}
	}

	emptyCheck() : this | undefined {
		const attacks = Array.from(this.attacks.entries());
		if (this.escalationMod == 0 && this.costs.length == 0 && attacks.length ==0) return undefined;
		return this;
	}


	async toMessage( effectName: string, initiator: PersonaActor) : Promise<ChatMessage> {
		let InitiatorToken : PToken | undefined;
		if (game.combat) {
			 InitiatorToken = PersonaCombat.getPTokenFromActorAccessor(initiator.accessor);

		}
		const rolls : RollBundle[] = Array.from(this.attacks.entries()).map( ([attackResult]) => attackResult.roll);
		const attacks = Array.from(this.attacks.entries()).map( ([attackResult, changes])=> {
			return {
				attackResult,
				changes
			};
		});
		const manualApply = !PersonaSettings.autoApplyCombatResults() || !game.users.contents.some( x=> x.isGM && x.active);
		const attackerName = initiator.token?.name ?? initiator.name;
		const html = await renderTemplate("systems/persona/other-hbs/combat-roll.hbs", {attackerName, effectName,  attacks, escalation: this.escalationMod, result: this, costs: this.costs, manualApply});
		const chatMsg = await ChatMessage.create( {
			speaker: {
				scene: InitiatorToken?.parent?.id ?? initiator?.token?.parent.id,
				actor: InitiatorToken?.actor?.id ?? initiator.id,
				token:  InitiatorToken?.id,
				alias: InitiatorToken?.name ?? undefined,
			},
			rolls: rolls.map( rb=> rb.roll),
			content: html,
			user: game.user,
			// V12 compatibility, causes error if combined with type though
			// style: CONST?.CHAT_MESSAGE_STYLES?.OOC,
			type: CONST.CHAT_MESSAGE_TYPES.ROLL,
		}, {})
		if (manualApply) {
			await chatMsg.setFlag("persona", "atkResult", this.toJSON());
			return chatMsg;
		}
		try {
			await this.autoApplyResult();
		} catch (e) {
			await chatMsg.setFlag("persona", "atkResult", this.toJSON());

			}
			// if (game.user.isGM) {
			// 	await this.#apply();
			// } else  {
			// 	const gmTarget = game.users.find(x=> x.isGM && x.active);
			// 	if (gmTarget)  {
			// 		PersonaSockets.simpleSend("COMBAT_RESULT_APPLY", this.toJSON(), [gmTarget.id])
			// 	} else {
					// await chatMsg.setFlag("persona", "atkResult", this.toJSON());
		return chatMsg;
	}

	async autoApplyResult() {
		if (game.user.isGM) {
			await this.#apply();
			return;
		}
		const gmTarget = game.users.find(x=> x.isGM && x.active);
		if (gmTarget)  {
			PersonaSockets.simpleSend("COMBAT_RESULT_APPLY", this.toJSON(), [gmTarget.id])
			return;
		} else {
			throw new Error("Can't apply no GM connected");
		}
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
		await result.#apply();
	}

	async applyButton() {
		return this.#apply();
	}

	async #apply(): Promise<void> {
		await this.#processEscalationChange();
		await this.#processAttacks();
		await this.#applyCosts();
	}

	async #processEscalationChange() {
		const escalationChange = this.escalationMod;
		if (escalationChange) {
			const combat = PersonaCombat.ensureCombatExists();
			combat.setEscalationDie(combat.getEscalationDie() + escalationChange);
		}
	}

	async #processAttacks() {
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
				if (change.actor.token)
					token = PersonaDB.findToken(change.actor.token) as PToken;
				if (token && token.actor && !token.actor.isAlive()) {
					const attacker = PersonaDB.findToken(result.attacker);
					await this.#onDefeatOpponent(token, attacker);
				}
			}
		}
	}

	async #onDefeatOpponent(target: PToken, attacker ?: PToken) {
		if (target.actor.system.type == "shadow") {
			const shadow = game.combat?.combatants.find( c=> c.token.id == target.id) as Combatant<PersonaActor> | undefined;
			if (shadow) {
				if (!shadow.defeated) {
					await shadow.update( {defeated: true});
				}
			}
		}
		const actingActor = attacker?.actor;
		if (actingActor) {
			PersonaCombat.execTrigger("on-kill-target", actingActor);
		}
	}

	async #applyCosts() {
		for (const cost of this.costs) {
			const actor = PersonaDB.findActor(cost.actor);
			if (this.hasFlag(actor, "half-hp-cost")) {
				cost.hpchangemult *= 0.5;
			}
			await this.applyChange(cost);
		}
	}

	clearFlags() {
		this.tokenFlags = [];
	}

	addFlag(actor: PersonaActor, flag: OtherEffect) {
		const item = this.tokenFlags.find(x=> x.actor.actorId ==  actor.accessor.actorId );
		if (!item) {
			this.tokenFlags.push({
				actor: actor.accessor,
				effects: [flag]
			});
		} else {
			if (!item.effects.includes(flag))
				item.effects.push(flag);
		}
	}

	hasFlag(actor: PersonaActor, flag: OtherEffect["type"]) : boolean{
		return !!this.tokenFlags.find(x=> x.actor.actorId == actor.id)?.effects.find( eff=> eff.type == flag);

	}

	async finalizeChange(change: ActorChange<PC | Shadow>) {
		const actor = PersonaDB.findActor(change.actor);

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
					const bonusAction : StatusEffect = {
						id: "bonus-action",
						duration: "UEoT"
					};
					const extraTurnChange : ActorChange<PC | Shadow> = {
						actor:change.actor,
						hpchange: 0,
						damageType: "none",
						hpchangemult: 0,
						addStatus: [bonusAction],
						otherEffects: [],
						removeStatus: [],
						expendSlot: [0, 0, 0, 0]
					}
					this.costs.push(extraTurnChange);
					break;
				case "recover-slot":
					break;
				case "set-flag":
					break;
				case "raise-resistance":
				case "lower-resistance":
				case "display-message":
				case "Inspiration":
				case "hp-loss":
				case "extra-attack":
					break;
				case "use-power":
					break;
				case "scan":
					const combatant = game?.combat?.combatants?.find(x=> x.actor == actor) as Combatant<PersonaActor> | undefined;
					if (combatant && combatant?.actor?.type == "shadow") {
						ScanDialog.create(combatant as Combatant<Shadow>, otherEffect.level)
					}
					break;
				case "social-card-action":
					break;
				case "dungeon-action":
					break;
				default:
					otherEffect satisfies never;
			}

		}
		CombatResult.normalizeChange(change);
	}

	async applyChange(change: ActorChange<PC | Shadow>) {
		const actor = PersonaDB.findActor(change.actor);
		const token  = change.actor.token ? PersonaDB.findToken(change.actor.token) as PToken: undefined;
		if (change.hpchange != 0) {
			if (change.hpchange < 0) {
				setTimeout( () => {
					PersonaCombat
						.onTrigger("on-damage", actor)
						.emptyCheck()
						?.toMessage("Reaction (Taking Damage)" , actor)
				});
			}
			if (token) {
				await PersonaSFX.onDamage(token, change.hpchange, change.damageType);
				Hooks.callAll("onTakeDamage", token, change.hpchange, change.damageType);
			}
			await actor.modifyHP(change.hpchange * change.hpchangemult);
		}
		for (const status of change.addStatus) {
			if (status.id == "curse" || status.id == "expel") {
				if (!token || Math.abs(change.hpchange) < (token.actor!.mhp * 0.2)) {
					continue;
				}
			}
			if (await actor.addStatus(status) && token) {
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
					if (!otherEffect.itemAcc) {
						PersonaError.softFail("Can't find item to expend");
						continue;
					}
					try {
						const item = PersonaDB.findItem(otherEffect.itemAcc);
						if ( item.parent) {
							await (item.parent as PersonaActor).expendConsumable(item);
						} else  {
							PersonaError.softFail("Can't find item's parent to execute consume item");
						}
					} catch (e) {
						PersonaError.softFail("Can't find item to expend");
						continue;
					}
					break;
				case "save-slot":
					break;
				case "half-hp-cost":
					break;
				case "extraTurn":
					break;
				case "recover-slot":
					if (actor.system.type == "pc") {
						await (actor as PC).recoverSlot(otherEffect.slot, otherEffect.amt)
					}
					break;
				case "set-flag":
					await actor.setEffectFlag(otherEffect.flagId, otherEffect.state, otherEffect.duration, otherEffect.flagName);
					break;
				case "lower-resistance":
				case "raise-resistance":
				case "display-message":
					break;
				case "Inspiration":
					if (actor.system.type == "pc") {
						await (actor as PC).spendInspiration(otherEffect.linkId, otherEffect.amount)
					}
					break;
				case "hp-loss":
					await actor.modifyHP(-otherEffect.amount);
					break;
				case "extra-attack":
					break;
				case "use-power":
					break;
				case "scan":
					break; // done elsewhere for local player
				case "social-card-action":
					break;
				case "dungeon-action":
					await Metaverse.executeDungeonAction(otherEffect);
					break;
				default:
					otherEffect satisfies never;
			}
		}
		const saveSlot = this.hasFlag(actor, "save-slot");
		if (!saveSlot && actor.system.type == "pc") {
			change.expendSlot.forEach(async (val, i) => {
				await (actor as PC).expendSlot(i, val);
			});
		}
	}

	/** combines other's data into initial*/
	static combineChanges (initial: ActorChange<PC | Shadow>, other: ActorChange<PC | Shadow>) : ActorChange<PC | Shadow> {
		return {
			actor: initial.actor,
			hpchange: absMax(initial.hpchange, other.hpchange),
			damageType : initial.damageType == "untyped" || initial.damageType == "none" ? other.damageType : initial.damageType,
			hpchangemult: initial.hpchangemult * other.hpchangemult,
			addStatus : initial.addStatus.concat(other.addStatus),
			removeStatus : initial.removeStatus.concat(other.removeStatus),
			expendSlot : initial.expendSlot.map( (x,i)=> x + other.expendSlot[i]) as [number, number, number, number],
				otherEffects: initial.otherEffects.concat(other.otherEffects)
		};
	}
}

export interface ActorChange<T extends PersonaActor> {
	actor: UniversalActorAccessor<T>;
	hpchange: number;
	damageType: DamageType;
	hpchangemult: number;
	addStatus: StatusEffect[],
	otherEffects: OtherEffect[]
	removeStatus: Pick<StatusEffect, "id">[],
	expendSlot: [number, number, number, number];
}

export type AttackResult = {
	result: "hit" | "miss" | "crit" | "reflect" | "block" | "absorb",
	defenseValue?: number,
	hitWeakness?: boolean,
	hitResistance?: boolean,
	validAtkModifiers?: [number, string][],
	validDefModifiers?: [number, string][],
	target: UniversalTokenAccessor<PToken>,
	attacker: UniversalTokenAccessor<PToken>,
	power: UniversalItemAccessor<Usable>,
	situation: Situation,
	roll: RollBundle,
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
		await res.applyButton();
		await msg.unsetFlag("persona", "atkResult");
	});
});

Hooks.on("socketsReady", async () => {
	PersonaSockets.setHandler("COMBAT_RESULT_APPLY", CombatResult.applyHandler.bind(CombatResult));
});


