import { CombatHooks } from "./combat-hooks.js";
import { DamageConsequence } from "../../config/consequence-types.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { NonCombatTrigger } from "../../config/triggers.js";
import { STATUS_POWER_TAGS } from "../../config/power-tags.js";
import { Shadow } from "../actor/persona-actor.js";
import { PersonaItem } from "../item/persona-item.js";
import { PersonaCalendar } from "../social/persona-calendar.js";
import { POWER_TAGS } from "../../config/power-tags.js";
import { PowerTag } from "../../config/power-tags.js";
import { ConditionTarget } from "../../config/precondition-types.js";
import { ConsTarget } from "../../config/consequence-types.js";
import { PersonaSocial } from "../social/persona-social.js"
import { UniversalModifier } from "../item/persona-item.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";
import { CombatTrigger } from "../../config/triggers.js";
import { BASIC_PC_POWER_NAMES } from "../../config/basic-powers.js";
import { PersonaSFX } from "./persona-sfx.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { DamageType } from "../../config/damage-types.js";
import { ModifierContainer } from "../item/persona-item.js";
import { Consequence } from "../../config/consequence-types.js";
import { TurnAlert } from "../utility/turnAlert.js";
import { PersonaAE } from "../active-effect.js";
import { EngagementChecker } from "./engageChecker.js";
import { Metaverse } from "../metaverse.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { HTMLTools } from "../utility/HTMLTools.js";

import { PersonaError } from "../persona-error.js";
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
import { OtherEffect } from "../../config/consequence-types.js";
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
			const regionMods = Metaverse.getRegion()?.roomEffects.map(x=> x.id) ?? [];
		const combatInit = await this.roomEffectsDialog(regionMods, assumeSocial);
		this.setSocialEncounter(combatInit.isSocialScene);
		if (combatInit.isSocialScene) {
			await Metaverse.exitMetaverse();
			await PersonaSocial.startSocialCombatTurn(combatInit.disallowMetaverse, combatInit.advanceCalendar);
		}
		const mods = combatInit.roomModifiers;
		this.setRoomEffects(mods);
		await this.setEscalationDie(0);

		msg += this.roomEffectsMsg();
// 		if (mods.length > 0) {
// 			msg += "<u><h2>Room Effects</h2></u><ul>";
// 			msg += mods.map( x=> `<li><b>${x.name}</b> : ${x.system.description}</li>`).join("");
// 			msg += "</ul>";
// 		}
		if (msg.length > 0) {
			const messageData: MessageData = {
				speaker: {alias: "Combat Start"},
				content: msg,
				style: CONST.CHAT_MESSAGE_STYLES.OOC,
			};
			ChatMessage.create(messageData, {});
		}
		const starters = this.combatants.contents.map( comb => comb?.actor?.onCombatStart());
		await Promise.all(starters);
		this.refreshActorSheets();
		const unrolledInit = this.combatants
			.filter( x=>x.initiative == undefined)
			.map( c=> c.id);
		if (unrolledInit.length > 0) {
			await this.rollInitiative(unrolledInit);
		}
		return await super.startCombat();
	}

	override async delete() : Promise<void> {
		this.refreshActorSheets();
		if (!this.isSocial) {
			await this.generateTreasure();
		}
		if (this.isSocial && await HTMLTools.confirmBox("Enter Meta", "Enter Metaverse?", true)) {
			await Metaverse.enterMetaverse();
		}
		await PersonaCombat.onTrigger("on-combat-end-global").emptyCheck()?.toMessage("Triggered Effect", undefined);
		return await super.delete()
	}

	async refreshActorSheets(): Promise<void> {
		for (const comb of this.combatants) {
			const actor= comb.token?.actor;
			if (!actor) continue;
			if (actor.sheet._state > 0) {
				actor.sheet?.render(true);
			}
		}
	}

	validCombatants(attacker?: PToken): Combatant<ValidAttackers>[] {
		const challenged = attacker?.actor.hasStatus("challenged");
		return this.combatants.contents.filter( x=> {
			if (!x.actor) {return false;}
			const type = x.actor.system.type;
			if (type == "npc" || type == "tarot") return false;
			if (attacker == x.token) {return true;}
			if (challenged || x.actor.hasStatus("challenged")) {
				if (!this.isEngaging(PersonaDB.getUniversalTokenAccessor(attacker!), PersonaDB.getUniversalTokenAccessor(x.token))) {
					return false;
				}
			}
			return true;
		}) as Combatant<ValidAttackers>[];

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
		const triggeringCharacter  = (combatant as Combatant<PersonaActor>)?.token?.actor?.accessor;
		if (triggeringCharacter) {
			for (const user of this.combatants) {
				if (user.token.actor == undefined) {continue;}
				const situation : Situation = {
					triggeringCharacter,
					user: user.token.actor.accessor,
					activeCombat: true,
				}
				await PersonaCombat.execTrigger("start-turn", user.token.actor as ValidAttackers, situation);
			}
		}

		for (const effect of actor.effects) {
			if (effect.statuses.has("blocking")) {
				await effect.delete();
			}
			if (effect.statusDuration == "USoNT")  {
				await Logger.sendToChat(`Removed condition: ${effect.displayedName} at start of turn`, actor);
				await effect.delete();
			}
		}
		let startTurnMsg = [ `<u><h2> Start of ${combatant.token.name}'s turn</h2></u><hr>`];
		startTurnMsg = startTurnMsg.concat(await this.handleStartTurnEffects(combatant));
		if (combatant.actor.isCapableOfAction()) {
			const accessor = PersonaDB.getUniversalTokenAccessor(combatant.token);
			if (this.isEngagedByAnyFoe(accessor)) {
				const alliedDefenders = this.getAlliedEngagedDefenders(accessor);
				if (alliedDefenders.length == 0) {
					const DC = this.getDisengageDC(combatant);
					const {total, rollBundle, success} = await PersonaCombat.disengageRoll(actor, DC);
					rolls.push(rollBundle);
					let disengageResult = "failed";
					if (total >= 11) disengageResult = "normal";
					if (total >= 16) disengageResult = "hard";
					startTurnMsg.push("<br>"+ await renderTemplate("systems/persona/parts/disengage-check.hbs", {roll: rollBundle, disengageResult, success}));
				} else {
					startTurnMsg.push(`<br>Can Freely disengage thanks to ${alliedDefenders.map(x=> x.name).join(", ")}`);
				}
			}
		}
		const speaker = {alias: combatant?.token?.name ?? "Unknown"};
		let messageData = {
			speaker: speaker,
			content: startTurnMsg.join("<br>"),
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
			rolls: rolls.map(r=> r.roll),
			sound: rolls.length > 0 ? CONFIG.sounds.dice : undefined
		};
		ChatMessage.create(messageData, {});
	}


	static isSameTeam( token1: PToken, token2: PToken) : boolean {
		return token1.actor.getAllegiance() == token2.actor.getAllegiance();
	}


	getAlliedEngagedDefenders(Tacc: UniversalTokenAccessor<PToken>) : PToken[] {
		const token = PersonaDB.findToken(Tacc);
		const meleeTokens = EngagementChecker.getTokensInMelee(token, this);
		return Array.from(meleeTokens)
			.filter( x=> x.actor.statuses.has("sticky")
				&& PersonaCombat.isSameTeam(token,x )
				&& x.actor.canEngage()
			);
	}

	getDisengageDC(combatant: Combatant<ValidAttackers>) : number {
		if (!combatant.token) return 11;
		const list = EngagementChecker.getAllEngagedEnemies(combatant.token as PToken, this);
		for (const item of list) {
			if (item.actor.isSticky()) return 16;
		}
		return 11;
	}

	async skipBox(msg: string) {
		if (await HTMLTools.confirmBox(msg, msg)) {
			this.nextTurn();
		}
	}

	async endCombatantTurn(combatant: Combatant<ValidAttackers>) {
		const triggeringCharacter  = (combatant as Combatant<PersonaActor>)?.token?.actor?.accessor;
		const triggeringActor = combatant?.token?.actor;

		if (triggeringActor && triggeringActor.system.type == "shadow") {
			const situation : Situation = {
				user: triggeringCharacter!,
				activeCombat: true,
			}
			const bonusEnergy = 1 + triggeringActor.getBonuses("energy-per-turn").total(situation);
			await (triggeringActor as Shadow).alterEnergy(bonusEnergy);
		}

		if (triggeringCharacter) {
			for (const user of this.combatants) {
				if (user.token.actor == undefined) {continue;}
				const situation : Situation = {
					triggeringCharacter,
					user: user.token.actor.accessor,
					activeCombat: true,
				}
				await PersonaCombat.execTrigger("end-turn", user.token.actor as ValidAttackers, situation);
			}
		}
		const actor = combatant.actor;
		if (!actor) return;
		if (!game.user.isOwner) return;
		const burnStatus = actor.effects.find( eff=> eff.statuses.has("burn"));
		if (burnStatus) {
			const damage = burnStatus.potency;
			await actor.modifyHP(-damage);
		}

		const poisonStatus = actor.effects.find( eff=> eff.statuses.has("poison"));
		if (poisonStatus) {
			const damage = actor.getPoisonDamage();
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
		const confused = actor.effects.find( eff=> eff.statuses.has("confused"));
		if (confused) {
			const {success, total} = await PersonaCombat.rollSave(actor, { DC: 11, label: "Confusion", saveVersus:confused.statusId})
			if (!success) {
				const msg = await this.preSaveEffect(total, confused, actor);
				Msg = Msg.concat(msg);
				if (actor.system.type == "shadow") {
					this.skipBox(`${msg}. <br> Skip turn?`); //don't await this so it processes the rest of the code
				}
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
			Msg.push(`${combatant.name} is burning and will take ${damage} damage at end of turn. (original Hp: ${actor.hp})`);
		}
		const poisonStatus = actor.effects.find( eff=> eff.statuses.has("poison"));
		if (poisonStatus) {
			const damage = actor.getPoisonDamage();
			Msg.push(`${combatant.name} is poisoned and will take ${damage} damage at end of turn. (original Hp: ${actor.hp})`);
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
				ui.notifications.warn("It's not your turn!");
				return false;
			} else {
				if (!await HTMLTools.confirmBox("Out of turn Action", "It's not your turn, act anyway?")) {
					return false;
				}
			}
		}
		if (!attacker.actor.canPayActivationCost(power)) {
			ui.notifications.notify("You can't pay the activation cost for this power");
			return false;
		}
		if (!attacker.actor.canUsePower(power)) {
			ui.notifications.notify("You can't Use this power");
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
			if (targets.some( target => target.actor.system.type == "shadow" ) && power.system.targets != "self" ) {
				this.ensureCombatExists();
			}
			this.customAtkBonus = await HTMLTools.getNumber("Attack Modifier");
			const result = new CombatResult();
			if (power.name == BASIC_PC_POWER_NAMES[1]) {
				PersonaSFX.onAllOutAttack();
			}
			PersonaSFX.onUsePower(power);
			result.merge(await this.usePowerOn(attacker, power, targets, "standard"));
			const costs = await this.#processCosts(attacker, power, result.getOtherEffects(attacker.actor));
			result.merge(costs);

			await result.finalize();
			await attacker.actor.removeStatus("bonus-action");
			await attacker.actor.removeStatus("baton-pass");
			await result.toMessage(power.name, attacker.actor);
			if (power == PersonaDB.getBasicPower("All-out Attack")) {
				if (game.combat) {
					await game.combat.nextTurn();
				}
			}
			return result;
		} catch(e) {
			console.log(e);
			throw e;
		}
	}


	static async usePowerOn(attacker: PToken, power: Usable, targets: PToken[], rollType : AttackRollType, modifiers: ModifierList = new ModifierList()) : Promise<CombatResult> {
		let i = 0;
		const result = new CombatResult();
		for (const target of targets) {
			const atkResult = await this.processAttackRoll( attacker, power, target, modifiers, rollType == "standard" && i==0 ? "activation" : rollType);
			const this_result = await this.processEffects(atkResult);
			result.merge(this_result);
			if (atkResult.result == "reflect") {
				result.merge(await this.usePowerOn(attacker, power, [attacker], "reflect"));
			}
			const extraAttacks = this_result.findEffects("extra-attack");
			for (const extraAttack of extraAttacks)
			{
				const bonusRollType = typeof rollType != "number" ? 0: rollType+1;
				const mods = new ModifierList();
				//TODO BUG: Extra attacks keep the main inputted modifier
				if (extraAttack.iterativePenalty) {
					mods.add("Iterative Penalty", (bonusRollType + 1) * extraAttack.iterativePenalty);
				}
				if (bonusRollType < extraAttack.maxChain) {
					const extra = await this.usePowerOn(attacker, power, [target], bonusRollType, mods);
					result.merge(extra);
				}
			}
			const execPowers = this_result.findEffects("use-power");
			for (const usePower of execPowers) {
				//TODO BUG: Extra attacks keep the main inputted modifier
				const newAttacker = this.getPTokenFromActorAccessor(usePower.newAttacker);
				const execPower = PersonaDB.allPowers().find( x=> x.id == usePower.powerId);
				if (execPower && newAttacker) {
					const altTargets= this.getAltTargets(newAttacker, atkResult.situation, usePower.target );
					const newTargets = await this.getTargets(newAttacker, execPower, altTargets)
					const extraPower = await this.usePowerOn(newAttacker, execPower, newTargets, "standard");
					result.merge(extraPower);
				}
			}
			Hooks.callAll("onUsePower", power, attacker, target);
			i++;
		}
		this.computeResultBasedEffects(result);
		return result;
	}

	static getPTokenFromActorAccessor(acc: UniversalActorAccessor<ValidAttackers>) : PToken | undefined {
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
		return undefined;
	}

	static computeResultBasedEffects(result: CombatResult) {
		//TODO: Put code to check for miss all targets in ehere
		return result;
	}

	static async processAttackRoll( attacker: PToken, power: Usable, target: PToken, modifiers: ModifierList, rollType: AttackRollType) : Promise<AttackResult> {
		const combat = game.combat as PersonaCombat | undefined;
		const situation : Situation = {
			target: target.actor.accessor,
			usedPower: PersonaDB.getUniversalItemAccessor(power),
			user: PersonaDB.getUniversalActorAccessor(attacker.actor),
			attacker: attacker.actor.accessor,
			activationRoll: rollType == "activation",
			activeCombat:combat ? !!combat.combatants.find( x=> x.actor?.type != attacker.actor.type): false ,
		};
		const element = power.system.dmg_type;
		const resist = target.actor.elementalResist(element);
		let attackbonus = this.getAttackBonus(attacker, power).concat(modifiers);
		attackbonus.add("Custom modifier", this.customAtkBonus ?? 0);
		const defense = new ModifierList(
			target.actor.defensivePowers()
			.flatMap (item => item.getModifier("allAtk", target.actor))
		);
		attackbonus = attackbonus.concat(defense);
		const def = power.system.defense;
		const defenseVal = def != "none" ? target.actor.getDefense(def).total(situation): 0;
		const validDefModifiers= def != "none" ? target.actor.getDefense(def).list(situation): [];

		const r = await new Roll("1d20").roll();
		const cssClass=  (target.actor.type != "pc") ? "gm-only" : "";
		const defenseStr =`<span class="${cssClass}">(${defenseVal})</span>`;
		const rollName =  `${attacker.name} (${power.name}) ->  ${target.name} vs. ${power.system.defense} ${defenseStr}`;
		const roll = new RollBundle(rollName, r, attacker.actor.system.type == "pc", attackbonus, situation);
		const naturalAttackRoll = roll.dice[0].total;
		situation.naturalRoll = naturalAttackRoll;
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
						naturalRoll: naturalAttackRoll,
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
						naturalRoll: naturalAttackRoll,
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
						naturalRoll: naturalAttackRoll,
						hit: true,
						criticalHit: false,
						isAbsorbed: true,
					},
					...baseData,
				};
			}

		}
		const total = roll.total;
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
		const critBoostMod = power.critBoost(attacker.actor);
		if (power.system.type == "power" && !power.isBasicPower()) {
			const powerLevel = power.baseCritSlotBonus();
			const targetResist = target.actor.basePowerCritResist();
			const diff = powerLevel - targetResist;
			critBoostMod.add("Power Level Difference", diff);
		}
		situation.resisted = resist == "resist";
		situation.struckWeakness = resist == "weakness";
		const critResist = target.actor.critResist().total(situation);
		critBoostMod.add("Enemy Critical Resistance", -critResist);
		const floor = situation.resisted ? -999 : 0;
		const critBoost = Math.max(floor, critBoostMod.total(situation));

		if (naturalAttackRoll == 1
			|| total < defenseVal
			|| (attacker.actor.hasStatus("rage") && naturalAttackRoll % 2 == 1)
		) {
			situation.hit = false;
			situation.criticalHit = false;
			return {
				result: "miss",
				defenseValue: defenseVal,
				hitWeakness: situation.struckWeakness ?? false,
				hitResistance: situation.resisted ?? false,
				printableModifiers,
				validAtkModifiers,
				validDefModifiers,
				critBoost,
				situation,
				...baseData,
			};
		}
		if (naturalAttackRoll + critBoost >= 20
			&& (!power.isMultiTarget() || naturalAttackRoll % 2 == 0)
			&& !target.actor.hasStatus("blocking")
		) {
			situation.hit = true;
			situation.criticalHit  = true;
			return {
				result: "crit",
				defenseValue: defenseVal,
				hitWeakness: situation.struckWeakness ?? false,
				hitResistance: situation.resisted ?? false,
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
				defenseValue: defenseVal,
				hitWeakness: situation.struckWeakness ?? false,
				hitResistance: situation.resisted ?? false,
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
						let effectiveTarget : PToken | undefined;
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
								continue;
							case "user":
								if (!situation.user) {continue;}
								const userToken  = this.getPTokenFromActorAccessor(situation.user);
								effectiveTarget = userToken;
								break;
							case "triggering-character":
								const triggerer = "triggeringCharacter" in situation? situation.triggeringCharacter: undefined;
								if (!triggerer) {
									PersonaError.softFail("Can't target triggering character for this");
									effectiveTarget = undefined;
									break;
								}
								const token = this.getPTokenFromActorAccessor(triggerer);
								effectiveTarget = token;
								break;
							case "cameo":
								effectiveTarget = undefined;
								break;
							default:
								cons.applyTo satisfies never;
								continue;
						}
						if (effectiveTarget) {
							CombatRes.addEffect(atkResult, effectiveTarget.actor!, cons.cons);
						}
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


	static ProcessConsequences(power: ModifierContainer, situation: Situation, relevantConsequences: Consequence[], attacker: ValidAttackers | undefined, atkresult ?: Partial<AttackResult>)
	: ConsequenceProcessed {
		let escalationMod = 0;
		let consequences : ConsequenceProcessed["consequences"]= [];
		for (const cons of relevantConsequences) {
			if (attacker) {
				const newCons = this.processConsequence(power, situation, cons, attacker, atkresult);
				consequences = consequences.concat(newCons);
			} else {
				const newCons = this.processConsequence_simple( cons);
				consequences = consequences.concat(newCons);
			}
			if (cons.type == "escalationManipulation") {
				escalationMod += (cons.amount ?? 0);
			}
		}
		return {consequences, escalationMod} satisfies ConsequenceProcessed;
	}

	static processConsequence( power: ModifierContainer, situation: Situation, cons: Consequence, attacker: ValidAttackers, atkresult ?: Partial<AttackResult>) : ConsequenceProcessed["consequences"] {
		let damageMult = 1;
		const applyToSelf = cons.applyToSelf ?? false;
		const absorb = (situation.isAbsorbed && !applyToSelf) ?? false;
		const block = atkresult && atkresult.result == "block" && !applyToSelf;
		damageMult *= situation.resisted ? 0.5 : 1;
		const applyTo = cons.applyTo ? cons.applyTo : (applyToSelf ? "owner" : "target");
		switch (cons.type) {
			case "damage-new":
				return this.processConsequence_damage(cons, applyTo, attacker, power, situation, absorb, damageMult);
			case "dmg-mult":
				return [{
					applyTo,
					cons: {type: "damage-new",
						damageSubtype: "multiplier",
						amount: cons.amount ?? 1,
					}
				}];
			case "dmg-high":
				return [{
					applyTo,
					cons: {
						type: "damage-new",
						damageSubtype: "high",
						amount: power.getDamage(attacker, "high", situation) * (absorb ? -1 : damageMult),
						damageType: (power as Usable).system.dmg_type,
					}
				}];
			case "dmg-low":
				return [{
					applyTo,
					cons: {
						type: "damage-new",
						damageSubtype: "low",
						amount: power.getDamage(attacker, "low", situation) * (absorb ? -1 : damageMult),
						damageType: (power as Usable).system.dmg_type,
					}
				}];
			case "dmg-allout-low": {
				const combat =this.ensureCombatExists();
				const userTokenAcc = combat.getToken(situation.user);
				if (!userTokenAcc) {
					PersonaError.softFail(`Can't calculate All out damage - no token for ${situation?.user?.actorId ?? "Null user"}`);
					break;
				}
				const userToken = PersonaDB.findToken(userTokenAcc);
				return [{
					applyTo,
					cons : {
						type: "damage-new",
						damageSubtype: "allout-low",
						amount: PersonaCombat.calculateAllOutAttackDamage(userToken, situation).low * (absorb ? -1 : damageMult),
						damageType: "all-out",
					}
				}];
			}
			case "dmg-allout-high": {
				const combat =this.ensureCombatExists();
				const userTokenAcc = combat.getToken(situation.user);
				if (!userTokenAcc) {
					PersonaError.softFail(`Can't calculate All out damage - no token for ${situation?.user?.actorId}`);
					break;
				}
				const userToken = PersonaDB.findToken(userTokenAcc);
				return [{
					applyTo,
					cons : {
						type: "damage-new",
						damageSubtype: "allout-high",
						amount: PersonaCombat.calculateAllOutAttackDamage(userToken, situation).high * (absorb ? -1 : damageMult),
						damageType: "all-out",
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

	static processConsequence_damage( cons: DamageConsequence, applyTo: ConsequenceProcessed["consequences"][number]["applyTo"], attacker: ValidAttackers, power: ModifierContainer, situation: Situation, absorb: boolean, damageMult: number) : ConsequenceProcessed["consequences"] {
		let dmgAmt : number = 0;
		switch (cons.damageSubtype) {
			case "multiplier":
				return [{
					applyTo,
					cons
				}];
			case "high":
				dmgAmt = power.getDamage(attacker, "high", situation);
				break;
			case "low":
				dmgAmt = power.getDamage(attacker, "low", situation);
				break;
			case "allout-low":
			case "allout-high": {
				const combat =this.ensureCombatExists();
				const userTokenAcc = combat.getToken(situation.user);
				if (!userTokenAcc) {
					PersonaError.softFail(`Can't calculate All out damage - no token for ${situation?.user?.actorId ?? "Null user"}`);
					break;
				}
				const userToken = PersonaDB.findToken(userTokenAcc);
				const dmg = PersonaCombat.calculateAllOutAttackDamage(userToken, situation);
				dmgAmt = cons.damageSubtype == "allout-high"? dmg.high: dmg.low;
				break;
			}
			case "constant":
				dmgAmt = cons.amount;
				break;
			case "percentage":
				dmgAmt = cons.amount;
				break;
			default:
				cons satisfies never;
		}
		return [{
			applyTo,
			cons: {
				...cons,
				amount: dmgAmt * (absorb ? -1 : damageMult),
			}
		}];
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
			case "damage-new":
				PersonaError.softFail(`Process Consequence Simple does not handle ${cons.type}`);
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
			case "modifier-new":
			case "escalationManipulation": //since this is no llonger handled here we do nothing
				break;
			case "extraAttack" :
			case "absorb":
			case "expend-slot":
			case "add-escalation":
			case "save-slot":
			case "revive":
			case "extraTurn":
			case "recover-slot":
			case "half-hp-cost":
			case "other-effect":
			case "set-flag":
			case "add-power-to-list":
			case "raise-resistance":
			case "lower-resistance":
			case "raise-status-resistance":
			case "inspiration-cost":
			case "display-msg":
			case "use-power":
			case "social-card-action":
			case "scan":
			case "alter-energy":
			case "dungeon-action":
			case "alter-mp":
				return [{applyTo,cons}];
			case "expend-item":
				if (cons.itemId) {
					const item = game.items.get(cons.itemId) as PersonaItem;
					if (!item) return [];
					return [{applyTo,
						cons: {
							type: "expend-item",
							itemId: item.id,
							itemAcc: item.accessor,
						}
					}];
				}
				if (cons.sourceItem) {
					return [{applyTo,
						cons: {
							type: "expend-item",
							itemId: "",
							itemAcc: cons.sourceItem
						}
					}];
				} else {
					console.log("Warning: can't expend item, no sourceItem");
					return [];
				}
			default:
				cons satisfies never;
				break;
		}
		return [];
	}

	static async execTrigger(trigger: CombatTrigger, actor: ValidAttackers, situation?: Situation) : Promise<void> {
		return await TriggeredEffect.execCombatTrigger(trigger, actor, situation);
	}

	static onTrigger(trigger: CombatTrigger | NonCombatTrigger, actor ?: ValidAttackers, situation ?: Situation) : CombatResult {
		return TriggeredEffect.onTrigger(trigger, actor, situation);
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
			if (attacker.actor.system.type == "pc" && power.system.subtype == "magic" && power.system.mpcost > 0) {
				res.addEffect(null, attacker.actor, {
					type: "alter-mp",
					subtype: "direct",
					amount: -power.mpCost(attacker.actor),
				});
			}
			if (attacker.actor.system.type == "shadow") {
				if (power.system.energy.cost > 0) {
					res.addEffect(null, attacker.actor, {
						type: "alter-energy",
						amount: -power.system.energy.cost
					});
				}

			}
		}
		if (power.system.type == "consumable") {
			res.addEffect(null, attacker.actor, {
				type: "expend-item",
				itemId: "",
				itemAcc: PersonaDB.getUniversalItemAccessor(power),
			});
		}
		return res;
	}

	static getAttackBonus(attacker: PToken, power:Usable) : ModifierList {
		let atkbonus = this.getBaseAttackBonus(attacker, power);
		let tag : PowerTag | undefined;
		switch (power.system.dmg_type) {
			case "fire": case "wind":
			case "light": case "dark":
			case "healing":
				tag = power.system.dmg_type;
				break;
			case "lightning":
				tag = "elec";
				break;
			case "physical":
				tag ="weapon";
				break;
			case "cold":
				tag = "ice";
				break;
			case "untyped":
				tag = "almighty";
				break;
			case "none":
				tag = power.system.tags.find(x=> STATUS_POWER_TAGS.includes(x as any));
				break;
			case "all-out":
				break;
		}
		if (tag) {
			const bonusPowers = attacker.actor.mainPowers.concat(attacker.actor.bonusPowers)
				.filter(x=> x.system.tags.includes(tag));
			const bonus = bonusPowers.length * 2;
			const localized = game.i18n.localize(POWER_TAGS[tag]);
			atkbonus.add(`${localized} Power bonus`, bonus);
		}
		return atkbonus;
	}

	static getBaseAttackBonus(attacker: PToken, power:Usable): ModifierList {
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
				if (token) return [token]; else return [];
			}
			case "owner":
				return [attacker];
			case "attacker": {
				if (!situation.attacker) return [];
				const token = this.getPTokenFromActorAccessor(situation.attacker);
				if (token) return [token]; else return [];
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
				const combat = game.combat as PersonaCombat;
				if (!combat) return [];
				return combat.validCombatants(attacker).flatMap( c=> c.actor ? [c.token as PToken] : []);
			}
			case "user": {
				if (!situation.user) return [];
				const token = this.getPTokenFromActorAccessor(situation.user);
				if (token) return [token]; else return [];
			}
			case "triggering-character": {
				if (!("triggeringCharacter" in  situation)) return [];
				if (!situation.triggeringCharacter) return [];
				const token = this.getPTokenFromActorAccessor(situation.triggeringCharacter);
				if (token) return [token]; else return [];
			}
			case "cameo": {
				return [];
			}
			default:
				targettingType satisfies never;
				return [];
		}
	}

	static getAllEnemiesOf(token: PToken) : PToken [] {
		const attackerType = token.actor.getAllegiance();
		const combat= this.ensureCombatExists();
		const targets = combat.validCombatants(token).filter( x => {
			const actor = x.actor;
			if (!actor || !actor.isAlive())  return false;
			return (x.actor.getAllegiance() != attackerType)
		});
		return targets.map( x=> x.token as PToken);
	}

	static getAllAlliesOf(token: PToken) : PToken[] {
		const attackerType = token.actor.getAllegiance();
		const combat= game.combat as PersonaCombat;
		const tokens = combat
			? combat.validCombatants(token)
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
		const combat = game.combat as PersonaCombat | undefined;
		if (combat) {
			const attackerActor = attacker.actor;
			for (const target of selected) {
				const targetActor = target.actor;
				const engagingTarget  = combat.isInMeleeWith(PersonaDB.getUniversalTokenAccessor(attacker), PersonaDB.getUniversalTokenAccessor(target));
				if (attacker.id == target.id) continue;
				if (attackerActor.hasStatus("challenged") && !engagingTarget) {
					throw new PersonaError("Can't target non-engaged when challenged");
				}
				if (targetActor.hasStatus("challenged") && !engagingTarget) {
					throw new PersonaError("Can't target a challenged target you're not engaged with");
				}
			}
		}

		const attackerType = attacker.actor.getAllegiance();
		switch (power.system.targets) {
			case "1-engaged":
				this.checkTargets(1,1, true, altTargets);
				return selected;
			case "1-nearby":
				this.checkTargets(1,1, true, altTargets);
				return selected;
			case "1-nearby-dead":
				this.checkTargets(1,1, false);
				return selected;
			case "all-enemies": {
				return this.getAllEnemiesOf(attacker);
			}
			case "all-dead-allies": {
				const combat = this.ensureCombatExists();
				const targets = combat.validCombatants(attacker)
				.filter( x => {
					const actor = x.actor;
					if (!actor) return false;
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
				return combat.validCombatants(attacker)
				.filter( x=> x.actorId != attacker.actor.id
					&& x?.actor?.isAlive())
				.map( x=> x.token as PToken);
			}
			case "everyone":{
				const combat= this.ensureCombatExists();
				return combat.validCombatants(attacker)
				.filter( x=> x?.actor?.isAlive())
				.map( x=> x.token as PToken);
			}

			default:
				power.system.targets satisfies never;
				throw new PersonaError(`targets ${power.system.targets} Not yet implemented`);
		}
	}

	static checkTargets(min: number, max: number, aliveTargets= true, altTargets?: PToken[]) {
		const selected: PToken[] = (altTargets ? altTargets :  Array.from(game.user.targets).map( x=> x.document))
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
		const clamp = Math.clamp(val,0,6);
		await this.setFlag("persona", "escalation", clamp);
	}

	async setSocialEncounter(isSocial: boolean) {
		await this.setFlag("persona", "isSocial", isSocial);
	}

	get isSocial() : boolean {
		return this.getFlag("persona", "isSocial") ?? false;
	}

	isEngagedByAnyFoe(subject: UniversalTokenAccessor<PToken>) : boolean {
		const tok = PersonaDB.findToken(subject);
		return EngagementChecker.isEngagedByAnyFoe(tok, this);
	}

	isInMeleeWith (token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
		const t1 = PersonaDB.findToken(token1);
		const t2 = PersonaDB.findToken(token2);
		const melee = EngagementChecker.getTokensInMelee(t1, this);
		return melee.has(t2);
	}

	isEngaging(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
		const t1 = PersonaDB.findToken(token1);
		const t2 = PersonaDB.findToken(token2);
		return EngagementChecker.isEngaging(t1, t2, this);
	}

	isEngagedBy(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
		const t1 = PersonaDB.findToken(token1);
		const t2 = PersonaDB.findToken(token2);
		return EngagementChecker.isEngagedBy(t1, t2, this);
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
	static async rollSave (actor: ValidAttackers, {DC, label, askForModifier, saveVersus, modifier} :SaveOptions) : Promise<{success:boolean, total:number, natural: number}> {
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
		const roll = new RollBundle(labelTxt, r, actor.system.type == "pc", mods, situation);
		await roll.toModifiedMessage();
		return {
			success: roll.total >= difficulty,
			total: roll.total,
			natural: roll.natural,
		}
	};

	static async disengageRoll( actor: ValidAttackers, DC = 11) : Promise<{total: number, rollBundle: RollBundle, success: boolean}> {
		const situation : Situation = {
			user: PersonaDB.getUniversalActorAccessor(actor),
		}
		const mods = actor.getDisengageBonus();
		const labelTxt = `Disengage Check`;
		const roll = new Roll("1d20");
		await roll.roll();
		const rollBundle = new RollBundle(labelTxt, roll, actor.system.type == "pc", mods, situation);
		return {
			total: rollBundle.total,
			rollBundle,
			success: rollBundle.total >= DC,
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
		if (token.actor.hasStatus("baton-pass"))
			return true;
		return (this.combatant.token.id == token.id)
	}

	async preSaveEffect( total: number, effect: PersonaAE, actor: PersonaActor) : Promise<string[]> {
		let retstr: string[] = [];
		const statuses = Array.from(effect.statuses)
		for (const status of statuses) {
			switch (status) {
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
		const allies = combat.getAllies(comb)
			.filter(comb=> comb.actor && comb.actor.isCapableOfAction() && !comb.actor.isDistracted());
		const numOfAllies = allies.length;
		if (numOfAllies < 1) {
			ui.notifications.notify("Not enough allies to all out attack!");
			return;
		}
		if (!comb || !actor?.isOwner) return;
		PersonaSFX.onAllOutPrompt();
		if (!await HTMLTools.confirmBox("All out attack!", `All out attack is available, would you like to do it? <br> (active Party members: ${numOfAllies})`)
		) return;
		if (!actor.hasStatus("bonus-action")) ui.notifications.warn("No bonus action");
		const allOutAttack = PersonaDB.getBasicPower("All-out Attack");
		if (!allOutAttack) throw new PersonaError("Can't find all out attack in database");
		await PersonaCombat.usePower(comb.token as PToken, allOutAttack);
	}

	findCombatant(token :PToken) : Combatant<ValidAttackers> | undefined {
		return this.validCombatants().find( comb=> comb.token == token);
	}

	getAllies(comb: Combatant<ValidAttackers>) : Combatant<ValidAttackers>[] {
		const allegiance = comb.actor?.getAllegiance();
		if (!allegiance) return [];
		return this.validCombatants().filter( c => c.actor != null
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
			if (actor.isDistracted() || !actor.isCapableOfAction())
				continue;
			const wpndmg = actor.wpnDamage();
			const mult = actor.wpnMult() + (actor.system.combat.classData.level / 3);
			const bonusdmg = actor.getBonusWpnDamage();

			dmg.high+= (wpndmg.high * mult) + bonusdmg.high.total(situation) ;
			dmg.low += (wpndmg.low * mult) + bonusdmg.low.total(situation);
		}
		dmg.high /= 3;
		dmg.low /= 3;
		dmg.high = Math.round(dmg.high);
		dmg.low = Math.round(dmg.low);
		return dmg;
	}

	getToken( acc: UniversalActorAccessor<ValidAttackers>  | undefined): UniversalTokenAccessor<PToken> | undefined {
		if (!acc) return undefined;
		if (acc.token) return acc.token;
		const token = this.combatants.find( comb=> comb?.actor?.id == acc.actorId && comb.actor.token == undefined)?.token;
		if (token) return PersonaDB.getUniversalTokenAccessor(token);
		return undefined;
	}

	getRoomEffects() : UniversalModifier[] {
		const effectIds= this.getFlag<string[]>("persona", "roomEffects")
		const allRoomEffects = PersonaDB.getRoomModifiers();
		if (!effectIds) return [];
		return effectIds.flatMap(id=> {
			const effect = allRoomEffects.find(eff => eff.id == id);
			return effect ? [effect] : [];
		});
	}

	async alterRoomEffects() {
		const initial = this.getRoomEffects().map( x=> x.id);
		const result = await this.roomEffectsDialog(initial, false);
		await this.setRoomEffects(result.roomModifiers);
		const msg = this.roomEffectsMsg();
		const messageData: MessageData = {
			speaker: {alias: "Room Effects Update"},
			content: msg,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		ChatMessage.create(messageData, {});
	}

	roomEffectsMsg(): string {
		const mods = this.getRoomEffects();
		if (mods.length == 0) {
			return "";
		}
		let msg = "";
		msg += "<u><h2>Room Effects</h2></u><ul>";
		msg += mods.map( x=> `<li><b>${x.name}</b> : ${x.system.description}</li>`).join("");
		msg += "</ul>";
		return msg;
	}

	async setRoomEffects(effects: ModifierContainer[]) {
		await this.setFlag("persona", "roomEffects", effects.map(eff=> eff.id));
	}

	async roomEffectsDialog(initialRoomModsIds: string[] = [], startSocial: boolean) : Promise<DialogReturn> {
		const roomMods = PersonaDB.getRoomModifiers();
		const ROOMMODS = Object.fromEntries(roomMods.map( mod => [mod.id, mod.name]));
		const html = await renderTemplate("systems/persona/sheets/dialogs/room-effects.hbs", {
			ROOMMODS : {
				"": "-",
				...ROOMMODS
			},
			roomMods: initialRoomModsIds,
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

	debug_engageList() {
		let list = [] as string[];
		const combs= this.combatants;
		for (const comb of combs) {
			const combAcc = PersonaDB.getUniversalTokenAccessor(comb.token);
			const foeEng = this.isEngagedByAnyFoe(combAcc) ? "*" : "";
			const engagedBy = combs
				.filter( c => this.isEngagedBy(combAcc, PersonaDB.getUniversalTokenAccessor(c.token)))
				.map(c=> c.name);
			list.push(`${comb.name}${foeEng} Engaged By: ${engagedBy.join(" , ")}`);
			const engaging = combs
				.filter( c=> this.isEngaging(combAcc, PersonaDB.getUniversalTokenAccessor(c.token)))
				.map( c=> c.name);
			list.push(`${comb.name}${foeEng} is Engaging: ${engaging.join(" , ")}`);
		}
		console.log(list.join("\n"));
	}

	async generateTreasure() {
		const actors = this.combatants
			.contents.flatMap( x=> x?.actor ? [x.actor] : [] );
		const shadows= actors
			.filter (x => x.system.type == "shadow");
		if (shadows.some(x=> x.hp > 0)) {
			return;
		}
		const pcs = actors.filter( x => x.system.type == "pc");
		return await Metaverse.generateTreasure(shadows, pcs);
	}

	displayEscalation(element : JQuery<HTMLElement>) {
		if (element.find(".escalation-die").length == 0) {
			const escalationTracker = `
			<div class="combat-info flexrow">
				<div class="escalation-tracker">
					<span class="title"> Escalation Die: </span>
					<span class="escalation-die">N/A
				</div>
				<div class="weather-icon">
				</div>
			</div>
				`;
			element.find(".combat-tracker-header").append(escalationTracker);
		}
		const weatherIcon = PersonaCalendar.getWeatherIcon();
		element.find("div.weather-icon").append(weatherIcon);
		const escalationDie = String(this.getEscalationDie());
		element.find(".escalation-die").text(escalationDie);
	}

	displayRoomEffectChanger(element: JQuery<HTMLElement>) {
		if (!game.user.isGM) return;
		if (element.find(".room-effects-button").length == 0) {
			const button = $( `
			<button>
			<i class="fa-solid fa-wand-magic-sparkles"></i>
			</button>
`).addClass("room-effects-button")
			.on("click", this.alterRoomEffects.bind(this));
			element.find(".combat-info").append(button);
		}
	}

	override async rollInitiative(ids: string[], {formula=null, updateTurn=true, messageOptions={}}={}) {

		// Structure input data
		ids = typeof ids === "string" ? [ids] : ids;
		const currentId = this.combatant?.id;

		// Iterate over Combatants, performing an initiative roll for each
		const updates = [];
		const rolls :{ combatant: Combatant, roll: Roll}[]= [];
		for ( let [i, id] of ids.entries() ) {

			// Get Combatant data (non-strictly)
			const combatant = this.combatants.get(id);
			if ( !combatant?.isOwner ) continue;

			// Produce an initiative roll for the Combatant
			const roll = combatant.getInitiativeRoll(formula);
			await roll.evaluate();
			rolls.push({combatant, roll});
			updates.push({_id: id, initiative: roll.total});

		}
		if ( !updates.length ) return this;

		// Update multiple combatants
		await this.updateEmbeddedDocuments("Combatant", updates);

		// Ensure the turn order remains with the same combatant
		if ( updateTurn && currentId ) {
			await this.update({turn: this.turns.findIndex(t => t.id === currentId)});
		}

		await this.generateInitRollMessage(rolls, messageOptions);
		// Create multiple chat messages
		// await ChatMessage.implementation.create(messages);
		return this;
	}

	async generateInitRollMessage<R extends Roll>(rolls: {combatant: Combatant, roll: R}[], messageOptions: MessageOptions = {}): Promise<ChatMessage<R>> {
		const rollTransformer = function (roll: Roll) {
			const total = roll.total;
			if (total <= 0) return "last";
			else return Math.round(total);
		}
		const rolltxt = rolls
		.sort( (a, b) => b.roll.total - a.roll.total)
		.map(({roll, combatant}) => `<div class="init-roll"> ${combatant.name}: ${rollTransformer(roll)} </div>`)
		.join("");
		const html = `<h3 class="init-rolls"> Initiative Rolls </h3> ${rolltxt}`;
		const chatMessage: MessageData<R> = {
			speaker: {},
			content: html,
			rolls: rolls.map(x=> x.roll),
		}
		return await ChatMessage.create(chatMessage, messageOptions)
	}

} // end of class


export type ValidAttackers = Subtype<PersonaActor, "pc"> | Subtype<PersonaActor, "shadow">;

export type PToken = TokenDocument<ValidAttackers> & {get actor(): ValidAttackers};

CONFIG.Combat.initiative = {
	formula : "1d10 + @parent.init",
	decimals: 2
};

type DialogReturn = {
	roomModifiers: UniversalModifier[],
	isSocialScene: boolean,
	advanceCalendar: boolean,
	disallowMetaverse: boolean,
}

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

CombatHooks.init();
