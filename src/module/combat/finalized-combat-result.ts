/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { PersonaVariables } from "../persona-variables.js";
import { PersonaSounds } from "../persona-sounds.js";
import { Metaverse } from "../metaverse.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { PersonaSFX } from "./persona-sfx.js";
import { RollBundle } from "../persona-roll.js";
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
import { ValidSound } from "../persona-sounds.js";
import { PersonaDB } from "../persona-db.js";
import { ActorChange } from "./combat-result.js";
import {SocketsNotConnectedError, TimeoutError, VerificationFailedError} from "../utility/socket-manager.js";
import {RealDamageType} from "../../config/damage-types.js";
import {TreasureSystem} from "../exploration/treasure-system.js";
import {NavigatorVoiceLines} from "../navigator/nav-voice-lines.js";
import {CombatOutput} from "./combat-output.js";

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
	chainedResults: FinalizedCombatResult[]= [];

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
		ret.chainedResults = x.chainedResults.map( subresult=> FinalizedCombatResult.fromJSON(JSON.stringify(subresult)));
		return ret;
	}

	toJSON() : string {
		const obj = {
			attacks: this.attacks,
			costs: this.costs,
			tokenFlags: this.tokenFlags,
			globalOtherEffects : this.globalOtherEffects,
			id: this.id,
			chainedResults: this.chainedResults,
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
			case this.chainedResults.length > 0:
				return this;
		}
		return undefined;
	}

	static changeIsEmpty( change: ResolvedActorChange<ValidAttackers>) : boolean {
		return change.addStatus.length == 0
			&& change.damage.length == 0
			&& change.otherEffects.length == 0
			&& change.removeStatus.length == 0;
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
		for (const atk of this.attacks) {
			atk.changes = atk.changes
				.filter (chg => !FinalizedCombatResult.changeIsEmpty(chg));
		}
		this.id = cr.id;
		this.costs = cr.costs
		.map( cost=> this.#resolveActorChange(cost))
		.filter( cost => !FinalizedCombatResult.changeIsEmpty(cost));
		this.globalOtherEffects = cr.globalOtherEffects;
		this.sounds = cr.sounds;
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
					ui.notifications.warn("Save Slot is deprecated");
					break;
				case "half-hp-cost":
					ui.notifications.warn("Half HP cost is deprecated");
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
					change.addStatus.push(bonusAction);
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
				case "alter-theurgy":
				case "combat-effect":
				case "alter-fatigue-lvl":
				case "perma-buff":
				case "alter-variable":
				case "play-sound":
				case "gain-levels":
				case "cancel":
				case "set-hp":
				case "inventory-action":
				case "apply-recovery":
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

	// async HTMLHeader(effectName: string,  initiator: PersonaActor | undefined) : Promise<string> {
	// 	if (!initiator) {return "";}
	// 	let initiatorToken : PToken | undefined;
	// 	if (game.combat) {
	// 		initiatorToken = PersonaCombat.getPTokenFromActorAccessor(initiator.accessor);
	// 	}
	// 	const attackerToken = initiatorToken;
	// 	const attackerPersona = (initiator.isValidCombatant() && (
	// 		initiator.persona().isPersona()
	// 		|| initiator.persona().source.hasBuiltInPersona()
	// 	))	? initiator.persona(): undefined;
	// 	const attackerName = initiator.token?.name ?? initiatorToken?.name ?? initiator.displayedName;
	// 	const html = await foundry.applications.handlebars.renderTemplate("systems/persona/other-hbs/combat-roll-header.hbs", {attackerToken, attackerPersona, attackerName, effectName});
	// 	return html;
	// }

	// async HTMLBody(): Promise<string> {
	// 	this.compressChained();
	// 	const attacks = this.attacks.map( (attack)=> {
	// 		return {
	// 			attackResult: attack.atkResult,
	// 			changes: attack.changes,
	// 		};
	// 	});
	// 	const html = await foundry.applications.handlebars.renderTemplate("systems/persona/other-hbs/combat-roll-body.hbs", {attacks, escalation: 0, result: this, costs: this.costs});
	// 	return html;
	// }

	async toMessage( header: string) : Promise<ChatMessage>;
	async toMessage( effectName: string, initiator: U<PersonaActor>) : Promise<ChatMessage>;
	async toMessage( effectNameOrHeader: string, initiator?: U<PersonaActor>) : Promise<ChatMessage> {
		let initiatorToken : PToken | undefined;
		if (game.combat) {
			initiatorToken = initiator ? PersonaCombat.getPTokenFromActorAccessor(initiator.accessor) : undefined;
		}
		const output = new CombatOutput(this, initiatorToken);
		try {
			await this.autoApplyResult();
			return await output.renderMessage(effectNameOrHeader, initiator);
		} catch (e) {
			const html = await output.generateHTML(effectNameOrHeader, initiator);
			const rolls : RollBundle[] = this.attacks
				.flatMap( (attack) => attack.atkResult.roll? [attack.atkResult.roll] : []);
			PersonaError.softFail("Error with automatic result application", e, this, html);
			return await ChatMessage.create( {
				speaker: {
					scene: initiatorToken?.parent?.id ?? initiator?.token?.parent.id,
					actor: initiatorToken?.actor?.id ?? initiator?.id,
					token:  initiatorToken?.id,
					alias: initiatorToken?.name ?? "System",
				},
				rolls: rolls.map( rb=> rb.roll),
				content: "ERROR WITH APPLYING COMBAT RESULT",
				user: game.user,
				style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			}, {});
		}
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

	async applyButtonTrigger() {
		return this.#apply();
	}

	async #apply(): Promise<void> {
		Debug(this);
		try {
			await this.#processAttacks();
			await this.#applyCosts();
			await this.#applyGlobalOtherEffects();
			await this.#applyChained();
		} catch (e) {
			PersonaError.softFail("Trouble executing combat result", e, this);
		}
	}

	hasCancelRequest() : boolean {
		return this.globalOtherEffects.some(
			eff => eff.type == "cancel"
		);
	}

	async #applyChained() {
		for (const res of this.chainedResults) {
			await res.#apply();
		}
	}

	async #processAttacks() {
		const power = this.power && !this.power.isSkillCard() ? this.power : undefined;
		for (const {atkResult, changes} of this.attacks ) {
			switch (atkResult.result) {
				case "miss":
				case "absorb":
				case "block":
				case "reflect": {
				}
			}
			let token: PToken | undefined;
			for (const change of changes) {
				if (change.actor.token)
				{
					token = PersonaDB.findToken(change.actor.token) as PToken;
				}
				const priorHP = token ?  token.actor.hp : 0;
				await this._applyChange(change, power, atkResult.attacker);
				if (!token) {continue;}
				if (token.actor
					&& !token.actor.isAlive()
					&& priorHP > 0) {
					const attacker = PersonaDB.findToken(atkResult.attacker);
					await this.#onDefeatOpponent(token, attacker);
				}
			}
		}
	}

	addChained( otherResult: U<FinalizedCombatResult>) : this {
		if (
			!otherResult
			||  !otherResult.emptyCheck()
		) { return this; }
		this.chainedResults.push(otherResult);
		return this;
	}

	compressChained() : this {
		for (const chain of this.chainedResults) {
			chain.compressChained();
			this.attacks.push(...chain.attacks);
			this.globalOtherEffects.push(...chain.globalOtherEffects);
			this.costs.push(...chain.costs);
			this.sounds.push(...chain.sounds);
			this.tokenFlags.push(...chain.tokenFlags);
		}
		this.chainedResults = [];
		return this;
	}

	async #onDefeatOpponent(target: PToken, attacker ?: PToken) {
		const combat = game.combat as PersonaCombat | undefined;
		if (!combat) {return;}
		if (target.actor.isShadow()) {
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
				this.addChained((await TriggeredEffect.onTrigger("on-kill-target", comb.actor, situation)).finalize());
			}
		}
		void NavigatorVoiceLines.onTargetKilled(target.actor, combat);
	}

	async #applyCosts() {
		const power = this.power && !this.power.isSkillCard() ? this.power : undefined;
		for (const cost of this.costs) {
			await this._applyChange(cost, power);
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

	private async _applyChange(change: ResolvedActorChange<ValidAttackers>, power: U<Usable>, attacker ?: UniversalTokenAccessor<PToken>) {
		const actor = PersonaDB.findActor(change.actor);
		const token  = change.actor.token ? PersonaDB.findToken(change.actor.token) as PToken: undefined;
		for (const status of change.addStatus) {
			const statusAdd = await actor.addStatus(status);
			if (statusAdd && attacker) {
				const attackerActor = PersonaDB.findToken(attacker)?.actor;
				if (attackerActor) {
					const situation : Situation= {
						target: actor.accessor,
						user: actor.accessor,
						triggeringCharacter: actor.accessor,
						attacker: attackerActor.accessor,
						trigger : "on-inflict-status",
						usedPower: power?.accessor,
						statusEffect: status.id,
						triggeringUser: game.user,
					};
					this.addChained((await TriggeredEffect.onTrigger("on-inflict-status", actor, situation)).finalize());
				}
			}
			if (statusAdd && token) {
				Hooks.callAll("onAddStatus", token, status);
			}
		}
		for (const dmg of change.damage)  {
			try {
				await this._applyDamage(actor, token, dmg, power, attacker);
			} catch (e) {
				PersonaError.softFail(`Error applying Damage to ${actor.name}`, e);
			}
		}
		for (const status of change.removeStatus) {
			await actor.removeStatus(status);
		}
		const mpmult = 1;
		const mutableState =  {
			mpCost: 0,
			theurgy: 0,
		} satisfies MutableActorState;
		for (const otherEffect of change.otherEffects) {
			try {
				await this._applyOtherEffect(actor, token, otherEffect, mutableState);
			} catch (e) {
				PersonaError.softFail(`Error trying to execute ${otherEffect.type} on ${actor.name}`, e);
			}
		}
		if (mutableState.theurgy != 0 && !actor.isShadow()) {
			console.log(`Modify Theurgy: ${mutableState.theurgy}`);
			await actor.modifyTheurgy(mutableState.theurgy);
		}
		if (mutableState.mpCost != 0 && !actor.isShadow()) {
			mutableState.mpCost *= mpmult;
			await (actor as PC).modifyMP(mutableState.mpCost);
		}
	}

	private async _applyDamage(actor: ValidAttackers, token: PToken | undefined, dmg: EvaluatedDamage, power: Usable | undefined, attackerToken ?: UniversalTokenAccessor<PToken>) {
		if (Number.isNaN(dmg.hpChange)) {
			PersonaError.softFail("NaN damage!");
			return;
		}
		if (dmg.hpChange == 0) {return;}
		if (dmg.hpChange < 0) {
			const attacker = attackerToken ? PersonaDB.findToken(attackerToken).actor.accessor : undefined;
			const actorAcc = actor.accessor;
			const situation : Situation =  {
				user: actorAcc,
				usedPower: power?.accessor,
				triggeringCharacter: actorAcc,
				target: actorAcc,
				attacker,
				amt: -dmg.hpChange,
				damageType: dmg.damageType,
				triggeringUser: game.user,
			};
			const preCR = (await TriggeredEffect.onTrigger("pre-take-damage", actor, situation)).finalize();
			if (preCR.hasCancelRequest()) {
				this.addChained(preCR);
				return;
			}
			const CR = (await TriggeredEffect
				.autoTriggerToCR("on-damage", actor, situation))
				?.finalize();
			this.addChained(CR);
		}
		if (power) {
			PersonaSFX.onDamage(token, dmg.hpChange, dmg.damageType, power);
		}
		if (token) {
			const power = this.power;
			if (power && !power.isAoE()) {
				await PersonaSFX.onSingleTargetDamage(token, dmg.hpChange, dmg.damageType, power);
			}
			Hooks.callAll("onTakeDamage", token, dmg.hpChange, dmg.damageType);
		}
		await actor.modifyHP(dmg.hpChange);
	}

	private async _applyOtherEffect(actor: ValidAttackers, token: PToken | undefined, otherEffect:OtherEffect, mutableState: MutableActorState): Promise<void> {
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
				await actor.setEffectFlag(otherEffect);
				break;
			case "teach-power": {
				if (!actor.isPC() && !actor.isNPCAlly()) {
					break;
				}
				const persona = actor.persona();
				if (otherEffect.randomPower == false) {
					const power = PersonaDB.allPowers().get(otherEffect.id);
					if (power) {
						await persona.learnPower(power);
					}
				} else {
					const highest = persona.highestPowerSlotUsable();
					let safetyBreak = 0;
					while (true) {
						const power = TreasureSystem.randomPower(highest);
						if (!power) {break;}
						if (!persona.knowsPowerInnately(power)) {
							await persona.learnPower(power);
							break;
						}
						if (++safetyBreak > 100) {
							PersonaError.softFail("Error trying to add random Power, couldn't find candidate");
							break;
						}
					}
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
				if (actor.isShadow()) {
					await actor.alterEnergy(otherEffect.amount);
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
						otherEffect satisfies never;
						// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
						PersonaError.softFail(`Bad subtype for Alter MP effect : ${otherEffect["subtype"]}`);
				}
				break;
			case "alter-theurgy":
				switch (otherEffect.subtype) {
					case "direct":
						mutableState.theurgy += otherEffect.amount;
						break;
					case "percent-of-total":
						mutableState.theurgy += actor.mmp * (otherEffect.amount / 100);
						break;
					default:
						otherEffect satisfies never;
						// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
						PersonaError.softFail(`Bad subtype for Alter Theurgy effect : ${otherEffect["subtype"]}`);
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
						await PersonaVariables.alterVariable(varCons, varCons.situation);
						break;
					}
					case "global":
					case "scene":
					case "social-temp": {
						await PersonaVariables.alterVariable(varCons, varCons.situation);
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
			case "cancel":
				break;
			case "set-hp": {
				let newhp : number;
				switch (otherEffect.subtype) {
					case "set-to-const":
						newhp = otherEffect.value;
						break;
					case "set-to-percent":
						newhp = otherEffect.value * actor.mhp;
						break;
				}
				await actor.setHP(newhp);
				break;
			}
			case "inventory-action":
				await this.resolveInventoryAction(actor, otherEffect);
				break;
			case "apply-recovery" :
				await actor.spendRecovery(null);
				break;

			default:
				otherEffect satisfies never;
		}
	}

	async resolveInventoryAction( actor: PersonaActor,  otherEffect: OtherEffect & {type: "inventory-action"}) : Promise<void> {
		const amount = typeof otherEffect.amount == "number" ? otherEffect.amount ?? 1 : 1;
		switch (otherEffect.invAction) {
			case "add-item": {
				const item = PersonaDB.getItemById(otherEffect.itemId);
				if (!item) {
					PersonaError.softFail(`Can't find Item for add-item: ${otherEffect.itemId}`);
					break;
				}
				if (item.isCarryableType()) {
					await actor.addItem(item, amount);
				}
			}
				break;
			case "add-treasure": {
				const treasureLevel = typeof otherEffect.treasureLevel == "number" ? otherEffect.treasureLevel ?? 0 : 0;
				const treasures = TreasureSystem.generate(treasureLevel, otherEffect.treasureModifier ?? 0, otherEffect.minLevel ?? 0);
				for (const treasure of treasures) {
					await actor.addTreasureItem(treasure);
				}
				break;
			}
			case "remove-item": {
				const item = PersonaDB.getItemById(otherEffect.itemId);
				if (!item) {
					PersonaError.softFail(`Can't find Item for add-item: ${otherEffect.itemId}`);
					break;
				}
				if (!item.isCarryableType()) {
					PersonaError.softFail(`Can't remove non-carryable type: ${item.name}`);
					break;
				}
				await actor.expendConsumable(item,amount);
				break;
			}
			default:
				otherEffect satisfies never;
				break;
		}
	}

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
		await res.applyButtonTrigger();
		await msg.unsetFlag("persona", "atkResult");
	});
});


Hooks.on("socketsReady", () => {
	PersonaSockets.setHandler("COMBAT_RESULT_APPLY", FinalizedCombatResult.applyHandler.bind(CombatResult));
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

declare global {
	interface HOOKS {
		'onAddStatus': (token: PToken, status: StatusEffect) => unknown;
		'onTakeDamage': (token: PToken, amount: number, damageType: RealDamageType)=> unknown;
	}
}

type MutableActorState = {
			mpCost: number,
			theurgy: number,
};
