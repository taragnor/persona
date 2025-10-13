/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { PersonaVariables } from "../persona-variables.js";
import { UsableAndCard } from "../item/persona-item.js";
import { Consumable } from "../item/persona-item.js";
import { PersonaSounds } from "../persona-sounds.js";
import { Metaverse } from "../metaverse.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { PersonaSFX } from "./persona-sfx.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { RollBundle } from "../persona-roll.js";
import { PC } from "../actor/persona-actor.js";
import { Shadow } from "../actor/persona-actor.js";
import { PersonaCombat } from "./persona-combat.js";
import { PToken } from "./persona-combat.js";
import { PersonaSockets } from "../persona.js";
import { PersonaError } from "../persona-error.js";
import { EvaluatedDamage } from "./damage-calc.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { PersonaActor } from "../actor/persona-actor.js";

import { CombatResult } from "./combat-result.js";
import { AttackResult } from "./combat-result.js";
import { OtherEffect } from "../../config/consequence-types.js";
import { ValidAttackers } from "./persona-combat.js";
import { ValidSound } from "../persona-sounds.js";
import { PersonaDB } from "../persona-db.js";
import { ActorChange } from "./combat-result.js";
import {SocketsNotConnectedError, TimeoutError, VerificationFailedError} from "../utility/socket-manager.js";



export class FinalizedCombatResult {
	static pendingPromises: Map< CombatResult["id"], (val: unknown) => void> = new Map();
	tokenFlags: {
		actor: UniversalActorAccessor<PersonaActor>,
			effects: OtherEffect[]
	}[] = [] ;
	id : number;
	attacks: ResolvedAttackResult[] = [];
	costs: ResolvedActorChange<ValidAttackers>[] = [];
	sounds: {sound: ValidSound, timing: "pre" | "post"}[] = [];
	globalOtherEffects: OtherEffect[] = [];

	constructor( cr: CombatResult | null) {
		//TODO: needs to be adapted
		if (cr == null ) {return;}
		this.#finalize(cr);
	}

	static fromJSON(json: string) : FinalizedCombatResult {
		const x = JSON.parse(json) as FinalizedCombatResult;
		//TODO need to fix for new constructor
		const ret = new FinalizedCombatResult(null);
		ret.attacks = x.attacks;
		ret.costs = x.costs;
		ret.tokenFlags = x.tokenFlags;
		ret.globalOtherEffects = x.globalOtherEffects;
		ret.id = x.id;
		return ret;
	}

	toJSON() : string {
		const obj = {
			attacks: this.attacks,
			costs: this.costs,
			tokenFlags: this.tokenFlags,
			globalOtherEffects : this.globalOtherEffects,
			id: this.id,
		};
		const json = JSON.stringify(obj);
		return json;
	}

	emptyCheck(debug = false) : this | undefined {
		if (debug) {
			Debug(this);
			// eslint-disable-next-line no-debugger
			debugger;
		}
		switch (true) {
			case this.attacks.length > 0:
			case this.costs.length > 0:
			case this.globalOtherEffects.length > 0:
			case this.sounds.length > 0:
				return this;
		}
		return undefined;
	}

	#evaluateDamage (dmg : ActorChange<ValidAttackers>["damage"]) : EvaluatedDamage[] {
		const dmgArr = Object.values(dmg)
			.map( v=> v.eval());
		return dmgArr.filter( damage => damage.hpChange != 0)
		;
	}

	#resolveActorChange (change : ActorChange<ValidAttackers>) : ResolvedActorChange<ValidAttackers> {
		const damage = this.#evaluateDamage(change.damage);

		const resolved : ResolvedActorChange<ValidAttackers> = {
			actor: change.actor,
			damage : damage,
			addStatus: change.addStatus,
			otherEffects: change.otherEffects,
			removeStatus: change.removeStatus,
		};
		return resolved;
	}

	#finalize(cr: CombatResult): void {
		const attacks  = Array.from(cr.attacks.entries()).map(
			([atkRes, change]) => {
				const changes = change.map( change => {
					return this.#resolveActorChange(change);
				});
				return {
					atkResult: atkRes,
					changes,
				} satisfies ResolvedAttackResult;
			});
		this.attacks = attacks;
		this.id = cr.id;
		this.costs = cr.costs.map( cost=> this.#resolveActorChange(cost));
		this.globalOtherEffects = cr.globalOtherEffects;
		this.sounds = cr.sounds;
		// this.clearFlags();
		for (const changes of cr.attacks.values()) {
			for (const change of changes) {
				this.#finalizeOtherEffects(change);
			}
		}
		for (const cost of cr.costs) {
			this.#finalizeOtherEffects(cost);
		}
	}


	#finalizeOtherEffects(change: ActorChange<ValidAttackers>) {
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
				case "extraTurn": {
					if (actor.hasStatus("baton-pass")) {
						//can't get bonus actions from baton pass
						break;
					}
					const bonusAction : StatusEffect = {
						id: "bonus-action",
						duration: { dtype:  "UEoT"},
						activationRoll: otherEffect.activation,
					};
					const extraTurnChange : ResolvedActorChange<ValidAttackers> = {
						actor:change.actor,
						damage: [],
						addStatus: [bonusAction],
						otherEffects: [],
						removeStatus: [],
					};
					this.costs.push(extraTurnChange);
					break;
				}
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
				case "play-sound":
				case "gain-levels":
					break;
				default:
					otherEffect satisfies never;
			}

		}
		// CombatResult.normalizeChange(change);
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
				{item.effects.push(flag);}
		}
	}

	hasFlag(actor: PersonaActor, flag: OtherEffect["type"]) : boolean{
		return Boolean(this.tokenFlags.find(x=> x.actor.actorId == actor.id)?.effects.find( eff=> eff.type == flag));

	}

	clearFlags() {
		this.tokenFlags = [];
	}

	async toMessage( effectName: string, initiator: PersonaActor | undefined) : Promise<ChatMessage> {
		if (!initiator) {
			const speaker = ChatMessage.getSpeaker();
			const msg = await ChatMessage.create( {
				speaker,
				content: "Userless triggered action PLACEHOLDER" ,
			});
			try {
				await this.autoApplyResult();
			} catch {
				await msg.setFlag("persona", "atkResult", this.toJSON());
			}
			return msg;
		}
		let initiatorToken : PToken | undefined;
		if (game.combat) {
			initiatorToken = PersonaCombat.getPTokenFromActorAccessor(initiator.accessor);
		}
		const rolls : RollBundle[] = this.attacks
		.flatMap( (attack) => attack.atkResult.roll? [attack.atkResult.roll] : []);
		const attacks = this.attacks.map( (attack)=> {
			return {
				attackResult: attack.atkResult,
				changes: attack.changes,
			};
		});
		const manualApply = !PersonaSettings.autoApplyCombatResults() || !game.users.contents.some( x=> x.isGM && x.active);
		const attackerName = initiator.token?.name ?? initiatorToken?.name ?? initiator.displayedName;
		const attackerToken = initiatorToken;
		const attackerPersona = initiator.isValidCombatant() && (initiator.basePersona.equals(initiator.persona())) ? initiator.persona(): undefined;
		const html = await foundry.applications.handlebars.renderTemplate("systems/persona/other-hbs/combat-roll.hbs", {attackerToken, attackerPersona, attackerName, effectName,  attacks, escalation: 0, result: this, costs: this.costs, manualApply});
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
			style: CONST?.CHAT_MESSAGE_STYLES.ROLL,
		}, {});
		if (manualApply) {
			await chatMsg.setFlag("persona", "atkResult", this.toJSON());
			return chatMsg;
		}
		try {
			await this.autoApplyResult();
		} catch (e) {
			await chatMsg.setFlag("persona", "atkResult", this.toJSON());
			PersonaError.softFail("Error with automatic result application", e);
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
		if (!gmTarget) {
			throw new PersonaError("Can't apply no GM connected");
		}
		const sendObj = {
			resultObj : this.toJSON(),
			sender: game.user.id,
		};
		try {
			await PersonaSockets.verifiedSend("COMBAT_RESULT_APPLY", sendObj, gmTarget.id);
		}
		catch (e) {
			switch (true) {
				case e instanceof TimeoutError: {
					PersonaError.softFail( "Timeout Error from Server", e);
					break;
				}
				case e instanceof VerificationFailedError :{
					PersonaError.softFail( "Verification Error on the GM computer", e);
					break;
				}
				case e instanceof SocketsNotConnectedError: {
					PersonaError.softFail( "Network Sockets not connected", e);
					break;
				}
				default:
					PersonaError.softFail( "Something went wrong with sending combat result", e);
			}
		}
	}

	static async applyHandler(x: SocketMessage["COMBAT_RESULT_APPLY"]) : Promise<void> {
		const {resultObj} = x;
		const result = FinalizedCombatResult.fromJSON(resultObj);
		await result.#apply();
	}

	async applyButton() {
		return this.#apply();
	}

	async #apply(): Promise<void> {
		try {
			await this.#processAttacks();
			await this.#applyCosts();
			await this.#applyGlobalOtherEffects();
		} catch (e) {
			PersonaError.softFail("Trouble executing combat result", e, this);
		}
	}

	async #processAttacks() {
		for (const {atkResult, changes} of this.attacks ) {
			switch (atkResult.result) {
				case "miss":
				case "absorb":
				case "block":
				case "reflect": {
					const power = PersonaDB.findItem(atkResult.power);
					if (power.system.type != "skillCard" && power.system.dmg_type != "healing") {
						await PersonaSFX.onDefend(PersonaDB.findToken(atkResult.target), atkResult.result);
					}
				}
			}
			let token: PToken | undefined;
			for (const change of changes) {
				if (change.actor.token)
					{token = PersonaDB.findToken(change.actor.token) as PToken;}
				const priorHP = token ?  token.actor.hp : 0;
				await this.applyChange(change);
				if (!token) {continue;}
				if (token.actor && !token.actor.isAlive() && priorHP > 0) {
					const attacker = PersonaDB.findToken(atkResult.attacker);
					//need to do constant zero HP checks instead of just checking here
					await this.#onDefeatOpponent(token, attacker);
				}
			}
		}
	}

	async #onDefeatOpponent(target: PToken, attacker ?: PToken) {
		const combat = game.combat as PersonaCombat | undefined;
		if (!combat) {return;}
		if (target.actor.isShadow()) {
			// const shadow = combat?.combatants.find( c=> c.token.id == target.id) as Combatant<PersonaActor> | undefined;
			const shadow = combat.findCombatant(target);
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
			};
			for (const comb of combat.combatants) {
				if (!comb.actor) {continue;}
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
				case "play-sound": {
					const promise  = PersonaSounds.playFile(eff.soundSrc, eff.volume ?? 1.0);
					if (eff.waitUntilFinished) {
						await promise;
					}
					break;
				}
				case "display-message": {
					if (!eff.newChatMsg) {break;}
					const html = eff.msg;
					const speaker : Foundry.ChatSpeakerObject = {
						alias: "System"
					};
					await ChatMessage.create( {
						speaker,
						content: html,
						style: CONST?.CHAT_MESSAGE_STYLES.OTHER,
					});
					break;
				}
			}
		}
	}

	async applyChange(change: ResolvedActorChange<ValidAttackers>) {
		const actor = PersonaDB.findActor(change.actor);
		const token  = change.actor.token ? PersonaDB.findToken(change.actor.token) as PToken: undefined;
		for (const dmg of change.damage)  {
			try {
				await this.applyDamage(actor, token, dmg);
			} catch (e) {
				PersonaError.softFail(`Error applying Damage to ${actor.name}`, e);
			}
		}
		for (const status of change.addStatus) {
			if (await actor.addStatus(status) && token) {
				Hooks.callAll("onAddStatus", token, status);
			}
		}
		for (const status of change.removeStatus) {
			await actor.removeStatus(status);
		}
		const mpmult = 1;
		const mutableState =  {
			mpCost: 0,
		};
		for (const otherEffect of change.otherEffects) {
			try {
				await this.applyOtherEffect(actor, token, otherEffect, mutableState);
			} catch (e) {
				PersonaError.softFail(`Error trying to execute ${otherEffect.type} on ${actor.name}`, e);
			}
		}
		if (mutableState.mpCost != 0 && actor.system.type != "shadow") {
			mutableState.mpCost *= mpmult;
			await (actor as PC).modifyMP(mutableState.mpCost);
		}
	}

	async applyDamage(actor: ValidAttackers, token: PToken | undefined, dmg: EvaluatedDamage) {
		if (Number.isNaN(dmg.hpChange)) {
			PersonaError.softFail("NaN damage!");
			return;
		}
		if (dmg.hpChange == 0) {return;}
		if (dmg.hpChange < 0) {
			setTimeout( async () => {
				const CR = await TriggeredEffect
					.autoTriggerToCR("on-damage", actor);
				if (CR) {
					await CR?.toMessage("Reaction (Taking Damage)" , actor);
				}
			});
		}
		if (token) {
			const power = this.power;
			if (power && !power.isAoE()) {
				await PersonaSFX.onDamage(token, dmg.hpChange, dmg.damageType, power);
			}
			Hooks.callAll("onTakeDamage", token, dmg.hpChange, dmg.damageType);
		}
		await actor.modifyHP(dmg.hpChange);
	}

	async applyOtherEffect(actor: ValidAttackers, token: PToken | undefined, otherEffect:OtherEffect, mutableState: {mpCost: number}): Promise<void> {
		switch (otherEffect.type) {
			case "expend-item":
				if (otherEffect.itemAcc) {
					const item = PersonaDB.findItem(otherEffect.itemAcc);
					if (!item) {
						PersonaError.softFail(`Couldn't find personal Item to expend ${JSON.stringify(otherEffect.itemAcc)}`);
						return;
					}
					if ( item.parent) {
						await item.parent.expendConsumable(item);
					}
					return;
				}
				break;
			case "save-slot":
				break;
			case "half-hp-cost":
				break;
			case "extraTurn":
				break;
			case "set-flag":
				await actor.setEffectFlag(otherEffect.flagId, otherEffect.state, otherEffect.duration, otherEffect.flagName);
				break;
			case "teach-power": {
				const power = PersonaDB.allPowers().get(otherEffect.id);
				if (power && (actor.isPC() || actor.isNPCAlly())) {
					await actor.persona().learnPower(power);
				}
				break;
			}
			case "lower-resistance":
			case "raise-resistance":
			case "add-power-to-list":
			case "display-message":
				break;
			case "inspiration-cost":
				if (actor.system.type == "pc") {
					await (actor as PC).spendInspiration(otherEffect.linkId, otherEffect.amount);
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
				if (actor.isShadow()) {
					if (otherEffect.downgrade == false) {
						await actor.increaseScanLevel(otherEffect.level);
						void PersonaSFX.onScan(token, otherEffect.level);
					} else {
						await actor.decreaseScanLevel(otherEffect.level ?? 0);
					}
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
						mutableState.mpCost += otherEffect.amount;
						break;
					case "percent-of-total":
						mutableState.mpCost += actor.mmp * (otherEffect.amount / 100);
						break;

					default:
						otherEffect.subtype satisfies never;
						// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
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
			case "alter-variable": {
				const varCons = otherEffect;
				switch (varCons.varType) {
					case "actor": {
						await PersonaVariables.alterVariable(varCons, varCons.contextList);
						break;
					}
					case "global":
					case "scene":
					case "social-temp": {
						await PersonaVariables.alterVariable(varCons, varCons.contextList);
						break;
					}
				}
				break;
			}
			case "perma-buff":
				await actor.addPermaBuff(otherEffect.buffType, otherEffect.value ?? 0);
				break;
			case "play-sound":
					await PersonaSounds.playFile(otherEffect.soundSrc);
				break;
			case "gain-levels": {
				const {gainTarget, value}=  otherEffect;
				if (!value) {break;}
				if (gainTarget == "persona" || gainTarget == "both") {
					await actor.persona().gainLevel(value);
				}
				if (gainTarget == "actor" || gainTarget == "both") {
					await actor.gainLevel(value);
				}
				void PersonaSFX.onLevelUp();
				break;
			}
			default:
				otherEffect satisfies never;
		}
	}

	// static addPending(res: FinalizedCombatResult): Promise<unknown> {
	// 	const promise = new Promise(
	// 		(resolve, reject) => {
	// 			this.pendingPromises.set(res.id, resolve);
	// 			setTimeout( () => {
	// 				this.pendingPromises.delete(res.id);
	// 				reject(new TimeoutError("Timeout"));
	// 			}	, 16000);
	// 		});
	// 	return promise;

	// }

// 	static resolvePending( resId: CombatResult["id"]) {
// 		const resolver = this.pendingPromises.get(resId);
// 		if (!resolver) {throw new Error(`No Resolver for ${resId}`);}
// 		resolver(undefined);
// 		this.pendingPromises.delete(resId);
// 	}

	get power() : UsableAndCard | undefined {
		for (const {atkResult} of this.attacks) {
			if (atkResult.power) {
				return PersonaDB.findItem(atkResult.power);
			}
		}
		return undefined;
	}

	findEffects<T extends OtherEffect["type"]>(effectType: T): (OtherEffect & {type:T})[] {
		const arr = [] as (OtherEffect & {type:T})[];
		for (const v of this.attacks) {
			for (const eff of v.changes.flatMap(chg => chg.otherEffects) ) {
				if (eff.type == effectType)
					{arr.push( eff as OtherEffect & {type:T});}
			}
		}
		for (const eff of this.costs.flatMap(chg => chg.otherEffects) ) {
			if (eff.type == effectType)
				{arr.push( eff as OtherEffect & {type:T});}
		}
		return arr;
	}

}

export interface ResolvedActorChange<T extends PersonaActor> {
	actor: UniversalActorAccessor<T>;
	damage: EvaluatedDamage[];
	addStatus: StatusEffect[],
	otherEffects: OtherEffect[]
	removeStatus: Pick<StatusEffect, "id">[],
	// attackResult: AttackResult | null,
	// expendSlot: [number, number, number, number];
}

interface ResolvedAttackResult<T extends ValidAttackers = ValidAttackers> {
	atkResult: AttackResult;
	changes: ResolvedActorChange<T>[];

}

Hooks.on("renderChatMessageHTML", (msg: ChatMessage, htm: HTMLElement) => {
	const html = $(htm);
	const flag = msg.getFlag("persona", "atkResult") as string;
	if (!flag) {
		html.find(".applyChanges").each( function () { this.remove();});
	}
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	html.find(".applyChanges").on("click", async () => {
		const flag = msg.getFlag("persona", "atkResult") as string;
		if (!flag) {throw new PersonaError("Can't apply twice");}
		if (!game.user.isGM) {
			throw new PersonaError("Only GM can click this");
		}
		const res = FinalizedCombatResult.fromJSON(flag);
		await res.applyButton();
		await msg.unsetFlag("persona", "atkResult");
	});
});


Hooks.on("socketsReady", () => {
	PersonaSockets.setHandler("COMBAT_RESULT_APPLY", FinalizedCombatResult.applyHandler.bind(CombatResult));
	// PersonaSockets.setHandler("COMBAT_RESULT_APPLIED", FinalizedCombatResult.resolvedHandler.bind(CombatResult));
});

Hooks.on("updateActor", async (updatedActor : PersonaActor, changes) => {
	//open scan prompt for all players on scan
	if (game.user.isGM) {return;}
	if (updatedActor.system.type == "shadow") {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if (changes?.system?.scanLevel && updatedActor.token) {
			await updatedActor.sheet.render(true);
		}
	}
});


// function absMax(...nums : number[]) {
// 	const absnums = nums.map( x=> Math.abs(x));
// 	const maxabs = Math.max(...absnums);
// 	const index = absnums.indexOf(maxabs);
// 	return nums[index];
// }

