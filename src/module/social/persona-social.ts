/* eslint-disable @typescript-eslint/prefer-promise-reject-errors */
import { StatusEffectId } from "../../config/status-effects.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { TurnAlert } from "../utility/turnAlert.js";
import { ConditionalEffectManager } from "../conditional-effect-manager.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { SocketPayload } from "../utility/socket-manager.js";
import { PersonaCalendar } from "./persona-calendar.js";
import { StudentSkill } from "../../config/student-skills.js";

import { testPreconditions } from "../preconditions.js";
import { CardEvent } from "../../config/social-card-config.js";
import { PersonaSockets } from "../persona.js";
import { TarotCard } from "../../config/tarot.js";
import { PersonaCombat } from "../combat/persona-combat.js";
import { CombatResult } from "../combat/combat-result.js";
import { NonCombatTriggerTypes } from "../../config/triggers.js";
import { PersonaItem } from "../item/persona-item.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../config/persona-settings.js";
import { PersonaError } from "../persona-error.js";
import { SocialStat } from "../../config/student-skills.js";
import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { PersonaDB } from "../persona-db.js";
import { HTMLTools } from "../utility/HTMLTools.js";
import {PreconditionConverter} from "../migration/convertPrecondition.js";
import {ConsequenceProcessor} from "../conditionalEffects/consequence-processor.js";
import {ConditionalEffectC} from "../conditionalEffects/conditional-effect-class.js";
import {SocialCardExecutor} from "./social-card-executor.js";
import {weightedChoice} from "../utility/array-tools.js";

export class PersonaSocial {
	static allowMetaverse: boolean = true;
	static metaverseChoosers = 0;

	private static _cardExecutor : N<SocialCardExecutor> = null;

	static cardDrawPromise: null | {
		res: (str: string) => void,
		rej: (x: unknown) => void,
	};

	static get currentSocialCardExecutor() : N<SocialCardExecutor> {
		return this._cardExecutor;
	}

	static availabilityDisqualifierStatuses : StatusEffectId[] = [
		"jailed",
		"exhausted",
		"crippled",
		"injured",
	] as const;

	static cameoDisqualifierStatuses : StatusEffectId[] = [
		"jailed",
		"exhausted",
		"crippled",
		"injured",
	] as const;

	static #drawnCardIds: string[] = [];


	static async startSocialCombatRound(disallowMetaverse = false, advanceCalendar = true) {
		if (!game.user.isGM) {
			ui.notifications.error("Only GM can start new social combat turn");
			return;
		}
		this.allowMetaverse = !disallowMetaverse;
		this.metaverseChoosers = 0;
		const extraMsgs : string [] = [];
		if (this.allowMetaverse) {
			extraMsgs.push("<b>Metaverse</b>: You may opt to go to the metaverse, though you must decide to now before taking any actions");
		}
		if (advanceCalendar) {
			await this.advanceCalendar(true, extraMsgs);
		}
	}

	static async startSocialTurn( pc: PC) {
		if (pc.isOwner && !game.user.isGM)
		{TurnAlert.alert();}
		if (!game.user.isGM) {return;}
		//only GM access beyond this point
		const startTurnMsg = [ `<u><h2> ${pc.name}'s Social Turn</h2></u><hr>`];
		if (pc.hasStatus("injured")) {
			startTurnMsg.push(`<b> ${pc.name} </b>: is injured and should probably take the rest action`);
		}
		if (pc.hasStatus("jailed")) {
			startTurnMsg.push(`<b> ${pc.name} </b>: is jailed and must either pay their bail or take the jail action`);
		}
		if (pc.hasStatus("crippled")) {
			startTurnMsg.push(`<b> ${pc.name} </b>: is crippled and must take the hospital action.`);
		}
		if (pc.hasStatus("exhausted")) {
			startTurnMsg.push(`<b> ${pc.name} </b>: is exhausted and should probably take the rest action.`);
		}
		if (pc.hasStatus("tired")) {
			startTurnMsg.push(`<b> ${pc.name} </b>: is tired.`);
		}
		if (pc.hasStatus("rested")) {
			startTurnMsg.push(`<b> ${pc.name} </b>: is Well-rested.`);
		}
		for (const activity of PersonaDB.allActivities()) {
			if (activity.announce(pc)) {
				startTurnMsg.push(` <b>${activity.displayedName.toString()}</b> is available today.`);
			}
		}
		const speaker = {alias: "Social Turn Start"};
		const messageData = {
			speaker: speaker,
			content: startTurnMsg.join("<br>"),
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		await ChatMessage.create(messageData, {});
	}

	static async endSocialTurn( pc: PC) {
		const endTurnMsg = [] as string[];
		//Check exhaustion statuses

		try {
			endTurnMsg.push(...await pc.onEndSocialTurn());
		} catch  {
			PersonaError.softFail(`Problem trying to end social turn on ${pc.name}`);
		}
		if (endTurnMsg.length) {
			const speaker = {alias: "Social Turn End"};
			const messageData = {
				speaker: speaker,
				content: endTurnMsg.join("<br>"),
				style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			};
			await ChatMessage.create(messageData, {});
		}
	}

	static async advanceCalendar(force = false, extraMsgs : string [] = []) {
		if (!force && !(await HTMLTools.confirmBox( "Advance Date", "Advnace Date?", true))) {
			ui.notifications.notify("Date not advanced due to advanceCalendar being rejected");
			return;
		}
		await PersonaCalendar.nextDay(extraMsgs);
	}

	static async updateLinkAvailability(day: SimpleCalendar.WeekdayName) {
		for (const link of PersonaDB.socialLinks()) {
			await link.resetAvailability(day);
		}
		for (const activity of PersonaDB.allActivities()){
			await activity.resetAvailability(day);
		}
		console.debug(`NPC availability Reset: ${day}`);
	}

	static async boostSocialSkill(pc: PC, socialStat: SocialStat) {
		const amount = await HTMLTools.numberButtons("Amount", 1, 3) as 1 | 2| 3;
		await pc.alterSocialSkill(socialStat, amount);
	}

	static async lowerSocialSkill(pc: PC, socialStat: SocialStat) {
		const amount = await HTMLTools.numberButtons("Amount", -3, -1) as -3 | -2| -1;
		await pc.alterSocialSkill(socialStat, -Math.abs(amount));
	}

	static async getPrimarySecondary(defaultChoice: "primary" | "secondary" | SocialStat = "primary") :Promise<"primary" | "secondary" | SocialStat> {
		const skillList = foundry.utils.mergeObject(
			{
				"primary" :		"persona.term.primary",
				"secondary" : "persona.term.secondary"
			} ,
			STUDENT_SKILLS);
		const html = await foundry.applications.handlebars.renderTemplate(`${HBS_TEMPLATES_DIR}/dialogs/social-skill-selector.hbs`, {skillList, defaultChoice} );
		return await new Promise( (conf, reject) => {
			const dialog = new Dialog({
				title: `Prompt`,
				content: html,
				render: (html: string) => {
					$(html).find(".numInput").trigger("focus");
				},
				buttons: {
					one: {
						icon: `<i class="fas fa-check"></i>`,
						label: "Confirm",
						callback: (htm: string) => {
							const value = $(htm).find(".social-skill-choice").find(":selected").val() as "primary" | "secondary" | SocialStat | undefined;
							if (value) {
								conf(value);
							} else {
								reject("Something weird happened");
							}
						}
					},
					two: {
						icon: `<i class="fas fa-times"></i>`,
						label: "Cancel",
						callback: () => reject("Cancel"),
					}
				},
				default: "one",
				close: () => {
					reject("close");
				},
			}, {});
			dialog.render(true);
		});

	}

	static async #socialEncounter(actor: PC, activity: SocialLink | Activity) : Promise<ChatMessage[]> {
		if (activity instanceof PersonaActor) {
			const link = PersonaSocial.lookupSocialLink(actor, activity.id);
			if (link.actor.isSpecialEvent(link.linkLevel + 1)) {
				const msg = await this.specialEvent(actor, activity);
				return [msg];
			}
		}
		this._cardExecutor = new SocialCardExecutor(actor, activity);
		const msgs : ChatMessage[] = [];
		try {
			msgs.push(... await this._cardExecutor.exec());
		} catch (e) {
			PersonaError.softFail("Problem with SocailCard Exection", e);
		}
		this._cardExecutor = null;
		return msgs;
	}

	static async specialEvent(actor: PC, link: SocialLink) : Promise<ChatMessage> {
		const html = `
		<div>${actor.name} social action choice </div>
		<h2> ${link.name} Special Event </h2>
<div> GM should lower avaiability manually</div>
		`;
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		return await ChatMessage.create(msgData,{} );
	}

	static lookupActivity(actor: PC, activityId: string): ActivityLink {
		const link = actor.activityLinks.find( x=> x.activity.id == activityId); 
		if (!link) {
			const minorLink=  actor.downtimeMinorActions.find(x=> x.isSocialCard() && x.id == activityId) as SocialCard;
			if (!minorLink) {
				throw new PersonaError(`Can't find activity: ${activityId}`);
			}
			return {
				strikes: 0,
				available: true,
				activity: minorLink,
				currentProgress: 0,
			} satisfies ActivityLink;
		}
		return link;
	}

	static lookupSocialLink(actor: PC, linkId: string) :SocialLinkData {
		const link = actor.socialLinks.find(link => link.actor.id == linkId);
		if (!link)
		{throw new PersonaError(`Can't find link ${linkId}`);}
		return link;
	}

	static getCharInInitiativeList( offset: number) : SocialLink | undefined {
		if (!game.combat || !game.combat.combatant) {return undefined;}
		const initList = game.combat.turns;
		const index = initList.indexOf(game.combat.combatant);
		let modOffset = (index + offset) % initList.length;
		while(modOffset < 0) {
			modOffset += initList.length;
		}
		return initList[modOffset].actor as SocialLink;
	}

	static async markSocialCardEventUsed (card: SocialCard, event: CardEvent) {
		if (game.user.isGM) {
			await card.markEventUsed(event);
			return;
		}
		const index  = card.system.events.findIndex( x=> x == event);
		if (index == -1) {
			PersonaError.softFail(`Can't find event index for ${event.name}`); return;
		}
		const gms = game.users.filter(x=> x.isGM);
		PersonaSockets.simpleSend("EXPEND_EVENT", {cardId: card.id, eventIndex: index}, gms.map( x=> x.id));
	}

	static async markQuestionUsed(npc: NPC, event: CardEvent) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
		const index= npc.questions.findIndex( q=> q.name == (event as any)?.origName);
		if (index == -1) {
			PersonaError.softFail(`Can't find event index for ${event.name}`); return;
		}
		if (game.user.isGM) {
			await npc.markQuestionUsed(index);
			return;
		}
		const gms = game.users.filter(x=> x.isGM);
		PersonaSockets.simpleSend("EXPEND_QUESTION", {npcId: npc.id, eventIndex: index}, gms.map( x=> x.id));
	}

	static async chooseActivity(actor: PC, activity: SocialLink | Activity, _options: ActivityOptions = {}) {
		const debug = PersonaSettings.debugMode();
		if (!debug && !game.user.isGM &&
			(
				!game.combat
				|| !(game.combat.combatant?.actor == actor)
			)
		) {
			ui.notifications.warn("It's not your turn");
			return;
		}
		if (activity instanceof PersonaItem) {
			const situation : Situation = {
				user: actor.accessor,
				attacker: actor.accessor,
				isSocial: true,
			};
			const sourced = ConditionalEffectManager.getConditionals(activity.system.conditions, null, null, null);
			if (!testPreconditions( sourced, situation)) {
				ui.notifications.warn("Fails to meet preconditions for this activity.");
				return;
			}
		}

		if (actor.hasStatus("exhausted") && activity instanceof PersonaItem && activity.system.cardType == "training") {
			ui.notifications.warn("You're currently unable to take this action, you must recover first");
			return;
		}
		if (!actor.canTakeNormalDowntimeActions()) {
			if (activity instanceof PersonaActor) {
				ui.notifications.warn("You're currently unable to take this action, you must recover first");
				return;
			}
			if (activity.system.cardType != "recovery") {
				ui.notifications.warn("You're currently unable to take this action, you must recover first");
				return;
			}

		}
		if (activity instanceof PersonaItem) {
			await actor.addNewActivity(activity);
			if (activity.system.cardType == "job") {
				//TODO: sockets to send availability change
				// await activity.setAvailability(false);
			}
		}
		if (activity instanceof PersonaActor) {
			// await activity.setAvailability(false);
		}
		await this.#socialEncounter(actor, activity);
	}

	static drawnCards() : string[] {
		//NOTE: Only a debug function
		return this.#drawnCardIds;
	}

	static async execTrigger( trigger: NonCombatTriggerTypes, actor: PC, situation ?: Situation, msg = "Triggered Effect"): Promise<void> {
		return await TriggeredEffect.execNonCombatTrigger(trigger, actor, situation, msg);
	}

	static async awardPerk(target: PC, socialLink: SocialLink) {
		const situation : Situation = {
			user: target.accessor,
			tarot: socialLink.tarot?.name as TarotCard,
			target: target.accessor,
			socialTarget: target.accessor,
		};
		// console.log(situation);
		await this.execTrigger("on-attain-tarot-perk", target, situation, `Gains Perk (${socialLink.tarot?.name})`) ;
	}

	static async applyEffects(effects: ConditionalEffectC[], situation: Situation, actor: PC) {
		const results = effects.flatMap( eff=> eff.getActiveConsequences(situation));
		const processed= ConsequenceProcessor.processConsequences_simple(results, situation);
		const result = new CombatResult();
		for (const c of processed.consequences) {
			await result.addEffect(null, actor, c.cons, situation);
		}
		await result.emptyCheck()
			?.autoApplyResult();
	}


	static getSocialVariable(varId: string): number | undefined {
		const exec = this._cardExecutor;
		if (!exec) {
			PersonaError.softFail("Can't get variable, since the card executor doesn't exist");
			return 0;
		}
		return exec.getSocailVariable(varId);
	}


	static async alterStudentSkill(actor: PC, skill: StudentSkill, amt: number) {
		await actor.alterSocialSkill(skill, amt);
	}

	static async gainMoney(actor: PC, amt: number) {
		await actor.gainMoney(amt, true);

	}

	static displaySocialPanel( tracker: JQuery) {
		if (tracker.find(".social-section").length == 0) {
			const socialTracker = `
				<section class="social-section">
					<div class="day-weather flexrow">
						<div class="day"> ---- </div>
						<div class="weather-icon"> </div>
					</div>
					<div class="doomsday-clock">
						<span class="title"> Doomsday: </span>
						<span class="doomsday"> 0/0 </span>
					</div>
				</section>
				`;
			tracker.find(".combat-tracker-header").append(socialTracker);
		}
		const weatherIcon = PersonaCalendar.getWeatherIcon();
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		tracker.find("div.weather-icon").append(weatherIcon).on("click" , PersonaCalendar.openWeatherForecast.bind(PersonaCalendar));
		const doom = PersonaCalendar.DoomsdayClock;
		if (doom) {
			const doomtxt = `${doom.amt} / ${doom.max}`;
			tracker.find("span.doomsday").text(doomtxt);
		}
		const weekday = PersonaCalendar.getDateString();
		tracker.find(".day").text(weekday);
	}

	static async startSocialLink(initiator: PC, targetId: string) {
		const target = game.actors.get(targetId) as (NPC | PC);
		if (!target) {
			throw new PersonaError(`Couldn't find target ${targetId}`);
		}
		const combat = game.combat as PersonaCombat;
		if (!combat) {
			ui.notifications.warn("Can only do this on your turn.");
			return;
		}
		if (!combat.isSocial) {
			ui.notifications.warn("Not in Downtime");
			return;
		}
		if (!target.isAvailable(initiator)) {
			ui.notifications.warn("Target isn't available today!");
			return;
		}
		if (combat.combatant?.actor != initiator) {
			ui.notifications.warn("Can only do this on your turn.");
			return;
		}
		if (!this.meetsConditionsToStartLink(initiator, target)) {
			const requirements = ConditionalEffectManager.printConditions((target as NPC).system?.conditions ?? []);
			ui.notifications.warn(`You don't meet the prerequisites to start a relationship with this Link: ${requirements}`);
			return;
		}
		if (!(await HTMLTools.confirmBox("Start new Link", `Start a new Link with ${target.displayedName}`))) {
			return;
		}
		await target.setAvailability(false);
		await initiator.createSocialLink(target);
	}

	static requestAvailabilitySet(targetId: string, newValue: boolean) {
		if (newValue == true) {
			throw new PersonaError("Doesn't support positive setting");
		}
		const gmId = game.users.find(x=>x.isGM && x.active)?.id;
		if (!gmId) {
			throw new PersonaError("No GM logged in!");
		}
		PersonaSockets.simpleSend("DEC_AVAILABILITY", targetId,[ gmId ]);
	}

	static meetsConditionsToStartLink(pc: PC, target: SocialLink): boolean {
		const situation: Situation = {
			user: pc.accessor,
			attacker: pc.accessor,
			isSocial: true,
			// target: target.accessor,
			socialTarget: target.accessor,
		};
		if (!target.isNPC()) {return true;}
		const sourced = target.system.conditions.map( cond => ({
			...PreconditionConverter.convertDeprecated(cond),
			source: undefined,
			owner: target.accessor,
			realSource: undefined,
		}));
		return testPreconditions(sourced, situation);
	}

	static async getExpendQuestionRequest(msg : SocketMessage["EXPEND_QUESTION"], payload: SocketPayload<"EXPEND_QUESTION">) {
		const npc = game.actors.get(msg.npcId) as PersonaActor;
		if (!npc) {
			PersonaError.softFail(`Can't fiund NPC Id ${msg.npcId}`, msg, payload);
			return;
		}
		if (npc.system.type == "npc") {
			await (npc as NPC).markQuestionUsed(msg.eventIndex);
		} else {
			PersonaError.softFail(`${npc.name} is not an NPC`, msg, payload);
			return;
		}
	}

	static isActivitySelectable(activity: SocialCard, pc: PC) : boolean {
		if (!activity.system.weeklyAvailability.available)
		{return false;}
		if ((pc.system.activities.find( act=> act.linkId == activity.id)?.strikes ?? 0) >= 3)
		{return false;}
		const situation : Situation=  {
			user: pc.accessor,
			attacker: pc.accessor,
		};
		const sourced=  (activity.system.conditions ?? []).map( cond => ({
			owner: undefined,
			source: undefined,
			realSource: undefined,
			...PreconditionConverter.convertDeprecated(cond),
		}));
		return testPreconditions(sourced, situation);
	}

	static async getExpendEventRequest(msg : SocketMessage["EXPEND_EVENT"], payload: SocketPayload<"EXPEND_EVENT">) {
		const card = game.items.get(msg.cardId) as SocialCard;
		if (!card) {
			PersonaError.softFail(`Can't fiund Card Id ${msg.cardId}`, msg, payload);
			return;
		}
		const event = card.system.events[msg.eventIndex];
		if (!event) {
			PersonaError.softFail(`No index at ${msg.eventIndex}`, msg, payload);
			return;
		}
		await card.markEventUsed(event);
	}

	static async sendGMCardRequest(actor: PC, link: SocialLink | Activity) : Promise<SocialCard> {
		const gms = game.users.filter(x=> x.isGM);
		if (this.cardDrawPromise) {
			this.cardDrawPromise.rej("Second Draw");
			this.cardDrawPromise = null;
		}
		const promise : Promise<string> = new Promise( (res, rej) => {
			this.cardDrawPromise = { res, rej};
		});
		PersonaSockets.simpleSend("DRAW_CARD", {actorId: actor.id, linkId: link.id}, gms.map( x=> x.id));
		const cardId = await promise;
		const card = game.items.get(cardId) as SocialCard | undefined;
		if (!card) {throw new PersonaError(`No card found for ${link.name}`);}
		return card;
	}

	static async answerCardRequest(req: SocketMessage["DRAW_CARD"], socketPayload: SocketPayload<"DRAW_CARD">) {
		const actor = game.actors.get(req.actorId) as PC;
		const activity = (game.actors.get(req.linkId) ?? game.items.get(req.linkId)) as SocialLink | SocialCard;
		//typescript was being fussy and needed me to define a concrete type despuite it being legal to call set availability on either
		if (activity instanceof PersonaItem && activity.system.cardType == "job") {
			await activity.setAvailability(false);
		}
		if (activity instanceof PersonaActor) {
			await activity.setAvailability(false);
		}

		const card = this._drawSocialCard(actor, activity);
		const sendBack = [socketPayload.sender];
		// console.log(`Send back ${card.name}`);
		PersonaSockets.simpleSend("CARD_REPLY", {cardId: card.id}, sendBack);
	}

	static _drawSocialCard(actor: PC, link : SocialLink | Activity) : SocialCard {
		if (link instanceof PersonaItem) {
			return link;
		}
		const cards = SocialCardExecutor.validSocialCards(actor, link);
		const undrawn = cards;
		const weightedList = undrawn.map( card=> ({
			item: card,
			weight: Number(card.system.frequency ?? 1),
		}));
		const chosenCard = weightedChoice(weightedList);
		if (!chosenCard) {
			throw new PersonaError(`Can't find valid social card for ${link.name} on PC : ${actor.name}!`);
		}
		return chosenCard;
	}

	static getCardReply(req: SocketMessage["CARD_REPLY"]) {
		if (PersonaSettings.debugMode()) {
			console.log(`got reply ${req.cardId}`);
		}
		if (!this.cardDrawPromise) {return;}
		if (req.cardId) {
			this.cardDrawPromise.res(req.cardId);
		}
	}

	static _onMakeCardRoll(ev: JQuery.ClickEvent) {
		const cardId = HTMLTools.getClosestData(ev, "cardId");
		const messageId = HTMLTools.getClosestData(ev, "messageId");
		const message = game.messages.get(messageId);
		if (!message) {
			throw new PersonaError(`Couldn't find messsage ${messageId}`);
		}
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		const choiceIndex = Number(HTMLTools.getClosestData(ev, "choiceIndex"));
		const exec =this.currentSocialCardExecutor;
		if (!exec) {
			throw new PersonaError("No currently executing card");
		}
		if (exec.cardData.card.id != cardId) {
			throw new PersonaError("Card Id mismatch, aborting choice");
		}
		const handler = exec.handler;
		if (!handler) {
			throw new PersonaError("No card Event Handler");
		}
		void handler.makeCardRoll(eventIndex, choiceIndex, message);
	}

	static async _onRaiseSLButton(ev: JQuery.ClickEvent) {
		const tokenCost = HTMLTools.getClosestDataNumber(ev, "tokenAmt");
		const PCId = HTMLTools.getClosestData(ev, "pcId");
		const linkId = HTMLTools.getClosestData(ev, "linkId");
		const PC = PersonaDB.getActor(PCId);
		if (!PC || !PC.isPC()) {
			throw new PersonaError(`Cant' find PC : ${PCId}`);
		}
		if (PC.getSocialLinkProgress(linkId) < tokenCost) {
			ui.notifications.warn("Not enough tokesn to improve this link");
		}
		await PC.socialLinkProgress(linkId, -tokenCost);
		await PC.increaseSocialLink(linkId);
	}

} //end of class



type ActivityOptions = {
	noDegrade ?: boolean;
}

declare global {
	interface SocketMessage {
		"DEC_AVAILABILITY": string;
		"EXPEND_QUESTION": {
			npcId: string;
			eventIndex: number;
		}
		"EXPEND_EVENT": {
			cardId: string;
			eventIndex: number;
		}
		"DRAW_CARD": {
			actorId: string,
			linkId: string
		};
		"CARD_REPLY": {
			cardId: string
		}
	}
}

Hooks.on("socketsReady", () => {
	console.log("Sockets set handler");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	PersonaSockets.setHandler("DRAW_CARD", PersonaSocial.answerCardRequest.bind(PersonaSocial));
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	PersonaSockets.setHandler("CARD_REPLY", PersonaSocial.getCardReply.bind(PersonaSocial));
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	PersonaSockets.setHandler("EXPEND_EVENT", PersonaSocial.getExpendEventRequest.bind(PersonaSocial));
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	PersonaSockets.setHandler("EXPEND_QUESTION", PersonaSocial.getExpendQuestionRequest.bind(PersonaSocial));
});


Hooks.on("socketsReady" , function() {
	PersonaSockets.setHandler("DEC_AVAILABILITY", async ( task_id: string) => {
		if (!game.user.isGM) {return;}
		const link = game.actors.find(x=> x.id == task_id);
		if (link) {
			const actor = link as PersonaActor;
			if (actor.isNPC() || actor.isPC()) {
				await actor.setAvailability(false);
			}
			return;
		}
		throw new PersonaError(`Can't find Task ${task_id} to decremetn availability`);
	});
});

//@ts-expect-error window setting for debug purposes
window.PersonaSocial = PersonaSocial;

Hooks.on("updateActor", (_actor: PersonaActor, changes) => {
	if ((changes as DeepPartial<PC>)?.system?.weeklyAvailability) {
		(game.actors.contents as PersonaActor[])
			.filter(x=> x.isPC()
				&& x.sheet._state > 0)
			.forEach(x=> void x.sheet.render(true));
	}
});

Hooks.on("updateItem", (_item: PersonaItem, changes) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	if ((changes as any)?.system?.weeklyAvailability) {
		(game.actors.contents as PersonaActor[])
			.filter(x=> x.isPC()
				&& x.sheet._state > 0)
			.forEach(x=> void x.sheet.render(true));
	}
});


Hooks.on("renderChatMessageHTML", (message: ChatMessage, htm: HTMLElement ) => {
	const html = $(htm);
	if ((message?.author ?? message?.user) == game.user) {
		html.find(".social-card-roll .make-roll").on("click", ev => void PersonaSocial._onMakeCardRoll(ev));
		html.find(".social-card-roll .next").on("click", ev => void PersonaSocial._onMakeCardRoll(ev));
		html.find("button.raise-SL").on("click", ev => void PersonaSocial._onRaiseSLButton(ev));
	}
});

