import { RollSituation } from "../../config/situation.js";
import { PersonaVariables } from "../persona-variables.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { RealDamageType } from "../../config/damage-types.js";
import { UsableAndCard } from "../item/persona-item.js";
import { NPCAlly } from "../actor/persona-actor.js";
import { ValidAttackers } from "./persona-combat.js";
import { StatusDuration } from "../active-effect.js";
import { getSocialLinkTarget } from "../preconditions.js";
import { Consumable } from "../item/persona-item.js";
import { Metaverse } from "../metaverse.js";
import { Consequence } from "../../config/consequence-types.js";
import { SocialCardActionConsequence } from "../../config/consequence-types.js";
import { OtherEffect } from "../../config/consequence-types.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { PersonaSocial } from "../social/persona-social.js";
import { Shadow } from "../actor/persona-actor.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";
import { ValidSound } from "../persona-sounds.js";
import { PersonaSFX } from "./persona-sfx.js";

import { PersonaSockets } from "../persona.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { PersonaError } from "../persona-error.js";
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
		"COMBAT_RESULT_APPLY" : {resultObj : string; sender: User["id"];}
		"COMBAT_RESULT_APPLIED": CombatResult["id"];
	}
}

export class CombatResult  {
	_finalized : boolean = false;
	static pendingPromises: Map< CombatResult["id"], Function> = new Map();
	tokenFlags: {
		actor: UniversalActorAccessor<PersonaActor>,
			effects: OtherEffect[]
	}[] = [] ;
	static lastId = 0;
	id : number;
	attacks: Map<AttackResult, ActorChange<ValidAttackers>[]> = new Map();
	escalationMod: number = 0;
	costs: ActorChange<ValidAttackers>[] = [];
	sounds: {sound: ValidSound, timing: "pre" | "post"}[] = [];
	globalOtherEffects: OtherEffect[] = [];

	constructor(atkResult ?: AttackResult | null) {
		this.id = ++CombatResult.lastId;
		if (atkResult) {
			this.attacks.set(atkResult, []);
			// this.attackResults.push(atkResult);
		}
	}

	static addPending(res: CombatResult): Promise<unknown> {
		const promise = new Promise(
			(resolve, reject) => {
				this.pendingPromises.set(res.id, resolve);
				setTimeout( () => {
					reject("Timeout");
					this.pendingPromises.delete(res.id);
				}	, 16000);
			});
		return promise;

	}

	static resolvePending( resId: CombatResult["id"]) {
		const resolver = this.pendingPromises.get(resId);
		if (!resolver) throw new Error(`No Resolver for ${resId}`);
		resolver();
		this.pendingPromises.delete(resId);
	}

	toJSON() : string {
		const obj = {
			attacks: Array.from(this.attacks),
			escalationMod: this.escalationMod,
			costs: this.costs,
			tokenFlags: this.tokenFlags,
			globalOtherEffects : this.globalOtherEffects,
			id: this.id,
		};
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
		ret.globalOtherEffects = x.globalOtherEffects;
		ret.id = x.id;
		return ret;
	}

	addSound(sound: ValidSound, timing: this["sounds"][number]["timing"]) {
		this.sounds.push({sound, timing});
	}

	calcDamageMult(change :ActorChange<ValidAttackers>, mult : number) {
		change.hpchangemult = CombatResult.calcHpChangeMult(change.hpchangemult, mult);
	}

	static calcHpChangeMult(origValue: number, mult: number): number {
		if (!PersonaSettings.get("damageMult")) {
			return origValue *= mult;
		}
		switch (true) {
			case origValue == 0:
				return 0;
			case mult == 1:
				return origValue;
			case mult == 0:
				return 0;
			case mult == -1:
				return origValue *= -1;
			case mult <0:
				PersonaError.softFail("calcDamageMult doesn't handle values less than 0 that aren't -1");
				break;
			case mult > 1:
				mult -= 1;
				return origValue += mult;
			case mult < 1:
				return origValue *= mult;
				// mult = 1 - mult;
				// origValue -= mult;
				// return Math.max(0, origValue);
			default:
				PersonaError.softFail(`Odd value for damage multiplier :${mult}`);
				break;
		}
				return origValue;

	}

	addEffect(atkResult: AttackResult | null | undefined, target: ValidAttackers | undefined, cons: Consequence) {
		let effect: ActorChange<ValidAttackers> | undefined = undefined;
		if (target) {
			effect = {
				actor: target.accessor,
				otherEffects: [],
				hpchange: 0,
				damageType: "none",
				hpchangemult: 1,
				addStatus: [],
				removeStatus: [],
				expendSlot: [0, 0, 0, 0],
			};
		}
		switch (cons.type) {
			case "none":
				break;
			case "absorb":
				if (!effect) break;
				this.calcDamageMult(effect, -1);
				break;
			case "damage-new": {
				if (!effect) break;
				switch (cons.damageSubtype) {
					case "multiplier":
						this.calcDamageMult(effect, cons.amount);

						break;
					case "odd-even":
					case "high":
					case "low":
					case "allout-low":
					case "allout-high":
					case "constant":
						if (cons.damageType != "by-power") {
							effect.damageType = cons.damageType;
						}
						effect.hpchange = -(cons.amount ?? 0);
						if (effect.damageType == "healing") {
							effect.hpchange = Math.abs(effect.hpchange);
						}
						break;
					case "percentage":
							if (!target) {
								PersonaError.softFail("No target for percentage HP");
								break;
							}
						const amt = Math.abs(Math.round(target.mhp * cons.amount * 0.01));
						effect.hpchange = cons.damageType == "healing" ? amt : -amt;
						if (cons.damageType != "by-power") {
							effect.damageType = cons.damageType;
						}
						break;
					default:
							cons satisfies never;
						break;
				}
				break;
			}
			case "dmg-mult":
				if (!effect) break;
				this.calcDamageMult(effect, cons.amount ?? 0);

				break;
			case "dmg-high":
			case "dmg-low":
			case "dmg-allout-high":
			case "dmg-allout-low":
				if (!effect) break;
				effect.hpchange = -(cons.amount ?? 0);
				break;
			case "addStatus": {
				if (!effect) break;
				let status_damage : number | undefined = undefined;
				if (atkResult && cons.statusName == "burn") {
					const power = PersonaDB.findItem(atkResult.power);
					if (power.system.type == "skillCard") {
						PersonaError.softFail("Skill Card shouldn't be here");
						break;
					}
					const attacker = PersonaDB.findToken(atkResult.attacker).actor;
					status_damage = attacker ? (power as Usable).getDamage(attacker)["low"]: 0;
				}
				const id = cons.statusName!;
				if (id != "bonus-action") {
					if (!target) {
						PersonaError.softFail(`No Target for ${id}`);
						break;
					}
					effect.addStatus.push({
						id,
						potency: status_damage ?? cons.amount ?? 0,
						duration: convertConsToStatusDuration(cons, atkResult ?? target),
					});
				}
				break;
			}
			case "removeStatus" : {
				if (!effect) break;
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
				if (!effect) break;
				effect.otherEffects.push({
					type: "extra-attack",
					maxChain: cons.amount ?? 1,
					iterativePenalty: -Math.abs(cons.iterativePenalty ?? 0),
				});
				break;
			case "expend-slot": {
				if (!effect) break;
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
			case "modifier-new":
			case "raise-resistance":
			case "lower-resistance":
			case "raise-status-resistance":
				break;
			case "add-escalation":
				break;
			case "save-slot":
				if (!effect) break;
				effect.otherEffects.push({ type: "save-slot"});
				break;
			case "hp-loss":
				if (!effect) break;
				effect.otherEffects.push({ type: "hp-loss", amount: Math.floor(cons.amount ?? 0)});
				break;
			case "half-hp-cost":
				if (!effect) break;
				effect.otherEffects.push({type: "half-hp-cost"});
				break;
			case "revive":
				if (!effect || !target) break;
				effect.removeStatus.push({ id: "fading"});
				effect.hpchange = Math.round(target.mhp * (cons.amount ?? 0.01));
				effect.hpchangemult = 1;
				break;
			case "extraTurn": {
				if (atkResult) {
					const power = PersonaDB.findItem(atkResult.power);
					if (power.isOpener()) break;
					if (power.isTeamwork()) break;
				}
				if (!effect) break;
				const combat = game.combat as PersonaCombat;
				if (!combat || combat.isSocial || combat.lastActivationRoll == undefined) break;
				effect.otherEffects.push({
					type: "extraTurn",
					activation: combat.lastActivationRoll
				});
				break;
			}
			case "expend-item":
					if (!effect) break;
				effect.otherEffects.push({
					itemId: cons.itemId,
					type: 	"expend-item",
					itemAcc: cons.itemAcc!
				});
				break;
			case "recover-slot":
				if (!effect) break;
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
				if (!effect) break;
				const dur = convertConsToStatusDuration(cons, atkResult ?? target!);
				effect.otherEffects.push( {
					type: "set-flag",
					flagId: cons.flagId ?? "",
					flagName: cons.flagName ?? "",
					state: cons.flagState ?? true,
					duration: dur,
				});
				break;
			case "inspiration-cost": {
				let situation: Situation | undefined = atkResult?.situation;
				if (!effect) break;
				if (!situation) {
					situation = {
						user: effect.actor,
						target: effect.actor,
					};
				}
				const socialTarget = getSocialLinkTarget(cons.socialLinkIdOrTarot, situation, null);
				if (!socialTarget) break;
				effect.otherEffects.push( {
					type: "inspiration-cost",
					amount: cons.amount ?? 1,
					linkId: socialTarget.id,
				});
				break;
			}
			case "display-msg":
				if (effect) {
					effect.otherEffects.push( {
						type: "display-message",
						newChatMsg: cons.newChatMsg ?? false,
						msg: cons.msg ?? "",
					});
				} else {
					this.globalOtherEffects.push({
						type: "display-message",
						newChatMsg: cons.newChatMsg ?? false,
						msg: cons.msg ?? "",
					});
				}
				break;
			case "use-power":  {
				if (!effect) break;
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
				if (!effect) break;
				effect.otherEffects.push( {
					type: cons.type,
					level: cons.amount ?? 1,
				});
				break;
			case "social-card-action":
				//must be executed playerside as event execution is a player thing
				if (!effect) break;
				const otherEffect : SocialCardActionConsequence = {
					...cons
				};
				PersonaSocial.execSocialCardAction(otherEffect);
				effect.otherEffects.push( otherEffect);
				break;
			case "dungeon-action":
				this.globalOtherEffects.push( {
					...cons
				});
				break;
			case "alter-energy":
				if (!effect) break;
				effect.otherEffects.push( {
					type: cons.type,
					amount: cons.amount ?? 0,
				});
				break;
			case "alter-mp":
				if (!effect) break;
				effect.otherEffects.push( {
					type: cons.type,
					amount: cons.amount ?? 0,
					subtype: cons.subtype
				});
				break;
			case "teach-power":
				if (!effect) break;
				effect.otherEffects.push( {
					...cons
				});
				break;
			case "add-creature-tag":
				break;
			case "combat-effect":
				if (!effect) break;
				effect.otherEffects.push(cons);
				break;
			case "alter-fatigue-lvl":
				if (!effect) break;
				effect.otherEffects.push(cons);
				break;
			case "alter-variable":
				effect?.otherEffects.push(cons);
				break;
			case "perma-buff":
				if (!effect) break;
				effect.otherEffects.push(cons);
				break;
			default: {
				cons satisfies never;
				throw new Error("Should be unreachable");
			}
		}
		if (!effect) return;
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
		this.globalOtherEffects = this.globalOtherEffects.concat(other.globalOtherEffects);
	}

	static mergeChanges(mainEffects: ActorChange<ValidAttackers>[], newEffects: ActorChange<ValidAttackers>[]) {
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

	static normalizeChange(change: ActorChange<ValidAttackers>) {
		change.hpchange *= change.hpchangemult;
		change.hpchangemult = 1;
		change.hpchange = Math.trunc(change.hpchange);
	}

	getOtherEffects(actor : ValidAttackers): OtherEffect[] {
		const acc = actor.accessor;
		return Array
			.from(this.attacks.values())
			.flat()
			.filter(x => PersonaDB.accessorEq(x.actor, acc) && x.otherEffects.length > 0)
			.flatMap( x=> x.otherEffects)
	}

	finalize(): this {
		this.clearFlags();
		for (const changes of this.attacks.values()) {
			for (const change of changes) {
				this.finalizeChange(change);
			}
		}
		for (const cost of this.costs) {
			this.finalizeChange(cost);
		}
		this._finalized = true;
		return this;
	}

	emptyCheck(debug = false) : this | undefined {
		if (debug) {
			Debug(this);
			debugger;
		}
		if (!this._finalized) this.finalize();
		const attacks = Array.from(this.attacks.entries());
		if (this.escalationMod == 0 && this.costs.length == 0 && attacks.length ==0 && this.globalOtherEffects.length == 0) return undefined;
		return this;
	}

	async toMessage( effectName: string, initiator: PersonaActor | undefined) : Promise<ChatMessage> {
		if (!this._finalized) this.finalize();
		if (!initiator) {
			const speaker = ChatMessage.getSpeaker();
			const msg = await ChatMessage.create( {
				speaker,
				content: "Userless triggered action PLACEHOLDER" ,
			});
			try {
				await this.autoApplyResult();
			} catch (e) {
				await msg.setFlag("persona", "atkResult", this.toJSON());
			}
			return msg;
		}
		let initiatorToken : PToken | undefined;
		if (game.combat) {
			initiatorToken = PersonaCombat.getPTokenFromActorAccessor(initiator.accessor);
		}
		const rolls : RollBundle[] = Array.from(this.attacks.entries()).map( ([attackResult]) => attackResult.roll);
		const attacks = Array.from(this.attacks.entries()).map( ([attackResult, changes])=> {
			return {
				attackResult,
				changes
			};
		});
		const manualApply = !PersonaSettings.autoApplyCombatResults() || !game.users.contents.some( x=> x.isGM && x.active);
		const attackerName = initiator.token?.name ?? initiatorToken?.name ?? initiator.displayedName;
		const html = await renderTemplate("systems/persona/other-hbs/combat-roll.hbs", {attackerName, effectName,  attacks, escalation: this.escalationMod, result: this, costs: this.costs, manualApply});
		const chatMsg = await ChatMessage.create( {
			speaker: {
				scene: initiatorToken?.parent?.id ?? initiator?.token?.parent.id,
				actor: initiatorToken?.actor?.id ?? initiator.id,
				token:  initiatorToken?.id,
				alias: initiatorToken?.name ?? undefined,
			},
			rolls: rolls.map( rb=> rb.roll),
			content: html,
			user: game.user,
			style: CONST?.CHAT_MESSAGE_STYLES.OOC,
		}, {})
		if (manualApply) {
			await chatMsg.setFlag("persona", "atkResult", this.toJSON());
			return chatMsg;
		}
		try {
			await this.autoApplyResult();
		} catch (e) {
			await chatMsg.setFlag("persona", "atkResult", this.toJSON());
			PersonaError.softFail("Error with automatic result application");
		}
		return chatMsg;
	}

	async autoApplyResult() {
		if (game.user.isGM) {
			try {
				await this.#apply();
			} catch (e) {
				PersonaError.softFail("Problem with GM apply");
				Debug(e);
				Debug(this);
				throw e;
			}
			return;
		}
		const gmTarget = game.users.find(x=> x.isGM && x.active);
		if (gmTarget)  {
			const sendObj = {
				resultObj : this.toJSON(),
				sender: game.user.id,
			}
			PersonaSockets.simpleSend("COMBAT_RESULT_APPLY", sendObj, [gmTarget.id])
			try {
				await CombatResult.addPending(this);
			} catch (e) {
				Debug(this);
				PersonaError.softFail("Error Autoapplying Effect");
			}
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
		const {resultObj, sender} = x;
		const result = CombatResult.fromJSON(resultObj);
		await result.#apply();
		PersonaSockets.simpleSend("COMBAT_RESULT_APPLIED", result.id, [sender])
	}

	static async resolvedHandler(replyId: SocketMessage["COMBAT_RESULT_APPLIED"]) : Promise<void> {
		CombatResult.resolvePending(replyId);
	}

	async applyButton() {
		return this.#apply();
	}

	async #apply(): Promise<void> {
		await this.#processEscalationChange();
		await this.#processAttacks();
		await this.#applyCosts();
		await this.#applyGlobalOtherEffects();
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
					const power = PersonaDB.findItem(result.power);
					if (power.system.type != "skillCard" && power.system.dmg_type != "healing") {
						await PersonaSFX.onDefend(PersonaDB.findToken(result.target), result.result);
					}
			}
			let token: PToken | undefined;
			for (const change of changes) {
				if (change.actor.token)
					token = PersonaDB.findToken(change.actor.token) as PToken;
				const priorHP = token ?  token.actor.hp : 0;
				await this.applyChange(change);
				if (!token) continue;
				if (token.actor && !token.actor.isAlive() && priorHP > 0) {
					const attacker = PersonaDB.findToken(result.attacker);
					await this.#onDefeatOpponent(token, attacker);
				}
			}
		}
	}

	async #onDefeatOpponent(target: PToken, attacker ?: PToken) {
		const combat = game.combat as PersonaCombat | undefined;
		if (!combat) return;
		if (target.actor.system.type == "shadow") {
			// const shadow = combat?.combatants.find( c=> c.token.id == target.id) as Combatant<PersonaActor> | undefined;
			const shadow = combat.findCombatant(target)
			if (shadow) {
				if (!shadow.defeated) {
					try {
						await shadow.update( {defeated: true});
					} catch (e) {
						console.error(e);
					}
				}
			}
		}
		const attackerActor = attacker?.actor;
		if (attackerActor) {
			const situation: Situation = {
				trigger: "on-kill-target",
				triggeringCharacter: attackerActor.accessor,
				attacker: attacker.actor.accessor,
				target: target.actor.accessor,
				user: attackerActor.accessor,
				triggeringUser: game.user,
			}
			for (const comb of combat.combatants) {
				if (!comb.actor) continue;
				situation.user = comb.actor.accessor;
				await TriggeredEffect.execCombatTrigger("on-kill-target", comb.actor, situation);
			}
		}
	}

	async #applyCosts() {
		for (const cost of this.costs) {
			// if (this.hasFlag(actor, "half-hp-cost")) {
			// 	cost.hpchangemult *= 0.666;
			// }
			await this.applyChange(cost);
		}
	}

	async #applyGlobalOtherEffects() {
		for (const eff of this.globalOtherEffects) {
			switch (eff.type) {
				case "dungeon-action":
					await Metaverse.executeDungeonAction(eff);
					break;
				case "display-message":
					if (!eff.newChatMsg) break;
					const html = eff.msg;
					const speaker : Foundry.ChatSpeakerObject = {
						alias: "System"
					};
					await ChatMessage.create( {
						speaker,
						content: html,
						style: CONST?.CHAT_MESSAGE_STYLES.OOC,
					});
					break;
			}
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

	finalizeChange(change: ActorChange<ValidAttackers>) {
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
					if (actor.hasStatus("baton-pass")) {
						//can't get bonus actions from baton pass
						break;
					}
					const bonusAction : StatusEffect = {
						id: "bonus-action",
						duration: { dtype:  "UEoT"},
						activationRoll: otherEffect.activation,
					};
					const extraTurnChange : ActorChange<ValidAttackers> = {
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
				case "inspiration-cost":
				case "hp-loss":
				case "alter-energy":
				case "extra-attack":
				case "dungeon-action":
				case "use-power":
				case "scan":
				case "social-card-action":
				case "add-power-to-list":
				case "teach-power":
				case "alter-mp":
				case "combat-effect":
				case "alter-fatigue-lvl":
				case "perma-buff":
				case "alter-variable":
					break;
				default:
					otherEffect satisfies never;
			}

		}
		CombatResult.normalizeChange(change);
	}

	get power() : UsableAndCard | undefined {
		for (const key of this.attacks.keys()) {
			if (key.power) {
				return PersonaDB.findItem(key.power);
			}
		}
		return undefined;
	}

	async applyChange(change: ActorChange<ValidAttackers>) {
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
				const power = this.power;
				if (power && !power.isAoE()) {
					await PersonaSFX.onDamage(token, change.hpchange, change.damageType);
				}
				Hooks.callAll("onTakeDamage", token, change.hpchange, change.damageType);
			}
			await actor.modifyHP(change.hpchange * change.hpchangemult);
		}
		for (const status of change.addStatus) {
			if (await actor.addStatus(status) && token) {
				Hooks.callAll("onAddStatus", token, status);
			}
		}
		for (const status of change.removeStatus) {
			await actor.removeStatus(status);
		}
		let mpcost = 0;
		let mpmult = 1;
		for (const otherEffect of change.otherEffects) {
			switch (otherEffect.type) {
				case "expend-item":
					if (otherEffect.itemId) {
						const item = game.items.get(otherEffect.itemId);
						if (!item) {
							PersonaError.softFail(`Couldn't find personal Item to expend ${otherEffect.itemId}`);
							continue;
						}
						const playerItem = actor.items.getName(item.name) as Consumable;
						if (!playerItem) {
							PersonaError.softFail(`Couldn't find personal Item to expend ${item.name}`);
							continue;
						}
						await actor.expendConsumable(playerItem);
						continue;
					}
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
					PersonaError.softFail("Recover slot is deprecated as an effect");
					break;
				case "set-flag":
					await actor.setEffectFlag(otherEffect.flagId, otherEffect.state, otherEffect.duration, otherEffect.flagName);
					break;
				case "teach-power":
					const power = PersonaDB.allPowers().find(power => power.id == otherEffect.id);
					if (power && (actor.system.type == "pc" || actor.system.type == "npcAlly")) {
						await (actor as PC | NPCAlly).addPower(power);
					}
					break;
				case "lower-resistance":
				case "raise-resistance":
				case "add-power-to-list":
				case "display-message":
					break;
				case "inspiration-cost":
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
					if (actor.system.type == "shadow") {
						await (actor as Shadow).increaseScanLevel(otherEffect.level);
						PersonaSFX.onScan(token, otherEffect.level);
					}
					break; // done elsewhere for local player
				case "social-card-action":
					break;
				case "dungeon-action":
					await Metaverse.executeDungeonAction(otherEffect);
					break;
				case "alter-energy":
					if (actor.system.type == "shadow") {
						await (actor as Shadow).alterEnergy(otherEffect.amount);
					}
					break;
				case "alter-mp":
					switch (otherEffect.subtype) {
						case "direct":
							mpcost += otherEffect.amount;
							break;
						case "percent-of-total":
							mpcost += actor.mmp * (otherEffect.amount / 100);
							break;

						default:
							otherEffect.subtype satisfies never;
							PersonaError.softFail(`Bad subtype for Alter MP effect : ${otherEffect.subtype}`);
					}
					break;
				case "combat-effect":
					if (game.combat && otherEffect.combatEffect == "auto-end-turn" && actor == game.combat?.combatant?.actor) {
						await (game.combat as PersonaCombat).setForceEndTurn(true);
					}
					break;
				case "alter-fatigue-lvl":
					await actor.alterFatigueLevel(otherEffect.amount);
					break;
				case "alter-variable":
					await PersonaVariables.alterVariable(otherEffect, actor);
					break;
				case "perma-buff":
					await actor.addPermaBuff(otherEffect.buffType, otherEffect.value ?? 0);
					break;
				default:
					otherEffect satisfies never;
			}
		}
		if (mpcost != 0 && actor.system.type != "shadow") {
			mpcost *= mpmult;
			await (actor as PC).modifyMP(mpcost);
		}
	}

	/** combines other's data into initial*/
	static combineChanges (initial: ActorChange<ValidAttackers>, other: ActorChange<ValidAttackers>) : ActorChange<ValidAttackers> {
		return {
			actor: initial.actor,
			hpchange: absMax(initial.hpchange, other.hpchange),
			damageType : initial.damageType == "none" ? other.damageType : initial.damageType,
			hpchangemult: CombatResult.calcHpChangeMult(initial.hpchangemult, other.hpchangemult),
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
	damageType: RealDamageType;
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
	power: UniversalItemAccessor<UsableAndCard>,
	situation: Situation & RollSituation,
	roll: RollBundle,
	critBoost: number,
	printableModifiers: {name: string, modifier:string} [],
	critPrintable?: {name: string, modifier:string} []
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
	PersonaSockets.setHandler("COMBAT_RESULT_APPLIED", CombatResult.resolvedHandler.bind(CombatResult));
});

Hooks.on("updateActor", async (updatedActor : PersonaActor, changes) => {
	//open scan prompt for all players on scan
	if (game.user.isGM) return;
	if (updatedActor.system.type == "shadow") {
		if (changes?.system?.scanLevel && updatedActor.token) {
			updatedActor.sheet.render(true);
		}
	}
});

function resolveStatusDurationAnchor (anchor: (Consequence & {type : "addStatus" | "set-flag"})["durationApplyTo"], atkResult: AttackResult) : UniversalActorAccessor<ValidAttackers> | null {
	if (!anchor) {
		anchor = "target";
	}
	let accessor : UniversalTokenAccessor<PToken> | undefined;
	const situation = atkResult.situation;
	switch (anchor) {
		case "target":
			accessor = atkResult.target;
			break;
		case "owner":
			console.warn("Using owner in status duration anchors is unsupported and just resolves to 'user'");
		case "user":
			const userAcc=  atkResult.situation.user;
			if (userAcc)
				return userAcc;
			PersonaError.softFail("Can't resolve user for status Duration anchor");
			return null;
		case "attacker":
			accessor = atkResult.attacker;
			break;
		case "triggering-character":
			if ("triggeringCharacter" in situation && situation.triggeringCharacter) {
				return situation.triggeringCharacter;
			}
			PersonaError.softFail("Can't resolve triggering Character for status Duration anchor");
			return null;
		case "cameo":
			if ("cameo" in situation && situation.cameo) {
				const actor = PersonaDB.findActor(situation.cameo);
				if (actor && actor.isValidCombatant()) return actor.accessor;
				return null;
			}
		case "all-allies":
		case "all-foes":
		case "all-in-region":
			PersonaError.softFail(`${anchor} not supported as a status anchor`);
			return null;
		default:
			anchor satisfies never;
			return null;
	}
	if (accessor) {
		const token = PersonaDB.findToken(accessor)!;
		return token?.actor?.accessor!;
	}
	PersonaError.softFail("Odd error in resolving Status Anchor");
	return null;
}

function convertConsToStatusDuration(cons: Consequence & {type : "addStatus" | "set-flag"}, atkResultOrActor: AttackResult | ValidAttackers) : StatusDuration {
	const dur = cons.statusDuration;
	switch (dur) {
		case "X-rounds":
		case "X-days":
		case "3-rounds":
			return {
				dtype: dur,
				amount: cons.amount ?? 3,
			};
		case "expedition":
		case "combat":
		case "permanent":
		case "instant":
			return {
				dtype: dur,
			};
		case "save":
			return {
				dtype: "save",
				saveType: cons.saveType ?? "normal",
			}
		case "save-easy":
		case "presave-easy":
			return {
				dtype: "save",
				saveType: "easy",
			};
		case "save-normal":
		case "presave-normal":
			return {
				dtype: "save",
				saveType: "normal",
			};
		case "save-hard":
		case "presave-hard":
			return {
				dtype: "save",
				saveType: "hard",
			};
		case "UEoNT":
		case "USoNT":
		case "UEoT":
			if (atkResultOrActor instanceof PersonaActor) {
				return {
					dtype: dur,
					actorTurn: atkResultOrActor.accessor
				};
			}
			const anchorHolder = resolveStatusDurationAnchor(cons.durationApplyTo, atkResultOrActor);
			//this isn't necessarily target, it has to be  determined by who the anchor is
			if (anchorHolder)  {
				return {
					dtype: dur,
					actorTurn: anchorHolder,
				};
			}
			if (!anchorHolder) {
				PersonaError.softFail(`Can't coinvert consequence ${cons.type}`, atkResultOrActor);
			}
		case "anchored":
			PersonaError.softFail("Anchored shouldn't happen here");
			return {
				dtype: "instant",
			};
		case "X-exploration-turns":
			return {
				dtype: "X-exploration-turns",
				amount: cons.amount ?? 3,
			};
		default:
			dur satisfies never;
			PersonaError.softFail(`Invaliud Duration ${dur}`);
			return {dtype: "instant"};
	}
}
