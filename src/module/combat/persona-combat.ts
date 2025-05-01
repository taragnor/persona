import { PersonaScene } from "../persona-scene.js";
import { Power } from "../item/persona-item.js";
import { SkillCard } from "../item/persona-item.js";
import { UsableAndCard } from "../item/persona-item.js";
import { NPCAlly } from "../actor/persona-actor.js";
import { PC } from "../actor/persona-actor.js";
import { AnyStringObject } from "../../config/precondition-types.js";
import { randomSelect } from "../utility/array-tools.js";
import { CombatHooks } from "./combat-hooks.js";
import { DamageConsequence } from "../../config/consequence-types.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { NonCombatTriggerTypes } from "../../config/triggers.js";
import { Shadow } from "../actor/persona-actor.js";
import { PersonaCalendar } from "../social/persona-calendar.js";
import { POWER_TAGS } from "../../config/power-tags.js";
import { PowerTag } from "../../config/power-tags.js";
import { ConditionTarget } from "../../config/precondition-types.js";
import { ConsTarget } from "../../config/consequence-types.js";
import { PersonaSocial } from "../social/persona-social.js"
import { UniversalModifier } from "../item/persona-item.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";
import { CombatTriggerTypes } from "../../config/triggers.js";
import { PersonaSFX } from "./persona-sfx.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { DamageType } from "../../config/damage-types.js";
import { ModifierContainer } from "../item/persona-item.js";
import { Consequence } from "../../config/consequence-types.js";
import { TurnAlert } from "../utility/turnAlert.js";
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
import { OtherEffect } from "../../config/consequence-types.js";
import { Consumable } from "../item/persona-item.js";

declare global {
	interface SocketMessage {
"QUERY_ALL_OUT_ATTACK" : {};
	}
}

declare global {
	interface HOOKS {
		"onUsePower": (power: UsableAndCard, user: PToken, defender: PToken) => any;
		"onTakeDamage": (token: PToken, amount: number, damageType: DamageType)=> any;
		"onAddStatus": (token: PToken, status: StatusEffect) => any;
	}
}

type AttackRollType = "activation" | "standard" | "reflect" | number; //number is used for bonus attacks


export class PersonaCombat extends Combat<ValidAttackers> {

	// declare combatants: Collection<Combatant<ValidAttackers>>;
	// engagedList: Combatant<PersonaActor>[][] = [];
	_engagedList: EngagementList;
	static customAtkBonus: number;
	consecutiveCombat: number =0;
	defeatedFoes : PersonaActor[] = [];
	lastActivationRoll: number;

	constructor (...args: unknown[]) {
		super(...args);
		this.consecutiveCombat = 0;
		this.defeatedFoes = [];
	}

	get validEngagementCombatants(): (Combatant <ValidAttackers> & {actor: ValidAttackers})[] {
		return this.combatants.contents.filter( comb => {
			const actor = comb.token.actor;
			if (!actor) return false;
			if (actor.hasStatus("charmed")) return false;
			if (!actor.isAlive()) return false;
			return true;
		}) as (Combatant <ValidAttackers> & {actor: ValidAttackers})[];

	}

	override async startCombat() {
		let msg = "";
		this._engagedList = new EngagementList(this);
		await this._engagedList.flushData();
		const assumeSocial = !(this.combatants.contents.some(comb=> comb.actor && comb.actor.system.type == "shadow"));
		const regionMods = (game.scenes.current as PersonaScene).getRoomEffects();
		// const regionMods = Metaverse.getRegion()?.roomEffects.map(x=> x.id) ?? [];
		const combatInit = await this.roomEffectsDialog(regionMods, assumeSocial);
		await this.setSocialEncounter(combatInit.isSocialScene);
		if (combatInit.isSocialScene != this.isSocial) {
			throw new PersonaError("WTF Combat not updating!");
		}
		if (combatInit.isSocialScene) {
			if (PersonaSettings.debugMode() == false) {
				await Metaverse.exitMetaverse();
			}
			await PersonaSocial.startSocialCombatRound(combatInit.disallowMetaverse, combatInit.advanceCalendar);
		}
		const mods = combatInit.roomModifiers;
		this.setRoomEffects(mods);
		await this.setEscalationDie(0);

		msg += this.roomEffectsMsg();
		if (msg.length > 0) {
			const messageData: MessageData = {
				speaker: {alias: "Combat Start"},
				content: msg,
				style: CONST.CHAT_MESSAGE_STYLES.OOC,
			};
			await ChatMessage.create(messageData, {});
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
		await this.onEndCombat();
		return await super.delete()
	}

	async onEndCombat() : Promise<void> {
		if (!game.user.isGM) return;
		this.refreshActorSheets();
		await this.generateTreasureAndXP();
		if (this.isSocial && await HTMLTools.confirmBox("Enter Meta", "Enter Metaverse?", true)) {
			await Metaverse.enterMetaverse();
		}
		await this.combatantsEndCombat();
		// await PersonaCombat.onTrigger("on-combat-end-global").emptyCheck()?.toMessage("Triggered Effect", undefined);
		if (this.didPCsWin()) {
			await this.clearFoes();
		}

	}

	didPCsWin(): boolean {
		const actorList = this.combatants.contents
		.map( x=> x?.actor)
		.filter (x=> x!= undefined);
		const isPCStanding = actorList
		.some ( c=> c.isAlive() && c.getAllegiance() == "PCs")
		const isShadowStanding = actorList
		.some ( c=> c.isAlive() && c.getAllegiance() == "Shadows")
		const PCsWin = isPCStanding && !isShadowStanding;
		return PCsWin;
	}

	async combatantsEndCombat() : Promise<void> {
		await this.endCombatTriggers();
		await this.reviveFallenActors();
		for (const c of this.combatants) {
			try {
				await c.actor?.onEndCombat()
			} catch (e) {
				PersonaError.softFail(e);
				console.warn(e);
			}
		}
	}

	async reviveFallenActors(): Promise<void> {
		for (const combatant of this.combatants) {
			const actor = combatant.actor;
			if (!actor) continue;
			if (actor.isFading()) {
				await actor.modifyHP(1);
			}
		}

	}

	async endCombatTriggers() : Promise<void> {
		const PCsWin = this.didPCsWin();
		for (const comb of this.combatants) {
			if (!comb.actor) continue;
			const situation : Situation = {
				trigger: "on-combat-end",
				triggeringUser: game.user,
				hit: PCsWin,
				user: comb.actor.accessor
			};
			await TriggeredEffect.onTrigger("on-combat-end", comb.actor, situation)
				.emptyCheck()
				?.toMessage("End Combat Triggered Effect", comb.actor);
		}
		await TriggeredEffect.onTrigger("on-combat-end-global").emptyCheck()?.toMessage("End Combat Global Trigger", undefined);

	}

	async checkEndCombat() : Promise<boolean> {
		if (this.isSocial) return false;
		const winner = this.combatants.find(x=>
			x.actor != undefined
			&& x.actor.isAlive()
			&& !this.getAllies(x)
			.some( ally => ally.actor && ally.actor.hasStatus("charmed"))
			&& !this.getFoes(x)
			.some(f => !f.isDefeated)
		);
		if (winner) {
			if (await this.endCombat()) {
				return true;
			}
		}
		return false;
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

	override async endCombat() : Promise<boolean> {
		const dialog = await HTMLTools.confirmBox("End Combat", "End Combat?");
		if (dialog == false) return false;
		const nextCombat = await this.checkForConsecutiveCombat();
		if (!nextCombat) {
			this.delete();
			return true;
		}
		await this.prepareForNextCombat();
		return true;
	}

	async prepareForNextCombat() {
		const actors = await this.clearFoes();
		this.defeatedFoes = this.defeatedFoes.concat(actors);
		for (const comb of this.combatants) {
			try {
				const actorType = comb.actor?.system?.type;

				switch (actorType) {
					case "pc":
					case"npcAlly":
						await comb.update({"initiative": null});
						break;
					case "shadow":
						break;
					case undefined:
						break;
					default:
						actorType satisfies never;
						PersonaError.softFail(`${actorType} is an invalid Actor type for a combatant`);
						break;
				}
			} catch(e) {
				PersonaError.softFail(`Error resetting initiative for ${comb?.name}`);
			}
		}
		await this.update({ "round": 0, });
	}

	async clearFoes() : Promise<PersonaActor[]> {
		if (this.isSocial) return [];
		const combatantsToDelete = this.combatants
		.filter(x => x.token != undefined
			&& x.actor != undefined
			&& !x.actor.isAlive()
			&& x.actor.system.type == "shadow"
			&& !x.token.isLinked);
		const tokensToDelete = combatantsToDelete.map( x=> x.token.id);
		await game.scenes.current.deleteEmbeddedDocuments("Token", tokensToDelete);
		return combatantsToDelete.flatMap(x=> x.actor ? [x.actor] : []);
	}

	async checkForConsecutiveCombat() : Promise<boolean> {
		const region = Metaverse.getRegion();
		if (!region)  return false;
		this.consecutiveCombat += 1;
		const check = await region.presenceCheck(-this.consecutiveCombat);
		if (!check) {
			this.consecutiveCombat = 0;
			return false;
		}
		return true;
	}

	validCombatants(attacker?: PToken): Combatant<ValidAttackers>[] {
		const challenged = attacker?.actor.hasStatus("challenged");
		return this.combatants.contents.filter( x=> {
			if (!x.actor) {return false;}
			if (attacker == x.token) {return true;}
			if (challenged || x.actor.hasStatus("challenged")) {
				if (!this.isEngaging(PersonaDB.getUniversalTokenAccessor(attacker!), PersonaDB.getUniversalTokenAccessor(x.token as PToken))) {
					return false;
				}
			}
			return true;
		}) as Combatant<ValidAttackers>[];
	}

	async ensureSheetOpen(combatant: Combatant<ValidAttackers>) {
		if (!combatant.actor) return;
		for (const comb of this.combatants) {
			if (comb != combatant && comb.actor && comb.actor.sheet._state >= 0)
				comb.actor.sheet.close();
		}
		if (combatant.actor.sheet._state <= 0) {
			await combatant.actor.sheet.render(true);
		}
	}

	async startCombatantTurn( combatant: Combatant<ValidAttackers> ){
		let baseRolls : Roll[] = [];
		const rolls : RollBundle[] = [];
		const actor = combatant.actor;
		if (!actor) return;
		if (actor.isOwner && !game.user.isGM)
			TurnAlert.alert();
		if (!game.user.isGM) return;
		if (await this.checkEndCombat() == true) {
			return;
		}
		await actor.refreshActions();
		if (!combatant.actor?.hasPlayerOwner) {
			await this.ensureSheetOpen(combatant);
		}
		let startTurnMsg = [ `<u><h2> Start of ${combatant.token.name}'s turn</h2></u><hr>`];
		const engaged = this.getAllEngagedEnemies(combatant);
		if (engaged.length > 0) {
			const engagedMsg  = `<div> <b>Engaged By:</b> ${engaged.map(x=> x.name).join(", ")}</div>`;
			startTurnMsg.push(engagedMsg);
		}
		startTurnMsg = startTurnMsg.concat(
			await (actor as PC | Shadow).onStartCombatTurn(),
			await this.handleStartTurnEffects(combatant),
		);
		await this.execStartingTrigger(combatant);
		const openingReturn = await this.execOpeningRoll(combatant);
		if (openingReturn) {
			const {data, roll} = openingReturn;
			const initialMsg = `<h3> Opening Roll -> ${roll.total}</h3>`;
			const concatData =
				data.map( ret => {
					const optionsMap = ret.options.map( opt=> {
						const mandatoryStr = opt.mandatory ? "<b>(Mandatory)</b>": "";
						return `<li> ${mandatoryStr} ${opt.optionTxt}  </li>`;
					});
					const list = optionsMap.length ? `<ul>${optionsMap.join("")}</ul>`: "";
					return `${ret.msg.join("")} ${list}`;
				});
			startTurnMsg.push(initialMsg);
			startTurnMsg = startTurnMsg.concat(concatData);
			baseRolls.push(roll);
		}
		const speaker = {alias: "Combat Turn Start"};
		let messageData = {
			speaker: speaker,
			content: startTurnMsg.join("<br>"),
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
			rolls: rolls.map(r=> r.roll).concat(baseRolls),
			sound: rolls.length + baseRolls.length > 0 ? CONFIG.sounds.dice : undefined
		};
		await ChatMessage.create(messageData, {});
	}

	async	execStartingTrigger(combatant: PersonaCombat["combatant"]) {
		const triggeringCharacter  = (combatant as Combatant<ValidAttackers>)?.token?.actor?.accessor;
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
	}


	async execOpeningRoll( combatant: Combatant<ValidAttackers> ) : Promise<{data: OpenerOptionsReturn[], roll: Roll} | null> {
		let returns :OpenerOptionsReturn[]= [];
		if (this.isSocial) {return null;}
		const actor = combatant.actor;
		if (!actor) return null;
		const openingRoll = new Roll("1d20");
		await openingRoll.roll()
		const rollValue = openingRoll.total;
		const situation : Situation = {
			user: actor.accessor,
			openingRoll: rollValue,
			activeCombat: true,
		}
		returns.push(
			await this.fadingRoll(combatant, situation),
			this.mandatoryOtherOpeners(combatant, situation),
			this.sleepEffect(combatant),
			this.saveVsFear(combatant, situation),
			this.saveVsDespair(combatant, situation),
			this.saveVsConfusion(combatant, situation),
			this.saveVsCharm(combatant, situation),
			this.rageOpener(combatant, situation),
			this.disengageOpener(combatant, situation),
			this.otherOpeners(combatant, situation),
		);
		const mandatory = returns.find(r => r.options.some( o=> o.mandatory));
		if (mandatory) {
			return  {
				roll: openingRoll,
				data: [{
					msg: mandatory.msg,
					options: [mandatory.options.find(x=> x.mandatory)!],
				}]
			};
		};
		const data = returns.filter(x=> x.msg.length > 0);
		return {
			roll: openingRoll,
			data,
		};
	}

	mockOpeningSaveTotal( combatant: Combatant<ValidAttackers> , situation: Situation, status: StatusEffectId) : number | undefined {
		const rollValue = situation.openingRoll ?? -999;
		if (!combatant.actor) return undefined;
		const statusEffect = combatant.actor.getStatus(status);
		if (!statusEffect && status != "fading") return undefined;
		const saveSituation : Situation = {
			...situation,
			saveVersus: status
		};
		const saveBonus = combatant.actor.getBonuses("save").total(saveSituation);
		return saveBonus + rollValue;
	}

	sleepEffect( combatant: Combatant<ValidAttackers>) : OpenerOptionsReturn {
		let options : OpenerOptionsReturn["options"] = [];
		let msg : string[] = [];
		if (!combatant?.actor?.hasStatus("sleep"))  {
			return {msg, options};
		}
		msg.push(`Sleeping`);
		options.push({
			optionTxt: "Sleep Soundly",
			mandatory: true,
			optionEffects: [],
		});
		return {msg, options};
	}

	saveVsCharm ( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
		let options : OpenerOptionsReturn["options"] = [];
		let msg : string[] = [];
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, "charmed");
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Charm (${saveTotal}) -->`);
		switch (true) {
			case (saveTotal >= 16): {
				msg.push(`Success (Remove Charm)`);
				options.push({
					optionTxt: "Clear Charm and act normally (Lose opening action)",
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			case (saveTotal >= 11): {
				msg.push(`Success (Dazed)`);
				options.push({
					optionTxt: "You stand around and do nothing",
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			case (saveTotal < 6) : {
				msg.push(`Failure (Buff, Heal or attack)`);
				options.push({
					optionTxt: "The enemy chooses your action , causing you to cast a single target healing or buffing effect on an enemy or making a basic attack against an ally",
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			default:
				msg.push(`Failure (Basic Attack)`);
				options.push({
					optionTxt: "Basic Attack against an ally of the enemy's choice",
					mandatory: true,
					optionEffects: [],
				});
		}
		return {msg, options};
	}

	saveVsConfusion ( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
		let options : OpenerOptionsReturn["options"] = [];
		let msg : string[] = [];
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, "confused");
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Confusion (${saveTotal}) -->`);
		switch (true) {
			case (saveTotal >= 16):{
				msg.push(`Success`);
				break;
			}
			case (saveTotal <= 5):{
				msg.push(`Failure (Miss Turn + lose 10% Resources)`);
				options.push({
					optionTxt: "Throw Away Money (Miss Turn + lose 10% Resources)",
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			default:
				msg.push(`Failure (Miss Turn)`);
				options.push({
					optionTxt: "Stand around confused (Miss Turn)",
					mandatory: true,
					optionEffects: [],
				});
		}
		return {msg, options};
	}

	saveVsDespair ( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
		let options : OpenerOptionsReturn["options"] = [];
		let msg : string[] = [];
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, "despair");
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Despair (${saveTotal}) -->`);
		switch (true) {
			case (saveTotal >= 11):{
				msg.push(`Success`);
				break;
			}
			default:
				msg.push(`Failure (Miss Turn)`);
				options.push({
					optionTxt: "Wallow in Despair (Miss Turn)",
					mandatory: true,
					optionEffects: [],
				});
		}
		return {msg, options};
	}

	saveVsFear( combatant: Combatant<ValidAttackers> , situation: Situation) : OpenerOptionsReturn {
		let options : OpenerOptionsReturn["options"] = [];
		let msg : string[] = [];
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, "fear");
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Fear (${saveTotal}) -->`);
		switch (true) {
			case (saveTotal >= 11):{
				msg.push(`Success`);
				break;
			}
			case (saveTotal <= 2) : {
				msg.push(`Failure (Flee)`);
				options.push({
					optionTxt: "Flee from Combat",
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			default:
				msg.push(`Failure (Miss Turn)`);
				options.push({
					optionTxt: "Cower in Fear (Miss Turn)",
					mandatory: true,
					optionEffects: [],
				});
		}
		return {msg, options};
	}

	rageOpener( combatant: Combatant<ValidAttackers> , _situation: Situation) : OpenerOptionsReturn {
		let msg : string[] = [];
		let options : OpenerOptionsReturn["options"] = [];
		if (combatant?.actor?.hasStatus("rage")) {
			msg.push(`Battle Rage`);
			options.push({
				optionTxt: "Attack nearest random enemy",
				mandatory: true,
				optionEffects: [],
			});
		}
		return {msg, options};
	}

	disengageOpener( combatant: Combatant<ValidAttackers> , situation: Situation) :OpenerOptionsReturn {
		let options : OpenerOptionsReturn["options"] = [];
		const rollValue = situation.openingRoll ?? -999;
		let msg : string[] = [];
		if (!combatant.actor?.isCapableOfAction()
			|| combatant.actor?.hasStatus("challenged")
		) {
			return {msg, options};
		}
		const accessor = PersonaDB.getUniversalTokenAccessor(combatant.token as PToken);
		if (!this.isEngagedByAnyFoe(accessor)) {
			const ret : OpenerOptionsReturn = {
				msg, options
			};
			return ret;
		}
		const alliedDefenders = this.getAlliedEngagedDefenders(accessor);
		if (alliedDefenders.length > 0) {
			msg.push(`<br>Can Freely disengage thanks to ${alliedDefenders.map(x=> x.name).join(", ")}`);
			return {msg, options};
		}
		if (!combatant.actor) return { msg, options};
		const disengageBonus = combatant.actor.getBonuses("disengage").total(situation);
		const disengageTotal = disengageBonus + rollValue;
		msg.push( `Disengage Total: ${disengageTotal}`);
		switch (true) {
			case disengageTotal > 16 :
				options.push( {
					optionTxt: "Expert Disengage",
					optionEffects: [],
					mandatory: false,
				});
				break;
			case disengageTotal > 11:
				options.push( {
					optionTxt: "Standard Disengage",
					optionEffects: [],
					mandatory: false,
				});
				break;
		}
		return { msg, options};
	}

	getOpenerPrintableName(usable: Usable, user: Combatant<ValidAttackers>, situation: Situation) : string  | undefined {
		const targets= this.getValidTargetsFor(usable, user, situation)
			.map( target=> target.name);
		if (targets.length == 0) return undefined;
		return `${usable.displayedName} (${targets.join(", ")}): ${usable.system.description}`;
	}

	mandatoryOtherOpeners( combatant: Combatant<ValidAttackers> , situation: Situation): OpenerOptionsReturn {
		let options : OpenerOptionsReturn["options"] = [];
		let msg : string[] = [];
		if (!combatant.actor) return { msg, options};
		const mandatoryActions = combatant.actor.openerActions.filter( x=> x.hasTag("mandatory"));
		const usableActions = mandatoryActions
			.filter( action => {
				const useSituation : Situation = {
					...situation,
					usedPower: action.accessor,
				};
				return action.testOpenerPrereqs(useSituation, combatant.actor!);
			});
		options = usableActions
			.flatMap( action =>  {
				const printableName = this.getOpenerPrintableName(action, combatant, situation);
				if (!printableName) return [];
				return [{
					mandatory: action.hasTag("mandatory"),
					optionTxt: printableName,
					optionEffects: []
				}];
			});
		if (options.length > 0) {
			msg.push(`Special Actions`);
		}
		return {msg, options};
	}

	otherOpeners( combatant: Combatant<ValidAttackers> , situation: Situation): OpenerOptionsReturn {
		let options : OpenerOptionsReturn["options"] = [];
		let msg : string[] = [];
		if (!combatant.actor) return { msg, options};
		if (!combatant.actor.isCapableOfAction()) {
			return {msg, options};
		}
		const openerActions = combatant.actor.openerActions;
		const usableActions = openerActions
			.filter( action => {
				const useSituation : Situation = {
					...situation,
					usedPower: action.accessor,
				};
				return action.testOpenerPrereqs(useSituation, combatant.actor!);
			});
		options = usableActions
			.flatMap( action =>  {
				const printableName = this.getOpenerPrintableName(action, combatant, situation);
				if (!printableName) return [];
				return [{
					mandatory: action.hasTag("mandatory"),
					optionTxt: printableName,
					optionEffects: []
				}];
			});
		if (options.length > 0) {
			msg.push(`Other Available Options`);
		}
		return {msg, options};
	}

	static isSameTeam( one: PToken | Combatant<ValidAttackers> | ValidAttackers, two: PToken | Combatant<ValidAttackers> | ValidAttackers) : boolean {
		const actor1 = one instanceof PersonaActor ? one: one.actor;
		const actor2 = two instanceof PersonaActor ? two: two.actor;
		if (!actor1 || !actor2) return false;
		return actor1.getAllegiance() == actor2.getAllegiance();
	}

	getAlliedEngagedDefenders(Tacc: UniversalTokenAccessor<PToken>) : PersonaCombatant[];
	getAlliedEngagedDefenders(comb: PersonaCombatant  ) : PersonaCombatant[];
	getAlliedEngagedDefenders(Tacc: UniversalTokenAccessor<PToken> | PersonaCombatant) : PersonaCombatant[] {
		let comb : PersonaCombatant;
		if (! (Tacc instanceof Combatant)) {
			const token = PersonaDB.findToken(Tacc);
			if (!token) return [];
			const combTest =  this.findCombatant(token);
			if (!combTest) return [];
			comb = combTest;
		} else {
			if (!Tacc.token.actor) {
				return [];
			}
			comb = Tacc;
		}
		const meleeCombatants = EngagementChecker.listOfCombatantsInMelee(comb, this);
		return meleeCombatants
			.filter( x=> x.actor && x.actor.statuses.has("sticky")
				&& PersonaCombat.isSameTeam(comb,x )
				&& x.actor.canEngage()
			);
	}

	getValidTargetsFor(usable: Usable, user: Combatant<ValidAttackers>, situation: Situation): Combatant<ValidAttackers>[]  {
		const userActor = user.token.actor;
		if (!userActor) return [];
		return this.combatants.filter( comb =>  {
			const targetActor = comb.token.actor;
			if (!targetActor) return false;
			return this.isValidTargetFor( usable, user, comb, situation);
		});
	}

	isValidTargetFor(usable: Usable, user: Combatant<ValidAttackers>, target: Combatant<ValidAttackers>, situation: Situation): boolean {
		const userActor = user.token.actor;
		const targetActor = target.token.actor;
		if (!userActor || !targetActor) return false;
		if (!usable.isValidTargetFor(userActor, targetActor, situation))
			return false;
		const targetChallenged = targetActor.hasStatus("challenged");
		const userChallenged = userActor.hasStatus("challenged");
		if (userChallenged) {
			if (!targetChallenged) return false;
			if (!this.isInChallengeWith(user, target))
				return false;
		} else {
			if (targetChallenged) return false;
		}
		return true;
	}

	isInChallengeWith(user: Combatant<ValidAttackers>, target: Combatant<ValidAttackers>) : boolean {
		const userActor = user.token.actor;
		const targetActor = target.token.actor;
		if (!userActor || !targetActor) return false;
		if (!userActor.hasStatus("challenged"))
			return false;
		if (!targetActor.hasStatus("challenged"))
			return false;
		return EngagementChecker.isWithinEngagedRange(user.token as PToken, target.token as PToken);

	}

	getAllEngagedEnemies(subject: PersonaCombatant): PersonaCombatant[] {
		return EngagementChecker.getAllEngagedEnemies(subject, this);
	}
	getDisengageDC(combatant: PersonaCombatant) : number {
		if (!combatant.token) return 11;
		const list = EngagementChecker.getAllEngagedEnemies(combatant, this);
		for (const item of list) {
			if (item.actor && item.actor.isSticky()) return 16;
		}
		return 11;
	}

	async skipBox(msg: string) {
		if (await HTMLTools.confirmBox(msg, msg)) {
			this.nextTurn();
		}
	}

	async endTurn(combatant: Combatant<ValidAttackers>) {
		const actor = combatant.actor;
		if (!actor) return;
		if (!actor.isOwner) return;
		if (this.isSocial) {
			if (!actor.isPC()) return;
			await PersonaSocial.endSocialTurn(actor);
			return;
		}
		const triggeringCharacter  = (combatant as Combatant<ValidAttackers>)?.token?.actor?.accessor;
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
		const notes = await actor?.onEndCombatTurn() ?? [];
		if (notes.length > 0) {
			const messageData: MessageData = {
				speaker: {alias: "End of Turn"},
				content: notes.join("<br>"),
				style: CONST.CHAT_MESSAGE_STYLES.OOC,
			};
			await ChatMessage.create(messageData, {});
		}
	}

	async fadingRoll( combatant: Combatant<ValidAttackers> , situation: Situation) : Promise<OpenerOptionsReturn> {
		let options : OpenerOptionsReturn["options"] = [];
		let msg : string[] = [];
		const actor = combatant.actor;
		if (
			!actor
			|| actor.hp > 0
			|| actor.system.type == "shadow"
		) {return  {msg, options}; }
		if (actor.hasStatus("full-fade")) {
			msg.push(`${combatant.name} is completely faded...`);
			options.push({
				optionTxt: "Completely Faded (Help in Spirit only)",
				mandatory: true,
				optionEffects: [],
			});
			return { msg, options};
		}
		const saveTotal = this.mockOpeningSaveTotal(combatant, situation, "fading");
		if (saveTotal == undefined) {
			return {msg, options};
		}
		msg.push(`Resisting Fading (${saveTotal}) -->`);
		switch (true) {
			case situation.openingRoll == 20
					&& (actor as PC).getSocialSLWithTarot("Star") >= 3: {
						msg.push(`Critical Success`);
						options.push({
							optionTxt: `Star Benefit ( get up at 1 HP)`,
							mandatory: true,
							optionEffects: [],
						});
						break;
					}
			case (saveTotal >= 11):{
				msg.push(`Success`);
				options.push({
					optionTxt: `${actor.hasStatus("fading") ? "Barely " : ""}Hanging On (Help in Spirit Only)`,
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
			default: {
				msg.push(`Failure`);
				await actor.increaseFadeState();
				const fadeState = actor.hasStatus("fading") ? "Starting to Fade Away" : "Fully Fade Away (Ejected from Metaverse)";
				options.push({
					optionTxt: `${fadeState} (Help in Spirit Only)`,
					mandatory: true,
					optionEffects: [],
				});
				break;
			}
		}
		return { msg, options};
	}

	async handleStartTurnEffects(combatant: Combatant<ValidAttackers>): Promise<string[]> {
		const actor= combatant.actor;
		if (!actor) return [];
		let Msg: string[] = [];
		const debilitatingStatuses :StatusEffectId[] = [
			"sleep",
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
			Msg.push(`${combatant.name} is poisoned and will take ${damage} damage on each action. (original Hp: ${actor.hp})`);
		}
		return Msg;
	}

	get engagedList() : EngagementList {
		if (!this._engagedList)  {
			this._engagedList = new EngagementList(this);
		}
		return this._engagedList;
	}

	static async checkPowerPreqs(attacker: PToken, power: UsableAndCard) : Promise<boolean> {
		const combat = game.combat as PersonaCombat;
		if (combat && !combat.turnCheck(attacker, power)) {
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

	static async usePower(attacker: PToken, power: UsableAndCard) : Promise<CombatResult> {
		if (attacker instanceof Token) {
			throw new Error("Actual token found instead of token document");
		}
		if (!await this.checkPowerPreqs(attacker, power)) {
			return new CombatResult();
		}
		try {
			const isCard = power.system.type == "skillCard";
			const targets = await this.getTargets(attacker, power);
			if (!isCard && targets.some( target => target.actor.system.type == "shadow" ) && (power as Usable).system.targets != "self" ) {
				this.ensureCombatExists();
			}
			this.customAtkBonus = await HTMLTools.getNumber("Attack Modifier");
			const result = new CombatResult();
			await PersonaSFX.onUsePower(power);
			result.merge(await this.usePowerOn(attacker, power, targets, "standard"));
			const costs = await this.#processCosts(attacker, power, result.getOtherEffects(attacker.actor));
			result.merge(costs);
			result.finalize();
			if (!power.hasTag("opener"))  {
				await attacker.actor.expendAction();
			}
			await attacker.actor.removeStatus("baton-pass");
			await result.toMessage(power.name, attacker.actor);
			await this.postAction(attacker, result);
			return result;
		} catch(e) {
			console.log(e);
			throw e;
		}
	}

	static async postAction(attacker: PToken, result: CombatResult ) {
		await this.afterActionTriggered(attacker, result);
		const power = result.power;
		if (!power) return;
		const combat= game.combat as PersonaCombat | undefined;
		if (combat && combat.combatant?.token == attacker) {
			const shouldEndTurn =
				(
					combat.hasRunOutOfActions(combat.combatant)
					|| power == PersonaDB.getBasicPower("All-out Attack")
				) ;
			const autoEndTurn = PersonaSettings.autoEndTurn() && shouldEndTurn;
			if (shouldEndTurn) {
				if (autoEndTurn) {
					if (combat.forceAdvanceTurn) {
						await combat.setForceEndTurn(false);
					}
					await combat.nextTurn();
					return;
				}
				await combat.displayEndTurnMessage();
			}
		}
	}

	hasRunOutOfActions(combatant: Combatant<ValidAttackers>) : boolean {
		if (!combatant.actor) return false;
		const moreActions = combatant.actor.actionsRemaining || combatant.actor.hasStatus("bonus-action");
		const shouldEndTurn =
			(
				!moreActions
				|| this?.forceAdvanceTurn
			);
		return shouldEndTurn;
	}

	async displayEndTurnMessage(): Promise<ChatMessage | null>  {
		const combatant = this.combatant;
		const actor = combatant?.actor;
		const token = combatant?.token as PToken;
		if (!actor || !token)  {
			PersonaError.softFail("No actor for endTurn Message");
			return null;
		}
		const boldName = `<b>${token.name}</b>`;
		let content = `<div>${boldName} has run out of actions.</div>`;
		const pushMsg = `<div> ${boldName} can take an additional action by pushing themself, but this inflicts 1 fatigue level`;
		if (actor.fatigueLevel > 0 ) {
			content = content  + pushMsg;
		}
		if (actor.canEngage() && !this.isEngagedByAnyFoe(PersonaDB.getUniversalTokenAccessor(token))) {
			content += `<div> ${boldName} can choose target to engage</div>`;
		}
		content = `<div class="end-turn-msg"> ${content} </div>`;
		const messageData: Foundry.MessageData = {
			speaker: {
				alias: actor.displayedName ?? "ERROR"
			},
			content,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		return await ChatMessage.create(messageData, {});
	}

	get forceAdvanceTurn() : boolean {
		return this.getFlag<boolean>("persona", "autoEndTurn") ?? false;
	}

	async setForceEndTurn(val = true): Promise<void> {
		await this.setFlag("persona", "autoEndTurn", val);
	}

	static async afterActionTriggered(attacker: PToken, combatResult: CombatResult) {
		const situation : Situation = {
			trigger: "on-use-power",
			user: attacker.actor.accessor,
			usedPower: combatResult.power?.accessor,
			triggeringCharacter : attacker.actor.accessor,
			triggeringUser: game.user,
			combatResult,
		}
		await TriggeredEffect.execCombatTrigger("on-use-power", attacker.actor, situation);

	}

	static async usePowerOn(attacker: PToken, power: UsableAndCard, targets: PToken[], rollType : AttackRollType, modifiers: ModifierList = new ModifierList()) : Promise<CombatResult> {
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

	static getPTokenFromActorAccessor(acc: UniversalActorAccessor<PersonaActor>) : PToken | undefined {
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

	static async processSkillCard( attacker: PToken, usableOrCard: UsableAndCard, target: PToken, situation: Situation) : Promise<AttackResult | null> {
		if (usableOrCard.system.type != "skillCard") {
			return null;
		}
		const r = await new Roll("1d20").roll();
		const emptyList = new ModifierList();
		const roll = new RollBundle("Activation Roll Skiill Card", r, attacker.actor.system.type == "pc", emptyList, situation);
		const res : AttackResult = {
			result: "hit",
			target: PersonaDB.getUniversalTokenAccessor(target),
			attacker: PersonaDB.getUniversalTokenAccessor(attacker),
			power: usableOrCard.accessor,
			situation,
			roll,
			critBoost: 0,
			printableModifiers: []
		};
		return res;
	}

	static processAttackNullifiers(attacker : PToken , power :Usable, target: PToken, baseData: Pick<AttackResult, "attacker" | "target"  | "power" | "roll">, situation: Situation, rollType: AttackRollType): AttackResult | null
	{
		const naturalAttackRoll = situation.naturalRoll;
		if (!naturalAttackRoll) {
			PersonaError.softFail("No natural attack roll passed to siutuation in processAttackNullifiers");
		}
		const element = power.getDamageType(attacker.actor);
		const resist = target.actor.elementalResist(element);
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
		if (target.actor.hasStatus("phys-shield") && power.canBeReflectedByPhyiscalShield(attacker.actor)) {
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
		if (target.actor.hasStatus("magic-shield") && power.canBeReflectedByMagicShield(attacker.actor)) {
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
		return null;
	}

	static async processAttackRoll( attacker: PToken, usableOrCard: UsableAndCard, target: PToken, modifiers: ModifierList, rollType: AttackRollType) : Promise<AttackResult> {
		const combat = game.combat as PersonaCombat | undefined;
		const situation : Situation = {
			target: target.actor.accessor,
			usedPower: PersonaDB.getUniversalItemAccessor(usableOrCard),
			user: PersonaDB.getUniversalActorAccessor(attacker.actor),
			attacker: attacker.actor.accessor,
			activationRoll: rollType == "activation",
			activeCombat:combat ? !!combat.combatants.find( x=> x.actor?.system.type != attacker.actor.system.type): false ,
		};
		const cardReturn = await this.processSkillCard(attacker, usableOrCard, target, situation);
		if (cardReturn) return cardReturn;
		const power = usableOrCard as Usable;
		const element = power.getDamageType(attacker.actor);
		const resist = target.actor.elementalResist(element);
		const def = power.system.defense;
		const r = await new Roll("1d20").roll();
		if (situation.activationRoll) {
			const combat = game.combat as PersonaCombat;
			if (combat && !combat.isSocial) {
				combat.lastActivationRoll = r.total;
			}
		}
		const attackbonus = this.getAttackBonus(attacker.actor, power, target, modifiers);
		const cssClass=  (target.actor.system.type != "pc") ? "gm-only" : "";
		const roll = new RollBundle("Temp", r, attacker.actor.system.type == "pc", attackbonus, situation);
		const naturalAttackRoll = roll.dice[0].total;
		situation.naturalRoll = naturalAttackRoll;
		const defenseVal = def != "none" ? target.actor.getDefense(def).total(situation): 0;
		const validDefModifiers = def != "none" ? target.actor.getDefense(def).list(situation): [];
		const defenseStr =`<span class="${cssClass}">(${defenseVal})</span>`;
		const rollName =  `${attacker.name} (${power.name}) ->  ${target.name} vs. ${power.system.defense} ${defenseStr}`;
		roll.setName(rollName);
		const baseData = {
			roll,
			attacker: PersonaDB.getUniversalTokenAccessor(attacker) ,
			target: PersonaDB.getUniversalTokenAccessor(target),
			power: PersonaDB.getUniversalItemAccessor(power)
		} satisfies Pick<AttackResult, "attacker" | "target"  | "power" | "roll">;
		const testNullify = this.processAttackNullifiers(attacker, power, target, baseData, situation, rollType);
		if (testNullify)  {
			return testNullify;
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
		const powerDiff = this.calcPowerCritBoostTargetAdjust(attacker.actor, target.actor, power);
		critBoostMod.add("Power Level Difference", powerDiff);
		situation.resisted = resist == "resist";
		situation.struckWeakness = resist == "weakness";
		const critResist = target.actor.critResist().total(situation);
		critBoostMod.add("Enemy Critical Resistance", -critResist);
		const floor = situation.resisted ? -999 : 0;
		const critBoost = Math.max(floor, critBoostMod.total(situation));
		const rageOrBlind = attacker.actor.hasStatus("rage") || attacker.actor.hasStatus("blind");
		// console.debug(`
		// CritBoost ${critBoost}
		// Power Diff: ${powerDiff}
		// Enemy Crit Resist ${-critResist}
		// 	`);
		if (naturalAttackRoll == 1
			|| total < defenseVal
			|| (rageOrBlind && naturalAttackRoll % 2 == 1)
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
		const canCrit = typeof rollType == "number" ? false : true;
		if (naturalAttackRoll + critBoost >= 20
			&& (!power.isMultiTarget() || naturalAttackRoll % 2 == 0)
			&& !target.actor.hasStatus("blocking")
			&& !power.hasTag("no-crit")
			&& canCrit
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

	static calcPowerCritBoostTargetAdjust(attacker: ValidAttackers, target: ValidAttackers, power: Usable) {
		if (power.system.type != "power" || power.isBasicPower()) {
			return 0;
		}
		if (!power.isInstantDeathAttack()) {
			return 0;
		}
		const powerLevel = power.baseCritSlotBonus();
		const targetResist = target.basePowerCritResist(power);
		const diff = Math.max(0, powerLevel - targetResist);
		const mult = target.instantKillResistanceMultiplier(attacker);
		return Math.floor(diff * mult);
	}

	static async processEffects(atkResult: AttackResult) : Promise<CombatResult> {
		const CombatRes = new CombatResult();
		const {result } = atkResult;
		switch (result) {
			case "reflect":
				const reflectRes = new CombatResult(atkResult);
				const targetActor = PersonaDB.findToken(atkResult.target).actor;
				const power = PersonaDB.findItem(atkResult.power);
				const attacker = PersonaDB.findToken(atkResult.attacker);
				if ( targetActor.hasStatus("magic-shield") && power.canBeReflectedByMagicShield(attacker.actor)) {
					const cons : Consequence = {
						type: "removeStatus",
						statusName: "magic-shield",
					};
					reflectRes.addEffect(atkResult, targetActor, cons);
				}
				if (targetActor.hasStatus("phys-shield") && power.canBeReflectedByPhyiscalShield(attacker.actor)) {
					const cons : Consequence = {
						type: "removeStatus",
						statusName: "phys-shield",
					};
					reflectRes.addEffect(atkResult, targetActor, cons);
				}
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
						const effectiveTarget = PersonaCombat.resolveEffectiveTarget(cons.applyTo, atkResult, cons.cons);
						if (effectiveTarget) {
							CombatRes.addEffect(atkResult, effectiveTarget.actor!, cons.cons);
						}
					}
				}
			}
		}
		return CombatRes;
	}

	static resolveEffectiveTarget(applyTo :Consequence["applyTo"], atkResult: AttackResult, cons?: Consequence) : PToken | undefined {
		const situation = atkResult.situation;
		const attacker = PersonaDB.findToken(atkResult.attacker);
		const target = PersonaDB.findToken(atkResult.target);
		switch (applyTo) {
			case "target" :
				return target;
			case "attacker":
				return attacker;
			case "owner":
				if (cons && cons.actorOwner) {
					return this.getPTokenFromActorAccessor(cons.actorOwner);
				}
				ui.notifications.notify("Can't find Owner of Consequnece");
				return undefined;
			case "user":
				if (!situation.user) {return undefined;}
				const userToken  = this.getPTokenFromActorAccessor(situation.user);
				return userToken;
			case "triggering-character":
				const triggerer = "triggeringCharacter" in situation? situation.triggeringCharacter: undefined;
				if (!triggerer) {
					PersonaError.softFail("Can't target triggering character for this");
					return undefined;
				}
				const token = this.getPTokenFromActorAccessor(triggerer);
				return token;
			case "cameo":
				return undefined;
			case undefined:
				return target; //default to target since this is old material
				// PersonaError.softFail("cons.applyTo is undefined");
			default:
				applyTo satisfies never;
				return undefined;
		}
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
						damageType: (power as Usable).getDamageType(attacker),
					}
				}];
			case "dmg-low":
				return [{
					applyTo,
					cons: {
						type: "damage-new",
						damageSubtype: "low",
						amount: power.getDamage(attacker, "low", situation) * (absorb ? -1 : damageMult),
						damageType: (power as Usable).getDamageType(attacker),
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
			case "odd-even":
				if (situation.naturalRoll == undefined) {
					dmgAmt = 0;
					PersonaError.softFail(`Can't get odd even for damage of ${power.displayedName }` );
					break;
				}
				if ( (situation.naturalRoll ?? 0) % 2 == 0) {
					dmgAmt = power.getDamage(attacker, "high", situation, cons.damageType);
				} else {
					dmgAmt = power.getDamage(attacker, "low", situation, cons.damageType);
				}
				break;
			case "multiplier":
					return [{
						applyTo,
						cons
					}];
			case "high":
					dmgAmt = power.getDamage(attacker, "high", situation, cons.damageType);
				break;
			case "low":
				dmgAmt = power.getDamage(attacker, "low", situation, cons.damageType);
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
		const damageType = cons.damageType != "by-power" ? cons.damageType : (power as Usable).getDamageType(attacker);
		return [{
			applyTo,
			cons: {
				...cons,
				amount: dmgAmt * (absorb ? -1 : damageMult),
				damageType,
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
			case "add-creature-tag":
			case "escalationManipulation": //since this is no llonger handled here we do nothing
				break;
			case "extraAttack" :
			case "absorb":
			case "expend-slot":
			case "add-escalation":
			case "save-slot":
			case "revive":
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
			case "extraTurn":
			case "teach-power":
			case "combat-effect":
			case "alter-fatigue-lvl":
				return [{applyTo,cons}];
			case "expend-item":
				if (cons.itemId) {
					const item = game.items.get(cons.itemId) as Usable;
					if (!item) return [];
					return [{applyTo,
						cons: {
							type: "expend-item",
							itemId: item.id,
							itemAcc: (item as Consumable | SkillCard).accessor,
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

	static async execTrigger(trigger: CombatTriggerTypes, actor: ValidAttackers, situation?: Situation) : Promise<void> {
		return await TriggeredEffect.execCombatTrigger(trigger, actor, situation);
	}

	static onTrigger(trigger: CombatTriggerTypes | NonCombatTriggerTypes, actor ?: ValidAttackers, situation ?: Situation) : CombatResult {
		return TriggeredEffect.onTrigger(trigger, actor, situation);
	}

	static async #processCosts(attacker: PToken , usableOrCard: UsableAndCard, costModifiers: OtherEffect[]) : Promise<CombatResult>
	{
		const res = new CombatResult();
		switch (usableOrCard.system.type) {
			case "power": {
				const power  = usableOrCard as Power;
				if (power.system.subtype == "social-link") {
					if (power.system.inspirationId) {
						res.addEffect(null, attacker.actor, {
							type:"inspiration-cost",
							amount: power.system.inspirationCost,
							socialLinkIdOrTarot: power.system.inspirationId as unknown as AnyStringObject
						});
					}
				}
				if (attacker.actor!.system.type != "shadow" && power.hpCost()) {
					res.addEffect(null, attacker.actor!, {
						type: "hp-loss",
						amount: power.modifiedHpCost(attacker.actor)
					});
				}
				if (attacker.actor.system.type != "shadow" && power.system.subtype == "magic" && power.system.mpcost > 0) {
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
				break;
			case "skillCard":
			case "consumable" :{
				res.addEffect(null, attacker.actor, {
					type: "expend-item",
					itemId: "",
					itemAcc: PersonaDB.getUniversalItemAccessor(usableOrCard as SkillCard | Consumable),
				});
				break;
			}
			default:
				usableOrCard.system satisfies never;
		}
		return res;
	}

	static getAttackBonus(attacker: ValidAttackers, power: Usable, target: PToken | undefined, modifiers ?: ModifierList) : ModifierList {
		let attackBonus = this.getBaseAttackBonus(attacker, power);
		this.applyRelevantTagAttackBonus(attackBonus, attacker, power);
		if (power.isStatusEffect()) {
			attackBonus.add(`Status Effect Modifier`, -3);
		}
		if (power.isMultiTarget()) {
			attackBonus.add(`Multitarget attack penalty`, -3);
		}
		attackBonus.add("Custom modifier", this.customAtkBonus ?? 0);
		const defense = this.getDefenderAttackModifiers(target);
		attackBonus = attackBonus.concat(defense);
		if (modifiers) {
			attackBonus = attackBonus.concat(modifiers);
		}
		return attackBonus;
	}

	static getDefenderAttackModifiers(target: PToken | undefined) : ModifierList {
		if (!target) {return new ModifierList();}
		const defense = new ModifierList(
			target.actor.defensivePowers()
			.flatMap (item => item.getModifier("allAtk", target.actor))
		);
		return defense;
	}

	static applyRelevantTagAttackBonus(attackBonus: ModifierList, attacker: ValidAttackers, power: Usable) {
		let tag = this.#getRelevantAttackTag(attacker, power.getDamageType(attacker));
		if (!tag) return;
		const isDarkLight = tag == "dark" || tag == "light";
		if (isDarkLight && !power.hasTag("no-crit")) return;
		const localized = game.i18n.localize(POWER_TAGS[tag]);
		attackBonus.add(`Damage Power bonus`, +3);
	}

	/* old version
	static old_applyRelevantTagAttackBonus(attackBonus: ModifierList, attacker: ValidAttackers, power: Usable) {
		let tag = this.getRelevantAttackTag(attacker, power.getDamageType(attacker));
		if (tag) {
			const bonusPowers = attacker.mainPowers.concat(attacker.bonusPowers)
				.filter(x => x.system.tags.includes(tag));
			const bonus = bonusPowers.length * 3;
			const localized = game.i18n.localize(POWER_TAGS[tag]);
			attackBonus.add(`${localized} Power bonus`, bonus);
		}

	}
*/

	static #getRelevantAttackTag(_attacker: ValidAttackers, dmgType : DamageType) : PowerTag | undefined  {
		switch (dmgType) {
			case "fire": case "wind":
			case "light": case "dark":
			case "healing":
				return dmgType;
			case "lightning":
				return "elec";
			case "gun":
				return "gun";
			case "physical":
				return "weapon";
			case "by-power": //read as by-weapon here
				return "weapon";
			case "cold":
				return "ice";
			case "untyped":
				return "almighty";
			case "none":
				break;
				// tag = power.system.tags.find(x=> STATUS_POWER_TAGS.includes(x as any));
			case "all-out":
				break;
			default:
				dmgType satisfies never;
				break;
		}

	}

	static getBaseAttackBonus(attacker: ValidAttackers, power:Usable): ModifierList {
		const actor = attacker;
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

	getAllEnemiesOf(token: PToken) : PToken [] {
		const attackerType = token.actor.getAllegiance();
		const targets = this.validCombatants(token).filter( x => {
			const actor = x.actor;
			if (!actor || !actor.isAlive())  return false;
			return (x.actor && x.actor.getAllegiance() != attackerType)
		});
		return targets.map( x=> x.token as PToken);

	}

	static getAllEnemiesOf(token: PToken) : PToken [] {
		const combat= this.ensureCombatExists();
		return combat.getAllEnemiesOf(token);
	}

	static getAllAlliesOf(token: PToken) : PToken[] {
		const attackerType = token.actor.getAllegiance();
		const combat= game.combat as PersonaCombat;
		const tokens = combat
			? ( combat.validCombatants(token)
				.filter( x=> x.actor)
				.map(x=> x.token))
			: (game.scenes.current.tokens
				.filter( (x : TokenDocument<PersonaActor>) => !!x.actor && (x.actor.system.type == "pc" || x.actor.system.type =="npcAlly"))
			);
		const targets= tokens.filter( x => {
			const actor = x.actor;
			if (!actor)  return false;
			if (!(actor as ValidAttackers).isAlive()) return false;
			if ((actor as ValidAttackers).isFullyFaded()) return false;
			return ((x.actor as ValidAttackers).getAllegiance() == attackerType)
		});
		return targets.map( x=> x as PToken);
	}

	static async getTargets(attacker: PToken, power: UsableAndCard, altTargets?: PToken[]): Promise<PToken[]> {
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
				const situation : Situation = {
					user: attacker.actor.accessor,
					attacker: attacker.actor.accessor,
					target: target.actor.accessor,
					usedPower: power.accessor,
					activeCombat: true,
				}
				const canUse = power.targetMeetsConditions(attacker.actor, targetActor, situation)
				if (!canUse) {
					throw new PersonaError(`Target doesn't meet custom Power conditions to target`);
				}
			}
		}

		const attackerType = attacker.actor.getAllegiance();
		const targets = "targets" in power.system ? power.system.targets : "self";
		switch (targets) {
			case "1-random-enemy":
				const list = this.getAllEnemiesOf(attacker)
					.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
				return [randomSelect(list)];
			case "1-engaged":
			case "1-nearby":
				this.checkTargets(1,1, true, altTargets);
				return selected;
			case "1-nearby-dead":
				this.checkTargets(1,1, false);
				return selected;
			case "all-enemies": {
				return this.getAllEnemiesOf(attacker)
				.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
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
				return this.getAllAlliesOf(attacker)
				.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
			}
			case "self": {
				return [attacker]
				.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
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
				.map( x=> x.token as PToken)
				.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
				;
			}
			case "everyone":{
				const combat= this.ensureCombatExists();
				return combat.validCombatants(attacker)
				.filter( x=> x?.actor?.isAlive())
				.map( x=> x.token as PToken)
				.filter(target => power.targetMeetsConditions(attacker.actor, target.actor));
			}
			default:
				targets satisfies never;
				throw new PersonaError(`targets ${targets} Not yet implemented`);
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
	const comb = this.findCombatant(subject);
	if (!comb) return false;
	return EngagementChecker.isEngagedByAnyFoe(comb, this);
}

isInMeleeWith (token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
	const c1 = this.findCombatant(token1);
	if (!c1) {
		PersonaError.softFail("Can't find combatant");
		return false;
	}
	const c2 = this.findCombatant(token2);
	if (!c2) {
		PersonaError.softFail("Can't find combatant");
		return false;
	}
	const melee = EngagementChecker.listOfCombatantsInMelee(c1, this);
	return melee.includes(c2);
}

isEngaging(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
	const c1 = this.findCombatant(token1);
	const c2 = this.findCombatant(token2);
	if (!c2 || !c1) {
		PersonaError.softFail("Can't find combatant");
		return false;
	}
	return EngagementChecker.isEngaging(c1, c2, this);
}

isEngagedBy(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
	const c1 = this.findCombatant(token1);
	const c2 = this.findCombatant(token2);
	if (!c2 || !c1) {
		PersonaError.softFail("Can't find combatant");
		return false;
	}
	return EngagementChecker.isEngagedBy(c1, c2, this);
}

getCombatantFromTokenAcc(acc: UniversalTokenAccessor<PToken>): Combatant<ValidAttackers> {
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

/**return true if the target is eligible to use the power based on whose turn it is
 */
turnCheck(token: PToken, power: UsableAndCard): boolean {
	if (this.isSocial) return true;
	if (!this.combatant) return false;
	if (token.actor.hasStatus("baton-pass"))
		return true;
	if (power.isTeamwork() ) {
		if ( this.combatant.actor?.hasStatus("bonus-action") && this.combatant.token.id != token.id) {
			return true;
		}
		ui.notifications.warn("Can't use a teamwork move here.");
		return false;
	}
	return (this.combatant.token.id == token.id)
}

static async allOutAttackPrompt() {
	if (!PersonaSettings.get("allOutAttackPrompt"))
		return;
	const combat= this.ensureCombatExists();
	const comb = combat?.combatant as Combatant<ValidAttackers> | undefined;
	const actor = comb?.actor as ValidAttackers | undefined;
	if (!comb || !actor) return;
	if (!actor.canAllOutAttack()) return;
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

findCombatant(acc :UniversalTokenAccessor<TokenDocument<ValidAttackers>>) : PersonaCombatant | undefined;
findCombatant(comb :PersonaCombatant) : PersonaCombatant | undefined;
findCombatant(token :PToken) : PersonaCombatant | undefined;
findCombatant(token :PToken | PersonaCombatant | UniversalTokenAccessor<TokenDocument<ValidAttackers>>) : Combatant<ValidAttackers> | undefined {
	const validCombatants = this.validCombatants();
	switch (true) {
		case token instanceof Combatant: {
			return validCombatants.find( comb=> comb == token);
		}
		case token instanceof TokenDocument: {
			return validCombatants.find( comb=> comb.token == token);
		}
		default:
			const tokenDoc = PersonaDB.findToken(token);
			return validCombatants.find( comb=> comb.token != undefined && comb.token == tokenDoc);
	}
}

getAllies(comb: Combatant<ValidAttackers>) : Combatant<ValidAttackers>[] {
	const allegiance = comb.actor?.getAllegiance();
	if (!allegiance) return [];
	return this.validCombatants().filter( c => c.actor != null
		&& (c.actor.getAllegiance() == allegiance)
		&& c != comb);
}

getFoes(comb: Combatant<ValidAttackers>) : Combatant<ValidAttackers>[] {
	const allegiance = comb.actor?.getAllegiance();
	if (!allegiance) return [];
	return this.validCombatants().filter( c => c.actor != null
		&& (c.actor.getAllegiance() != allegiance)
		&& c != comb);
}

static calculateAllOutAttackDamage(attacker: PToken, situation: Situation) : {high: number, low:number} {
	let dmg = {
		high: 0,
		low:0
	};
	const attackLeader = PersonaDB.findActor(situation.attacker!);
	const combat = game.combat as PersonaCombat | undefined;
	if (!combat)
		return {high: -1, low: -1};
	const attackerComb = combat.findCombatant(attacker);
	if (!attackerComb) return dmg;
	const attackers = [
		attackerComb,
		...combat.getAllies(attackerComb)
	].flatMap (c=>c.actor?  [c.actor] : []);
	if (PersonaSettings.debugMode()) {
		console.debug(`All out attack leader ${attacker.name}`);
	}
	for (const actor of attackers) {
		if (!actor.canAllOutAttack()) continue;
		const atkDmg = actor.allOutAttackDamage(situation);
		const mult = actor == attackLeader ? 1 : (1/4);
		dmg.high += atkDmg.high * mult;
		dmg.low += atkDmg.low * mult;
		if (PersonaSettings.debugMode()) {
			console.debug(`${actor.name}:
		${atkDmg.low * mult} 	/	${atkDmg.high * mult}`);
		}
	}
	dmg.high = Math.round(dmg.high);
	dmg.low = Math.round(dmg.low);
	return dmg;
}

getToken( acc: UniversalActorAccessor<PersonaActor>  | undefined): UniversalTokenAccessor<PToken> | undefined {
	if (!acc) return undefined;
	if (acc.token) return acc.token as UniversalTokenAccessor<PToken>;
	const token = this.combatants.find( comb=> comb?.actor?.id == acc.actorId && comb.actor.token == undefined)?.token;
	if (token && token.actor) return PersonaDB.getUniversalTokenAccessor(token as PToken);
	return undefined;
}

getRoomEffects() : UniversalModifier[] {
	const effectIds= this.getFlag<string[]>("persona", "roomEffects")
	const allRoomEffects = PersonaDB.getSceneAndRoomModifiers();
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
	await ChatMessage.create(messageData, {});
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
	const roomMods = PersonaDB.getSceneAndRoomModifiers();
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
		const combAcc = PersonaDB.getUniversalTokenAccessor(comb.token as PToken);
		const foeEng = this.isEngagedByAnyFoe(combAcc) ? "*" : "";
		const engagedBy = combs
			.filter( c => this.isEngagedBy(combAcc, PersonaDB.getUniversalTokenAccessor(c.token as PToken)))
			.map(c=> c.name);
		list.push(`${comb.name}${foeEng} Engaged By: ${engagedBy.join(" , ")}`);
		const engaging = combs
			.filter( c=> this.isEngaging(combAcc, PersonaDB.getUniversalTokenAccessor(c.token as PToken)))
			.map( c=> c.name);
		list.push(`${comb.name}${foeEng} is Engaging: ${engaging.join(" , ")}`);
	}
	console.log(list.join("\n"));
}

async generateTreasureAndXP() {
	if (this.isSocial) return;
	if (this.didPCsWin() == false) return;
	const actors = this.combatants
		.contents.flatMap( x=> x?.actor ? [x.actor] : [] );
	const shadows= actors
		.filter (x => x.system.type == "shadow");
	if (shadows.some(x=> x.hp > 0)) {
		return;
	}
	const defeatedFoes = this.defeatedFoes.concat(shadows);
	this.defeatedFoes = [];
	const pcs = actors.filter( x => x.system.type == "pc") as PC[];
	const party = actors.filter( x=> x.system.type == "pc" || x.system.type == "npcAlly") as (PC | NPCAlly)[];
	try {
		await Metaverse.awardXP(defeatedFoes as Shadow[], party);
	} catch (e) {
		PersonaError.softFail("Problem with awarding XP");
	}
	try{
		const treasure = await Metaverse.generateTreasure(defeatedFoes);
		await Metaverse.printTreasure(treasure);
		await Metaverse.distributeMoney(treasure.money, pcs);
	} catch (e) {
		PersonaError.softFail("Problem with generating treasure");
	}

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
	if (element.find(".room-effects-button").length == 0) {
		const button = $( `
			<button>
			<i class="fa-solid fa-wand-magic-sparkles"></i>
			</button>
`).addClass("room-effects-button");
		if (game.user.isGM) {
			button.on("click", this.alterRoomEffects.bind(this));
		} else {
			button.on("click", this.showRoomEffects.bind(this));
		}
		element.find(".combat-info").append(button);
	}
}

async showRoomEffects() {
	const msg = this.roomEffectsMsg();
	const messageData: MessageData = {
		speaker: {alias: "Room Effects"},
		whisper: [game.user],
		content: msg,
		style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
	};
	await ChatMessage.create(messageData, {});
}

override async rollInitiative(ids: string[], {formula=null, updateTurn=true, messageOptions={}}={}) {

	// Structure input data
	ids = typeof ids === "string" ? [ids] : ids;
	const currentId = this.combatant?.id;

	// Iterate over Combatants, performing an initiative roll for each
	const updates = [];
	const rolls :{ combatant: Combatant<any>, roll: Roll}[]= [];
	for ( let [_i, id] of ids.entries() ) {

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

async onFollowUpAction(token: PToken, activationRoll: number) {
	console.debug("Calling On Follow Up Action");
	const combatant = token.object ? this.getCombatantByToken(token): null;
	if (!combatant || !combatant.actor) return;
	if (combatant.actor && combatant.actor.hasStatus("down")) return;
	const combat = combatant.parent as PersonaCombat | undefined;
	if (!combat) return;
	const allies = this.getAllies(combatant as Combatant<ValidAttackers>);
	const validTeamworkAllies = allies
		.flatMap( ally => {
			if (ally == combatant) return [];
			const actor = ally.actor;
			if (!actor || !actor.teamworkMove ) return [];
			if (!actor.canUsePower(actor.teamworkMove, false)) return [];
			const situation = {
				naturalRoll: activationRoll,
				activationRoll: activationRoll != undefined,
				user: actor.accessor
			};
			if (!actor.teamworkMove.testTeamworkPrereqs(situation, actor)) return [];
			const targets = combat.getValidTargetsFor(actor.teamworkMove, combatant as Combatant<ValidAttackers>, situation);
			if (targets.length == 0) return [];
			return [ally];
		});
	const allout = (combat.getAllEnemiesOf(token)
		.every(enemy => enemy.actor.hasStatus("down"))
		&& combatant.actor.canAllOutAttack())
		? "<li> All out attack </li>"
		: "";
	const listItems = validTeamworkAllies
		.map( ally => {
			const power = ally.actor!.teamworkMove!;
			return `<li>${power.name} (${ally.name})</li>`;
		}).join("");
	const teamworkList = !combatant.actor.isDistracted() ? listItems: "";
	const msg = `<h2> Valid Follow Up Actions </h2>
<ul>
		<li> Act again </li>
		${allout}
		${teamworkList}
		</ul>
`;
	const messageData: MessageData = {
		speaker: {alias: "Follow Up Action"},
		content: msg,
		style: CONST.CHAT_MESSAGE_STYLES.OOC,
	};
	await ChatMessage.create(messageData, {});
}

async generateInitRollMessage<R extends Roll>(rolls: {combatant: Combatant, roll: R}[], messageOptions: Foundry.MessageOptions = {}): Promise<ChatMessage<R>> {
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


export type ValidAttackers = PC | Shadow | NPCAlly;

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

type OpenerOptionsReturn = {
	msg: string[],
	options: OpenerOption[]
}

type OpenerOption = {
	mandatory: boolean,
	optionTxt: string,
	optionEffects: unknown[]
}

export type PersonaCombatant = NonNullable<PersonaCombat["combatant"]>;

