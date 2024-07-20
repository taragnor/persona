import { ConditionTarget } from "../../config/precondition-types.js";
import { ConsTarget } from "./combat-result.js";
import { PersonaSocial } from "../social/persona-social.js"
import { testPreconditions } from "../preconditions.js"
import { UniversalModifier } from "../item/persona-item.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";
import { CombatTrigger } from "../../config/triggers.js";
import { BASIC_POWER_NAMES } from "../../config/basic-powers.js";
import { PersonaSFX } from "./persona-sfx.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { PersonaSockets } from "../persona.js";
import { StatusEffect } from "./combat-result.js";
import { DamageType } from "../../config/damage-types.js";
import { ModifierContainer } from "../item/persona-item.js";
import { Consequence } from "./combat-result.js";
import { TurnAlert } from "../utility/turnAlert.js";
import { PersonaAE } from "../active-effect.js";
import { EngagementChecker } from "./engageChecker.js";
import { Metaverse } from "../metaverse.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { HTMLTools } from "../utility/HTMLTools.js";

import { PersonaError } from "../persona-error.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { CombatResult } from "./combat-result.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { ModifierList } from "./modifier-list.js";
import { Situation } from "../preconditions.js";
import { AttackResult } from "./combat-result.js";
import { Usable } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";
import { RollBundle } from "../persona-roll.js";
import { UniversalTokenAccessor } from "../utility/db-accessor.js";
import { EngagementList } from "./engagementList.js";
import { Logger } from "../utility/logger.js";
import { OtherEffect } from "./combat-result.js";
import { Consumable } from "../item/persona-item.js";

declare global {
	interface SocketMessage {
"QUERY_ALL_OUT_ATTACK" : {};
	}
}

declare global {
	interface HOOKS {
		"onUsePower": (power: Usable, user: PToken, defender: PToken) => any;
		"onTakeDamage": (token: PToken, amount: number, damageType: DamageType)=> any;
		"onAddStatus": (token: PToken, status: StatusEffect) => any;
	}
}

type AttackRollType = "activation" | "standard" | "reflect" | number; //number is used for bonus attacks

export class PersonaCombat extends Combat<PersonaActor> {

	// engagedList: Combatant<PersonaActor>[][] = [];
	_engagedList: EngagementList;
	static customAtkBonus: number

	override async startCombat() {
		let msg = "";
		this._engagedList = new EngagementList(this);
		await this._engagedList.flushData();
		const assumeSocial = !(this.combatants.contents.some(comb=> comb.actor && comb.actor.system.type == "shadow"));
		const combatInit = await this.roomEffectsDialog(assumeSocial);
		this.setSocialEncounter(combatInit.isSocialScene);
		if (combatInit.isSocialScene) {
			await PersonaSocial.startSocialCombatTurn(combatInit.disallowMetaverse, combatInit.advanceCalendar);
		}
		const mods = combatInit.roomModifiers;
		this.setRoomEffects(mods);
		await this.setEscalationDie(0);
		if (mods.length > 0) {
			msg += "<u><h2>Room Effects</h2></u><ul>";
			msg += mods.map( x=> `<li><b>${x.name}</b> : ${x.system.description}</li>`).join("");
			msg += "</ul>";
		}
		if (msg.length > 0) {
			const messageData = {
				speaker: {alias: "Combat Start"},
				content: msg,
				type: CONST.CHAT_MESSAGE_TYPES.OOC,
			};
			ChatMessage.create(messageData, {});
		}
		return await super.startCombat();
	}

	get validCombatants() : Combatant<ValidAttackers>[] {
		return this.combatants.contents
			.filter( x=> x.actor != undefined
				&& x.actor.system.type != "npc"
			) as Combatant<ValidAttackers>[];
	}

	override get combatant() : Option<Combatant<ValidAttackers>>{
		return super.combatant as Option<Combatant<ValidAttackers>>;
	}

	async startCombatantTurn( combatant: Combatant<ValidAttackers> ){
		const rolls :RollBundle[] = [];
		const actor = combatant.actor;
		if (!actor) return;
		if (actor.isOwner && !game.user.isGM)
			TurnAlert.alert();
		if (!game.user.isGM) return;
		for (const effect of actor.effects) {
			if (effect.statuses.has("blocking")) {
				await effect.delete();
			}
			if (effect.statusDuration == "USoNT")  {
				await Logger.sendToChat(`Removed condition: ${effect.displayedName} at start of turn`, actor);
				await effect.delete();
			}
		}
		let startTurnMsg=[ `<u><h2> Start of ${combatant.token.name}'s turn</h2></u><hr>`];
		startTurnMsg = startTurnMsg.concat(await this.handleStartTurnEffects(combatant));
		if (combatant.actor.isCapableOfAction()) {
			const accessor = PersonaDB.getUniversalTokenAccessor(combatant.token);
			if (this.isEngaged(accessor)) {
				const DC = undefined;
				const {total, rollBundle} = await PersonaCombat.disengageRoll(actor, DC);
				rolls.push(rollBundle);
				let disengageResult = "failed";

				if (total >= 11) disengageResult = "normal";
				if (total >= 16) disengageResult = "hard";
				startTurnMsg.push("<br>"+ await renderTemplate("systems/persona/parts/disengage-check.hbs", {rollBundle, disengageResult}));
			}
		}
		const speaker = ChatMessage.getSpeaker({alias: actor.name});
		let messageData = {
			speaker: speaker,
			content: startTurnMsg.join("<br>"),
			type: CONST.CHAT_MESSAGE_TYPES.OOC,
			rolls: rolls.map(r=> r.roll),
			sound: rolls.length > 0 ? CONFIG.sounds.dice : undefined

		};
		ChatMessage.create(messageData, {});
	}


	async skipBox(msg: string) {
		if (await HTMLTools.confirmBox(msg, msg)) {
			this.nextTurn();
		}
	}

	async endCombatantTurn(combatant: Combatant<ValidAttackers>) {
		const actor = combatant.actor;
		if (!actor) return;
		if (!game.user.isOwner) return;
		const burnStatus = actor.effects.find( eff=> eff.statuses.has("burn"));
		if (burnStatus) {
			const damage = burnStatus.potency;
			await actor.modifyHP(-damage);
		}
		for (const effect of actor.effects) {
			switch (effect.statusDuration) {
				case "UEoNT":
					if (effect.duration.startRound != this.round) {
						await Logger.sendToChat(`Removed condition: ${effect.displayedName} at end of turn`, actor);
						await effect.delete();
					}
					break;
				case "save-hard":
				case "save-easy":
				case "save-normal":
					const DC = this.getStatusSaveDC(effect);
					const {success} = await PersonaCombat.rollSave(actor, { DC, label:effect.name, saveVersus:effect.statusId })
					if (success) {
						await Logger.sendToChat(`Removed condition: ${effect.displayedName} from saving throw`, actor);
						await effect.delete();
					}
					break;
				case "3-rounds":
					break;
				case "UEoT":
					await Logger.sendToChat(`Removed condition: ${effect.displayedName} at end of turn`, actor);
					await effect.delete();
					break;
				case "instant":
					await effect.delete();
					break;
				case"presave-easy":
				case"presave-hard":
				case"presave-normal":
				case "USoNT":
				case "expedition":
				case "permanent":
				case "combat":
					break;
				default:
					effect.statusDuration satisfies never;
			}
		}
	}

	async handleFading(combatant: Combatant<ValidAttackers>): Promise<string[]> {
		let Msg :string[] = [];
		const actor= combatant.actor;
		if (!actor) return [];
		if (actor.hp <= 0 && actor.system.type == "pc") {
			if (actor.system.combat.fadingState < 2) {
				Msg.push(`${combatant.name} is fading...`);
				const {success} = await PersonaCombat.rollSave(actor, { DC:11, label: "Fading Roll", saveVersus:"fading"});
				if (!success) {
					const newval = actor.system.combat.fadingState +1;
					await actor.setFadingState(newval);
					if (newval >= 2) {
						Msg.push(`<b>${combatant.name} is compeltely faded!`);
					}
				}
			} else {

				Msg.push(`${combatant.name} is totally faded!`);

			}
			Msg.push( `${combatant.name} can fight in spirit!`);
		}
		return Msg;

	}

	async handleStartTurnEffects(combatant: Combatant<ValidAttackers>): Promise<string[]> {
		const actor= combatant.actor;
		if (!actor) return [];
		let Msg: string[] = [];
		Msg = Msg.concat(await this.handleFading(combatant));
		for (const effect of actor.effects) {
			let DC = this.getStatusSaveDC(effect);
			switch (effect.statusDuration) {
				case "presave-easy":
				case "presave-normal":
				case "presave-hard":
					const {success, total} = await PersonaCombat.rollSave(actor, { DC, label:effect.name, saveVersus:effect.statusId})
					if (success) {
						Msg.push(`Removed condition: ${effect.displayedName} from saving throw`);
						await effect.delete();
						break;
					}
					Msg = Msg.concat( await this.preSaveEffect(total, effect, actor));
					break;
				case "expedition":
				case "combat":
				case "save-normal":
				case "save-easy":
				case "save-hard":
				case "UEoNT":
				case "UEoT":
				case "permanent":
					break;
				case "instant":
				case "USoNT":
					Msg.push( `<br> ${effect.displayedName} has expired`);
					await effect.delete();
					break;
				case "3-rounds":
					if (effect.statuses.has("confused")) {
						const {success, total} = await PersonaCombat.rollSave(actor, { DC, label:effect.name, saveVersus:effect.statusId})
						if (!success) {
							Msg = Msg.concat( await this.preSaveEffect(total, effect, actor));
						}
					}
					const rounds = effect.duration.rounds ?? 0;
					if (rounds<= 0) {
						Msg.push(`<br>${effect.displayedName} has expired.`);
						await effect.delete();
						break;
					}
					else  {
						await effect.update({"duration.rounds" : rounds-1});
						break;
					}
				default:
						effect.statusDuration satisfies never;
			}

		}
		const debilitatingStatuses :StatusEffectId[] = [
			"sleep",
			"frozen",
			"shock"
		];
		const debilitatingStatus = actor.effects.find( eff=> debilitatingStatuses.some( debil => eff.statuses.has(debil)));
		if (debilitatingStatus) {
			const msg =  `${combatant.name} can't take actions normally because of ${debilitatingStatus.name}`
			Msg.push(msg) ;
			if (actor.system.type == "shadow") {
				this.skipBox(`${msg}. <br> Skip turn?`); //don't await this so it processes the rest of the code
			}
		}
		const burnStatus = actor.effects.find( eff=> eff.statuses.has("burn"));
		if (burnStatus) {
			const damage = burnStatus.potency;
			Msg.push(`${combatant.name} is burning and will take ${damage} damage at end of turn. (original Hp: ${actor.hp}`);
		}

		return Msg;
	}

	getStatusSaveDC(effect: PersonaAE) {
		switch (effect.statusDuration) {
			case "save-hard":
				return 16;
			case "save-normal":
				return 11;
			case "save-easy":
				return 6;
			case "presave-hard":
				return 16;
			case "presave-normal":
				return 11;
			case "presave-easy":
				return 6;
			default:
				return 2000;
		}
	}

	get engagedList() : EngagementList {
		if (!this._engagedList)  {
			this._engagedList = new EngagementList(this);
		}
		return this._engagedList;
	}

	static async checkPowerPreqs(attacker: PToken, power: Usable) : Promise<boolean> {
		const combat = game.combat as PersonaCombat;
		if (combat && !combat.turnCheck(attacker)) {
			if (!game.user.isGM) {
				if (!await HTMLTools.confirmBox("Out of turn Action", "It's not your turn, act anyway?")) {
					return false;
				}
			}
			else {
				if (!await HTMLTools.confirmBox("Out of turn Action", "It's not your turn, act anyway?")) {
					return false;
				}
			}
		}
		if (!attacker.actor.canPayActivationCost(power)) {
			ui.notifications.notify("You can't pay the activation cost for this power");
			return false;
		}
		return true;
	}

	static async usePower(attacker: PToken, power: Usable) : Promise<CombatResult> {
		if (!await this.checkPowerPreqs(attacker, power)) {
			return new CombatResult();
		}
		try {
			const targets = await this.getTargets(attacker, power);
			if (targets.some( target => target.actor.system.type == "shadow" ) ) {
				this.ensureCombatExists();
			}
			this.customAtkBonus = await HTMLTools.getNumber("Attack Modifier");
			const result = new CombatResult();
			if (power.name == BASIC_POWER_NAMES[2]) {
				PersonaSFX.play("all-out");
			}
			result.merge(await  this.#usePowerOn(attacker, power, targets, "standard"));
			const costs = await this.#processCosts(attacker, power, result.getOtherEffects(attacker.actor));
			result.merge(costs);

			await result.finalize();
			await attacker.actor.removeStatus("bonus-action");
			await result.toMessage(power.name, attacker.actor);
			return result;
		} catch(e) {
			console.log(e);
			throw e;
		}
	}


	static async #usePowerOn(attacker: PToken, power: Usable, targets: PToken[], rollType : AttackRollType, modifiers: ModifierList = new ModifierList()) : Promise<CombatResult> {
		let i = 0;
		const result = new CombatResult();
		for (const target of targets) {
			const atkResult = await this.processAttackRoll( attacker, power, target, modifiers, rollType == "standard" && i==0 ? "activation" : rollType);
			const this_result = await this.processEffects(atkResult);
			result.merge(this_result);
			if (atkResult.result == "reflect") {
				result.merge(await this.#usePowerOn(attacker, power, [attacker], "reflect"));
			}
			const extraAttack = this_result.findEffect("extra-attack");
			if (extraAttack)
			{
				const bonusRollType = typeof rollType != "number" ? 0: rollType+1;
				const mods = new ModifierList();
				if (extraAttack.iterativePenalty) {
					mods.add("Iterative Penalty", (bonusRollType + 1) * extraAttack.iterativePenalty);
				}
				if (bonusRollType < extraAttack.maxChain) {
					const extra = await this.#usePowerOn(attacker, power, [target], bonusRollType, mods);
					result.merge(extra);
				}
			}
			const usePower = this_result.findEffect("use-power");
			if (usePower) {
				const newAttacker : PToken= this.getPTokenFromActorAccessor(usePower.newAttacker);
				const execPower = PersonaDB.allPowers().find( x=> x.id == usePower.powerId);
				if (execPower) {
					const altTargets= this.getAltTargets(newAttacker, atkResult.situation, usePower.target );
					const newTargets = await this.getTargets(newAttacker, execPower, altTargets)
					const extraPower = await this.#usePowerOn(newAttacker, execPower, newTargets, "standard");
					result.merge(extraPower);
				}
			}
			Hooks.callAll("onUsePower", power, attacker, target);
			i++;
		}
		this.computeResultBasedEffects(result);
		return result;
	}

	static getPTokenFromActorAccessor(acc: UniversalActorAccessor<ValidAttackers>) : PToken {
		const combat = game.combat;
		if (acc.token) {
			return PersonaDB.findToken(acc.token) as PToken;
		}
		const actor = PersonaDB.findActor(acc);
		if (combat)  {
			const comb = combat.combatants.find( c=> c.actor == actor);
			if (comb) {return comb.token as PToken;}
		}
		const tok = game.scenes.current.tokens.contents.find( tok => tok.actor == actor);
		if (tok) return tok as PToken;
		throw new PersonaError(`Can't find token for actor ${actor.name}`)
	}

	static computeResultBasedEffects(result: CombatResult) {
		//TODO: Put code to check for miss all targets in ehere
		return result;
	}

	static async processAttackRoll( attacker: PToken, power: Usable, target: PToken, modifiers: ModifierList, rollType: AttackRollType) : Promise<AttackResult> {
		const combat = game.combat as PersonaCombat | undefined;
		const escalationDie = combat  ? combat.getEscalationDie(): 0;
		const situation : Situation = {
			target: target.actor.accessor,
			usedPower: PersonaDB.getUniversalItemAccessor(power),
			user: PersonaDB.getUniversalActorAccessor(attacker.actor),
			attacker: attacker.actor.accessor,
			escalationDie,
			activationRoll: rollType == "activation",
			activeCombat:combat ? !!combat.combatants.find( x=> x.actor?.type != attacker.actor.type): false ,
		};
		const element = power.system.dmg_type;
		const resist = target.actor.elementalResist(element);
		let attackbonus= this.getAttackBonus(attacker, power).concat(modifiers);
		attackbonus.add("Custom modifier", this.customAtkBonus);
		const defense = new ModifierList(
			target.actor.defensivePowers()
			.flatMap (item => item.getModifier("allAtk", target.actor))
		);
		attackbonus = attackbonus.concat(defense);
		const r = await new Roll("1d20").roll();
		const rollName =  `${attacker.name} (${power.name}) ->  ${target.name} (vs ${power.system.defense})`;
		const roll = new RollBundle(rollName, r, attackbonus, situation);
		const naturalAttackRoll = roll.dice[0].total;
		situation.naturalAttackRoll = naturalAttackRoll;
		const baseData = {
			roll,
			attacker: PersonaDB.getUniversalTokenAccessor(attacker) ,
			target: PersonaDB.getUniversalTokenAccessor(target),
			power: PersonaDB.getUniversalItemAccessor(power)
		} satisfies Pick<AttackResult, "attacker" | "target"  | "power" | "roll">;

		switch (resist) {
			case "reflect": {
				return {
					result: rollType != "reflect" ? "reflect": "block",
					printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						hit: false,
						criticalHit: false,
						...situation,
						naturalAttackRoll,
					},
					...baseData,
				};
			}
			case "block": {
				return {
					result: "block",
					printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						hit: false,
						criticalHit: false,
						...situation,
						naturalAttackRoll,
					},
					...baseData,
				};
			}
			case "absorb" : {
				return {
					result: "absorb",
					printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						...situation,
						naturalAttackRoll,
						hit: true,
						criticalHit: false,
						isAbsorbed: true,
					},
					...baseData,
				};
			}

		}
		const total = roll.total;
		const def = power.system.defense;
		const validAtkModifiers = attackbonus.list(situation);
		const printableModifiers = attackbonus.printable(situation);
		if (def == "none") {
			situation.hit = true;
			return {
				result: "hit",
				critBoost: 0,
				printableModifiers,
				validAtkModifiers,
				validDefModifiers: [],
				situation,
				...baseData,
			};
		}
		const critBoostMod = attacker.actor.critBoost();
		critBoostMod.add("Power Modifier", power.system.crit_boost);
		const critResist = target.actor.critResist().total(situation);
		critBoostMod.add("Enemy Critical Resistance", -critResist);
		const critBoost = critBoostMod.total(situation);
		situation.resisted = resist == "resist";
		situation.struckWeakness = resist == "weakness";
		const defenseVal = target.actor.getDefense(def).total(situation);
		const validDefModifiers= target.actor.getDefense(def).list(situation);

		if (naturalAttackRoll == 1
			|| total < defenseVal
		) {
			situation.hit = false;
			situation.criticalHit = false;
			return {
				result: "miss",
				printableModifiers,
				validAtkModifiers,
				validDefModifiers,
				critBoost,
				situation,
				...baseData,
			};
		}
		if (resist != "resist" && naturalAttackRoll + critBoost >= 20) {
			situation.hit = true;
			situation.criticalHit  = true;
			return {
				result: "crit",
				validAtkModifiers,
				validDefModifiers,
				printableModifiers,
				critBoost,
				situation,
				...baseData,
			};
		} else {
			situation.hit = true;
			situation.criticalHit = false;
			return {
				result: "hit",
				validAtkModifiers,
				validDefModifiers,
				printableModifiers,
				critBoost,
				situation,
				...baseData,
			}
		}
	}

	static async processEffects(atkResult: AttackResult) : Promise<CombatResult> {
		const CombatRes = new CombatResult();
		const {result } = atkResult;
		// const attacker = PersonaDB.findToken(atkResult.attacker);
		// const power = PersonaDB.findItem(atkResult.power);
		switch (result) {
			case "reflect":
				const reflectRes = new CombatResult(atkResult);
				CombatRes.merge(reflectRes);
				return CombatRes;
			case "block":
				const blockRes = new CombatResult(atkResult);
				CombatRes.merge(blockRes);
				return CombatRes;
			case "hit":
			case "miss":
			case "crit":
			case "absorb":
				break;
			default:
				result satisfies never;
				PersonaError.softFail(`Unknown hit result ${result}`);
		}
		CombatRes.merge(await this.processPowerEffectsOnTarget(atkResult));

		return CombatRes;
	}

	static async processPowerEffectsOnTarget(atkResult: AttackResult) : Promise<CombatResult> {
		const {situation} = atkResult;
		const power = PersonaDB.findItem(atkResult.power);
		const attacker = PersonaDB.findToken(atkResult.attacker);
		const target = PersonaDB.findToken(atkResult.target);
		const sourcedEffects = [power.getSourcedEffects( PersonaDB.findToken(atkResult.attacker).actor)].concat(attacker.actor!.getSourcedEffects()).concat(target.actor.getSourcedDefensivePowers());
		const CombatRes = new CombatResult(atkResult);
		for (const {source, effects} of sourcedEffects){
			for (let effect of effects) {
				const {conditions, consequences}  = effect;
				if (ModifierList.testPreconditions(conditions, situation, source)) {
					const x = this.ProcessConsequences(power, situation, consequences, attacker.actor!, atkResult);
					CombatRes.escalationMod += x.escalationMod;
					for (const cons of x.consequences) {
						let effectiveTarget : PToken;
						switch (cons.applyTo) {
							case "target" :
								effectiveTarget = target;
								break;
							case "attacker":
								effectiveTarget = attacker;
								break;
							case "owner":
								if (cons.cons.actorOwner) {
									effectiveTarget = this.getPTokenFromActorAccessor(cons.cons.actorOwner);
									break;
								}
								ui.notifications.notify("Can't find Owner of Consequnece");
								Debug(cons);
								continue;
							case "user":
								const userToken  = this.getPTokenFromActorAccessor(situation.user);
								effectiveTarget = userToken;
								break;
							default:
								cons.applyTo satisfies never;
								continue;
						}
						CombatRes.addEffect(atkResult, effectiveTarget.actor!, cons.cons, power.system.dmg_type);
					}
				}
			}
		}
		return CombatRes;
	}


	static ProcessConsequences_simple(consequence_list: Consequence[]): ConsequenceProcessed {
		let consequences : ConsequenceProcessed["consequences"] = [];
		for (const cons of consequence_list) {
			consequences= consequences.concat(this.processConsequence_simple(cons));
		}
		return {
			escalationMod:0,
			consequences
		};
	}


	static ProcessConsequences(power: ModifierContainer, situation: Situation, relevantConsequences: Consequence[], attacker: ValidAttackers, atkresult ?: Partial<AttackResult>)
	: ConsequenceProcessed {
		let escalationMod = 0;
		let consequences : ConsequenceProcessed["consequences"]= [];
		for (const cons of relevantConsequences) {
			const newCons = this.processConsequence(power, situation, cons, attacker, atkresult);
			consequences = consequences.concat(newCons);
			if (cons.type == "escalationManipulation") {
				escalationMod += (cons.amount ?? 0);
			}
		}
		return {consequences, escalationMod} satisfies ConsequenceProcessed;
	}

	static processConsequence( power: ModifierContainer, situation: Situation, cons: Consequence, attacker: ValidAttackers, atkresult ?: Partial<AttackResult>) : ConsequenceProcessed["consequences"] {
		// let x : ConsequenceProcessed["consequences"];
		let damageMult = 1;
		const applyToSelf = cons.applyToSelf ?? false;
		const absorb = situation.isAbsorbed && !applyToSelf;
		const block = atkresult && atkresult.result == "block" && !applyToSelf;
		damageMult *= situation.resisted ? 0.5 : 1;
		const applyTo = cons.applyTo ? cons.applyTo : (applyToSelf ? "owner" : "target");
		switch (cons.type) {
			case "dmg-mult":
				return [{
					applyTo,
					cons
				}];
			case "dmg-high":
				return [{
					applyTo,
					cons: {
						type: cons.type,
						amount: power.getDamage(attacker, "high", situation) * (absorb ? -1 : damageMult),
					}
				}];
			case "dmg-low":
				return [{
					applyTo,
					cons: {
						type: cons.type,
						amount: power.getDamage(attacker, "low", situation) * (absorb ? -1 : damageMult),
					}
				}];
			case "dmg-allout-low": {
				const combat =this.ensureCombatExists();
				const userTokenAcc = combat.getToken(situation.user);
				if (!userTokenAcc) {
					PersonaError.softFail(`Can't calculate All out damage - no token for ${situation.user.actorId}`);
					break;
				}
				const userToken = PersonaDB.findToken(userTokenAcc);
				return [{
					applyTo,
					cons : {
						type: cons.type,
						amount: PersonaCombat.calculateAllOutAttackDamage(userToken, situation).low * (absorb ? -1 : damageMult),
					}
				}];
			}
			case "dmg-allout-high": {
				const combat =this.ensureCombatExists();
				const userTokenAcc = combat.getToken(situation.user);
				if (!userTokenAcc) {
					PersonaError.softFail(`Can't calculate All out damage - no token for ${situation.user.actorId}`);
					break;
				}
				const userToken = PersonaDB.findToken(userTokenAcc);
				return [{
					applyTo,
					cons : {
						type: cons.type,
						amount: PersonaCombat.calculateAllOutAttackDamage(userToken, situation).high * (absorb ? -1 : damageMult),
					}
				}];
			}
			case "none":
			case "modifier":
			case "escalationManipulation": //since this is no llonger handled here we do nothing
				break;
			case "addStatus": case "removeStatus":
				if (!applyToSelf && (absorb || block)) {return [];}
				return  [{applyTo,cons}];
			default:
				return this.processConsequence_simple(cons);
		}
		return [];
	}

	static processConsequence_simple( cons: Consequence) :ConsequenceProcessed["consequences"] {
		const applyToSelf = cons.applyToSelf ?? false;
		const applyTo = cons.applyTo ? cons.applyTo : (applyToSelf ? "owner" : "target");
		switch (cons.type) {
			case "dmg-low":
			case "dmg-high":
			case "dmg-allout-low":
			case "dmg-allout-high":
			case "dmg-mult":
				PersonaError.softFail(`Process Consequnec Simple does not handle ${cons.type}`);
				return [];
			case "hp-loss":
				return [{
					applyTo,
					cons: {
						type: "hp-loss",
						amount: cons.amount ?? 0,
					}
				}];
			case "addStatus":
			case "removeStatus":
				return  [{applyTo,cons}];
			case "none":
			case "modifier":
			case "escalationManipulation": //since this is no llonger handled here we do nothing
				break;
			case "extraAttack" :
			case "absorb":
			case "expend-slot":
			case "add-escalation":
			case "save-slot":
			case "revive":
			case "extraTurn":
			case "expend-item":
			case "recover-slot":
			case "half-hp-cost":
			case "other-effect":
			case "set-flag":
			case "add-power-to-list":
			case "raise-resistance":
			case "lower-resistance":
			case "inspiration-cost":
			case "display-msg":
			case "use-power":
				return [{applyTo,cons}];
			default:
				cons satisfies never;
				break;
		}
		return [];
	}

	static async execTrigger(trigger: CombatTrigger, actor: ValidAttackers, situation?: Situation) : Promise<void> {
		await this.onTrigger(trigger, actor, situation)
		.emptyCheck()
		?.toMessage("Triggered Effect", actor);
	}

	static onTrigger(trigger: CombatTrigger, actor : ValidAttackers, situation ?: Situation) : CombatResult {
		const result = new CombatResult();
		if (!situation) {
			situation = {
				user: actor.accessor,
				target: actor.accessor
			}
		}
		situation = {
			...situation,
			trigger
		} ; //copy the object so it doesn't permanently change it
		for (const trig of actor.triggers) {
			for (const eff of trig.getEffects()) {
				if (!ModifierList.testPreconditions(eff.conditions, situation, trig)) { continue; }
				const cons = this.ProcessConsequences(trig, situation, eff.consequences, actor)
				result.escalationMod+= cons.escalationMod;
				for (const c of cons.consequences) {
					result.addEffect(null, actor, c.cons);
				}
			}
		}
		return result;
	}

	static async #processCosts(attacker: PToken , power: Usable, costModifiers: OtherEffect[]) : Promise<CombatResult>
	{
		const res = new CombatResult();
		if (power.system.type == "power") {
			if (power.system.subtype == "social-link") {
				if (power.system.inspirationId) {
					res.addEffect(null, attacker.actor, {
						type:"inspiration-cost",
						amount: power.system.inspirationCost,
						id: power.system.inspirationId
					});
				}
			}
			if (attacker.actor!.system.type == "pc" && power.system.hpcost) {
				const hpcostmod = costModifiers.find(x=> x.type== "half-hp-cost") ? 0.5 : 1;
				res.addEffect(null, attacker.actor!, {
					type: "hp-loss",
					amount: power.system.hpcost * hpcostmod
				});
			}
			if (attacker.actor!.system.type == "pc" && power.system.subtype == "magic" && power.system.slot >= 0){
				if (!costModifiers.find(x=> x.type == "save-slot")) {
					res.addEffect(null, attacker.actor!, {
						type: "expend-slot",
						amount: power.system.slot,
					});
				}
			}
			if (attacker.actor.system.type == "shadow") {
				switch(power.system.reqCharge) {
					case "none":
						break;
					case "always":
						res.addEffect(null, attacker.actor, {
							type: "addStatus",
							statusName: "depleted",
							statusDuration:"combat",
						});
						break;
					case "not-enhanced":
						if (Metaverse.isEnhanced()) {
							break;
						}
						res.addEffect(null, attacker.actor, {
							type: "addStatus",
							statusName: "depleted",
							statusDuration:"combat",
						});
						break;
					case "supercharged":
						res.addEffect(null, attacker.actor, {
							type: "removeStatus",
							statusName: "supercharged",
						});
						break;
					case "supercharged-not-enhanced":
						res.addEffect(null, attacker.actor, {
							type: "addStatus",
							statusName: "depleted",
							statusDuration:"combat",
						});
						break;

					default:
						power.system.reqCharge satisfies never;
				}
			}
		}
		if (power.system.type == "consumable") {
			res.addEffect(null, attacker.actor, {
				type: "expend-item",
				itemAcc: PersonaDB.getUniversalItemAccessor(power),
			});
		}
		return res;
	}

	static getAttackBonus(attacker: PToken, power:Usable): ModifierList {
		const actor = attacker.actor;
		if (power.system.type == "consumable") {
			const l = actor.itemAtkBonus(power as Consumable);
			return l;
		}
		if (power.system.subtype == "weapon") {
			const mod = actor.wpnAtkBonus();
			mod.add("Power attack modifier", power.system.atk_bonus);
			return mod.concat(new ModifierList(power.getModifier("wpnAtk", actor)));
		}
		if (power.system.subtype == "magic") {
			const mod = actor.magAtkBonus();
			mod.add("Power attack modifier", power.system.atk_bonus);
			return mod.concat(new ModifierList(power.getModifier("magAtk", actor)));
		}
		return new ModifierList();
	}

	static getAltTargets ( attacker: PToken, situation : Situation, targettingType :  ConsTarget) : PToken[] {
		const attackerType = attacker.actor.getAllegiance();
		switch (targettingType) {
			case "target": {
				if (!situation.target) return [];
				const token = this.getPTokenFromActorAccessor(situation.target);
				return [token];
			}
			case "owner":
				return [attacker];
			case "attacker": {
				if (!situation.attacker) return [];
				const token = this.getPTokenFromActorAccessor(situation.attacker);
				return [token];
			}
			case "all-enemies": {
				const combat= this.ensureCombatExists();
				const targets= combat.combatants.filter( x => {
					const actor = x.actor;
					if (!actor || !(actor as ValidAttackers).isAlive())  return false;
					return ((x.actor as ValidAttackers).getAllegiance() != attackerType)
				});
				return targets.map( x=> x.token as PToken);
			}
			case "all-allies": {
				return this.getAllAlliesOf(attacker);
			}
			case "all-combatants": {
				const combat = game.combat;
				if (!combat) return [];
				return combat.combatants.contents.flatMap( c=> c.actor ? [c.token as PToken] : []);
			}
			case "user":
				return [this.getPTokenFromActorAccessor(situation.user)];
			default:
				targettingType satisfies never;
				return [];
		}
	}

	static getAllEnemiesOf(token: PToken) : PToken [] {
		const attackerType = token.actor.getAllegiance();
		const combat= this.ensureCombatExists();
		const targets= combat.combatants.filter( x => {
			const actor = x.actor;
			if (!actor || !(actor as ValidAttackers).isAlive())  return false;
			return ((x.actor as ValidAttackers).getAllegiance() != attackerType)
		});
		return targets.map( x=> x.token as PToken);
	}

	static getAllAlliesOf(token: PToken) : PToken[] {
		const attackerType = token.actor.getAllegiance();
		const combat= game.combat;
		const tokens = combat
			? combat.combatants.contents
			.filter( x=> x.actor)
			.map(x=> x.token)
			: game.scenes.current.tokens
			.filter( x=> !!x.actor && (x.actor as PersonaActor).system.type == "pc");
		const targets= tokens.filter( x => {
			const actor = x.actor;
			if (!actor)  return false;
			if (!(actor as ValidAttackers).isAlive()) return false;
			if ((actor as ValidAttackers).isFullyFaded()) return false;
			return ((x.actor as ValidAttackers).getAllegiance() == attackerType)
		});
		return targets.map( x=> x as PToken);

	}


	static async getTargets(attacker: PToken, power: Usable, altTargets?: PToken[]): Promise<PToken[]> {
		const selected = altTargets != undefined ? altTargets : Array.from(game.user.targets).map(x=> x.document) as PToken[];

		const attackerType = attacker.actor.getAllegiance();
		switch (power.system.targets) {
			case "1-engaged":
				this.checkTargets(1,1);
				return selected;
			case "1-nearby":
				this.checkTargets(1,1);
				return selected;
			case "1-nearby-dead":
				this.checkTargets(1,1, false);
				return selected;
			case "all-enemies": {
				return this.getAllEnemiesOf(attacker);
			}
			case "all-dead-allies": {
				const combat= this.ensureCombatExists();
				const targets= combat.combatants.filter( x => {
					const actor = x.actor;
					if (!actor)  return false;
					if ((actor as ValidAttackers).isAlive()) return false;
					if ((actor as ValidAttackers).isFullyFaded()) return false;
					return ((x.actor as ValidAttackers).getAllegiance() == attackerType)
				});
				return targets.map( x=> x.token as PToken);
			}
			case "all-allies": {
				return this.getAllAlliesOf(attacker);
			}
			case "self": {
				return [attacker];
			}
			case "1d4-random":
			case "1d4-random-rep":
			case "1d3-random-rep":
			case "1d3-random":
				throw new PersonaError("Targetting type not yet implemented");
			case "all-others": {
				const combat= this.ensureCombatExists();
				return combat.combatants.contents
				.filter( x=> x.actorId != attacker.actor.id
					&& x?.actor?.isAlive())
				.map( x=> x.token as PToken);
			}
			case "everyone":{
				const combat= this.ensureCombatExists();
				return combat.combatants.contents
				.filter( x=> x?.actor?.isAlive())
				.map( x=> x.token as PToken);
			}

			default:
				power.system.targets satisfies never;
				throw new PersonaError(`targets ${power.system.targets} Not yet implemented`);
		}
	}

	static checkTargets(min: number, max: number, aliveTargets= true) {
		const selected : Array<Token<PersonaActor>> = Array.from(game.user.targets)
			.filter(x=> aliveTargets ? x.actor.isAlive() : (!x.actor.isAlive() && !x.actor.isFullyFaded()));
		if (selected.length == 0)  {
			const error = "Requires Target to be selected";
			ui.notifications.warn(error);
			throw new Error(error);
		}
		if (selected.length < min) {
			const error = "Too few targets selected";
			ui.notifications.warn(error);
			throw new Error(error);
		}
		if (selected.length > max) {
			const error = "Too many targets selected";
			ui.notifications.warn(error);
			throw new Error(error);
		}
	}

	static ensureCombatExists() : PersonaCombat {
		const combat = game.combat;
		if (!combat) {
			const error = "No Combat";
			throw new PersonaError(error);
		}
		return combat as PersonaCombat;
	}

	getEscalationDie() : number {
		return (this.getFlag("persona", "escalation") as number) ?? -1;
	}

	async incEscalationDie() : Promise<void> {
		this.setEscalationDie(Math.min(this.getEscalationDie() +1, 6));
	}

	async decEscalationDie() : Promise<void> {
		this.setEscalationDie(Math.max(this.getEscalationDie() - 1, 0));

	}

	async setEscalationDie(val: number) : Promise<void> {
		const clamped = Math.clamped(val,0,6);
		await this.setFlag("persona", "escalation", clamped);
	}

	async setSocialEncounter(isSocial: boolean) {
		await this.setFlag("persona", "isSocial", isSocial);
	}

	get isSocial() : boolean {
		return this.getFlag("persona", "isSocial") ?? false;
	}

	isEngaged(subject: UniversalTokenAccessor<PToken>) : boolean {

		const tok = PersonaDB.findToken(subject);
		return EngagementChecker.isEngaged(tok, this);
	}

	isEngagedWith(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
		const t1 = PersonaDB.findToken(token1);
		const t2 = PersonaDB.findToken(token2);
		return EngagementChecker.isEngagedWith(t1, t2, this);
	}

	getCombatantFromTokenAcc(acc: UniversalTokenAccessor<PToken>): Combatant<PersonaActor> {
		const token = PersonaDB.findToken(acc);
		const combatant = this.combatants.find( x=> x?.actor?.id == token.actor.id);
		if (!combatant) {
			throw new PersonaError(`Can't find combatant for ${token.name}. are you sure this token is in the fight? `);
		}
		return combatant;
	}

	async setEngageWith(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) {
		const c1 = this.getCombatantFromTokenAcc(token1);
		const c2 = this.getCombatantFromTokenAcc(token2);
		await this.engagedList.setEngageWith(c1, c2);
	}

	/** returns pass or fail */
	static async rollSave (actor: ValidAttackers, {DC, label, askForModifier, saveVersus, modifier} :SaveOptions) : Promise<{success:boolean, total:number}> {
		const difficulty = DC ? DC : 11;
		const mods = actor.getSaveBonus();
		if (modifier) {
			mods.add("Modifier", modifier);
		}
		if (askForModifier) {
			const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
			mods.add("Custom modifier", customMod);
		}
		const situation : Situation = {
			user: PersonaDB.getUniversalActorAccessor(actor),
			saveVersus: saveVersus ? saveVersus : undefined,
		}
		const difficultyTxt = DC == 11 ? "normal" : DC == 16 ? "hard" : DC == 6 ? "easy" : "unknown difficulty";
		const labelTxt = `Saving Throw (${label ? label + " " + difficultyTxt : ""})`;
		const r = await new Roll("1d20").roll();
		const roll = new RollBundle(labelTxt, r, mods, situation);
		await roll.toModifiedMessage();
		return {
			success: roll.total >= difficulty,
			total: roll.total,
		}
	};

	static async disengageRoll( actor: ValidAttackers, _DC = 11) : Promise<{total: number, rollBundle: RollBundle}> {
		const situation : Situation = {
			user: PersonaDB.getUniversalActorAccessor(actor),
		}
		const mods = actor.getDisengageBonus();
		const labelTxt = `Disengage Check`;
		const roll = new Roll("1d20");
		await roll.roll();
		const rollBundle = new RollBundle(labelTxt, roll, mods, situation);
		return {
			total: roll.total,
			rollBundle
		}
	}

	/** return true if the token has any enemies remainig*/
	enemiesRemaining(token: PToken) : boolean{
		return this.combatants.contents.some(x=> x.token.actor && x.token.actor.system.type != token.actor.system.type);
	}

	/**return true if it is the token's turn
	 */
	turnCheck(token: PToken): boolean {
		if (!this.enemiesRemaining(token)) return true;
		if (!this.combatant) return true;
		return (this.combatant.token.id == token.id)
	}

	async preSaveEffect( total: number, effect: PersonaAE, actor: PersonaActor) : Promise<string[]> {
		let retstr: string[] = [];
		const statuses = Array.from(effect.statuses)
		for (const status of statuses) {
			switch (status) {
					//need to fix the save DC on confused so its can be set properly
				case "confused":
					retstr.push(`<b>${actor.name} is confused and can't take actions this turn!`);
					break;
				case "fear":
					if (total <= 2) {
						retstr.push(`(<b>${actor.name} flees from combat!</b>`);
					} else {
						retstr.push(`(<b>${actor.name} is paralyzed with fear and can't act this turn</b>`);
					}
					break;
				case "charmed":
					if (total <= 5) {
						retstr.push(`<b>${actor.name} is under full enemy control</b>`);
					} else {
						retstr.push(`<b>${actor.name} is charmed and makes a basic attack against a random possible target</b>`);
					}
					break;
			}
		}
		return retstr;
	}

	static async allOutAttackPrompt() {
		if (!PersonaSettings.get("allOutAttackPrompt"))
			return;
		const combat= this.ensureCombatExists();
		const comb = combat?.combatant as Combatant<ValidAttackers> | undefined;
		const actor = comb?.actor as ValidAttackers | undefined;
		if (!comb || !actor) return;
		if (!actor.isCapableOfAction()) return;
		const numOfAllies = combat.getAllies(comb).length;
		if (numOfAllies < 1) {
			ui.notifications.notify("Not enough allies to all out attack!");
			return;
		}
		if (!comb || !actor?.isOwner) return;
		PersonaSFX.play("all-out prompt");
		if (!await HTMLTools.confirmBox("All out attack!", `All out attack is available, would you like to do it? <br> (active Party members: ${numOfAllies})`)
		) return;
		if (!actor.hasStatus("bonus-action")) ui.notifications.warn("No bonus action");
		const allOutAttack = PersonaDB.getBasicPower("All-out Attack");
		if (!allOutAttack) throw new PersonaError("Can't find all out attack in database");
		await PersonaCombat.usePower(comb.token as PToken, allOutAttack);
	}

	findCombatant(token :PToken) : Combatant<ValidAttackers> | undefined {
		return this.validCombatants.find( comb=> comb.token == token);
	}

	getAllies(comb: Combatant<ValidAttackers>) : Combatant<ValidAttackers>[] {
		const allegiance = comb.actor?.getAllegiance();
		if (!allegiance) return [];
		return this.validCombatants.filter( c => c.actor != null
			&& (c.actor.getAllegiance() == allegiance)
			&& c != comb);
	}

	static calculateAllOutAttackDamage(attacker: PToken, situation: Situation) : {high: number, low:number} {
		let dmg = {
			high: 0,
			low:0
		};
		const combat = this.ensureCombatExists();
		const attackerComb = combat.findCombatant(attacker);
		if (!attackerComb) return dmg;
		const attackers=  [
			attackerComb,
			...combat.getAllies(attackerComb)
		].flatMap (c=>c.actor?  [c.actor] : []);
		for (const actor of attackers) {
			const wpndmg = actor.wpnDamage(true, situation);
			dmg.high+= wpndmg.high;
			dmg.low += wpndmg.low;
		}
		dmg.high /= 3;
		dmg.low /= 3;
		dmg.high = Math.round(dmg.high);
		dmg.low = Math.round(dmg.low);
		return dmg;
	}

	getToken( acc: UniversalActorAccessor<ValidAttackers> ): UniversalTokenAccessor<PToken> | undefined {
		if (acc.token) return acc.token;
		const token = this.combatants.find( comb=> comb?.actor?.id == acc.actorId && comb.actor.token == undefined)?.token;
		if (token) return PersonaDB.getUniversalTokenAccessor(token);
		return undefined;
	}

	getRoomEffects() : ModifierContainer[] {
		const effectIds= this.getFlag<string[]>("persona", "roomEffects")
		const allRoomEffects=  PersonaDB.getRoomModifiers();
		if (!effectIds) return [];
		return effectIds.flatMap(id=> {
			const effect = allRoomEffects.find(eff => eff.id == id);
			return effect ? [effect] : [];
		})
	}

	async setRoomEffects(effects: ModifierContainer[]) {
		await this.setFlag("persona", "roomEffects", effects.map(eff=> eff.id));
	}

	async roomEffectsDialog(startSocial: boolean) : Promise<DialogReturn>{
		const roomMods = PersonaDB.getRoomModifiers();
		const ROOMMODS =Object.fromEntries(roomMods.map( mod => [mod.id, mod.name]));
		const html = await renderTemplate("systems/persona/sheets/dialogs/room-effects.hbs", {
			ROOMMODS : {"": "-",
				...ROOMMODS},
			startSocial,
		});
		return new Promise( (conf, rej) => {
			const dialogOptions : DialogOptions = {
				title: "room Effects",
				content: html,
				close: () => rej("Closed"),
				buttons: {
					"ok": {
						label: "ok",
						callback: (html: string) => {
							let mods : UniversalModifier[] = [];
							$(html)
								.find("select.room-mod")
								.find(":selected")
								.each( function ()  {
									const id= String( $(this).val());
									const mod = roomMods.find(x=> x.id == id);
									if (mod) {
										mods.push(mod);
									}
								})
							const isSocialScene = $(html).find(".social-round").is(":checked");
							const advanceCalendar = $(html).find(".advance-calendar").is(":checked");
							const disallowMetaverse = $(html).find(".disallow-metaverse").is(":checked");
							const ret : DialogReturn = {
								roomModifiers: mods,
								isSocialScene,
								advanceCalendar,
								disallowMetaverse,
							}
							conf(ret);
						},
					}
				}
			}
			const dialog = new Dialog( dialogOptions, {});
			dialog.render(true);
		});
	}

} // end of class


type ValidAttackers = Subtype<PersonaActor, "pc"> | Subtype<PersonaActor, "shadow">;

export type PToken = TokenDocument<ValidAttackers> & {get actor(): ValidAttackers};

CONFIG.Combat.initiative = {
	formula : "1d6 + @parent.init",
	decimals: 2
}

Hooks.on("preUpdateCombat" , async (combat: PersonaCombat, _changes: Record<string, unknown>, diffObject: {direction?: number}) =>  {
	const prevActor = combat?.combatant?.actor
	if (prevActor && diffObject.direction && diffObject.direction > 0) {
		await combat.endCombatantTurn(combat.combatant)
	}

});

Hooks.on("updateCombat" , async (combat: PersonaCombat, changes: Record<string, unknown>, diffObject: {direction?: number}) =>  {
	if (changes.turn == undefined && changes.round == undefined) {
		return;
	}
	if (diffObject.direction && diffObject.direction != 0) {
		const currentActor = combat?.combatant?.actor
		if (currentActor && diffObject.direction > 0) {
			await combat.startCombatantTurn(combat.combatant)
		}
		//new turn
		if (changes.round != undefined) {
			//new round
			if (diffObject.direction > 0 && game.user.isGM) {
				if (combat.isSocial) {
					PersonaSocial.startSocialCombatTurn();
				}
				await combat.incEscalationDie();
			}
			if (diffObject.direction < 0 && game.user.isGM) {
				await combat.decEscalationDie();
			}
		}
	}
});

Hooks.on("combatStart", async (combat: PersonaCombat) => {
	for (const comb of combat.combatants) {
		if (!comb.actor) continue;
		const situation : Situation = {
			activeCombat : true,
			user: comb.actor.accessor
		};
		const token = comb.token as PToken;
		await PersonaCombat
			.onTrigger("on-combat-start", token.actor, situation)
			.emptyCheck()
			?.toMessage("Triggered Effect", token.actor);
	}
	const x =combat.turns[0];
	if (x.actor) {
		await combat.startCombatantTurn(x as Combatant<ValidAttackers>);
	}
});

Hooks.on("deleteCombat", async (combat: PersonaCombat) => {
	for (const combatant of combat.combatants) {
		const actor = combatant.actor as ValidAttackers  | undefined;
		if (!actor) continue;
		const token = combatant.token as PToken;
		await PersonaCombat
			.onTrigger("on-combat-end", token.actor)
			.emptyCheck()
			?.toMessage("Triggered Effect", token.actor );

		for (const effect of actor.effects) {
			if (effect.durationLessThanOrEqualTo("combat")) {
				await effect.delete();
			}
		}
		if (actor.isFading()) {
			await actor.modifyHP(1);
		}
	}
});


Hooks.on("renderCombatTracker", async (_item: CombatTracker, element: JQuery<HTMLElement>, _options: RenderCombatTabOptions) => {
	if (element.find(".escalation-die").length == 0) {
		const escalationTracker = `<div class="escalation-tracker"><span class="title"> Escalation Die: </span><span class="escalation-die">N/A</div>`;
		element.find(".combat-tracker-header").append(escalationTracker);
	}
	const combat = (game.combat as PersonaCombat);
	const escalationDie = combat ? String(combat.getEscalationDie()): "N\A";
	element.find(".escalation-die").text(escalationDie);
});

Hooks.on("onAddStatus", async function (token: PToken, status: StatusEffect)  {
	if (status.id != "down") return;
	if (!game.user.isGM) {
		throw new PersonaError("Somehow isn't GM executing this");
	}
	if (game.combat) {
		const allegiance = token.actor.getAllegiance();
		const standingAllies = game.combat.combatants.contents.some(comb => {
			if (!comb.token) return false;
			const actor = comb.actor as ValidAttackers;
			return actor.isCapableOfAction() && actor.getAllegiance() == allegiance;
		})
		if (!standingAllies) {
			const currentTurnCharacter =game.combat.combatant?.actor;
			if (!currentTurnCharacter) return;
			const currentTurnType = currentTurnCharacter.system.type;
			if (currentTurnType == "shadow") {
				return await PersonaCombat.allOutAttackPrompt();
			} else {
				PersonaSockets.simpleSend("QUERY_ALL_OUT_ATTACK", {}, game.users
					.filter( user=> currentTurnCharacter.testUserPermission(user, "OWNER") && !user.isGM )
					.map( usr=> usr.id)
				);
			}
		}
	}

});

type SaveOptions = {
	label?: string,
	DC?: number,
	askForModifier?: boolean,
	saveVersus?: StatusEffectId,
	modifier ?: number,
}


export type ConsequenceProcessed = {
	consequences: {
		applyTo: ConditionTarget,
		// applyToSelf: boolean,
		cons: Consequence,
	}[],
	escalationMod: number
}

Hooks.on("socketsReady", async () => {
	PersonaSockets.setHandler("QUERY_ALL_OUT_ATTACK", () => {
		PersonaCombat.allOutAttackPrompt();
	});
});


type DialogReturn = {
	roomModifiers: UniversalModifier[],
	isSocialScene: boolean,
	advanceCalendar: boolean,
	disallowMetaverse: boolean,
}
