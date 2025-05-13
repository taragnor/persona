import { CardTag } from "../../config/card-tags.js";
import { RollSituation } from "../../config/situation.js";
import { RollTag } from "../../config/roll-tags.js";
import { Precondition } from "../../config/precondition-types.js";
import { shuffle } from "../utility/array-tools.js";
import { NPCAlly } from "../actor/persona-actor.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { TurnAlert } from "../utility/turnAlert.js";
import { VariableAction } from "../../config/consequence-types.js";
import { SocialCardActionConsequence } from "../../config/consequence-types.js";
import { PersonaSounds } from "../persona-sounds.js";
import { randomSelect } from "../utility/array-tools.js";
import { SocialCardSituation } from "../../config/situation.js";
import { NPC } from "../actor/persona-actor.js";
import { ConditionalEffectManager } from "../conditional-effect-manager.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { CardChoice } from "../../config/social-card-config.js";
import { weightedChoice } from "../utility/array-tools.js";
import { SocketPayload } from "../utility/socket-manager.js";
import { PersonaCalendar } from "./persona-calendar.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { ArrayCorrector } from "../item/persona-item.js";
import { ActivityLink } from "../actor/persona-actor.js";
import { Activity } from "../item/persona-item.js";
import { StudentSkill } from "../../config/student-skills.js"

import { getActiveConsequences } from "../preconditions.js";
import { CardRoll } from "../../config/social-card-config.js";
import { testPreconditions } from "../preconditions.js";
import { CardEvent } from "../../config/social-card-config.js";
import { PersonaSockets } from "../persona.js";
import { SocialLinkData } from "../actor/persona-actor.js";
import { TarotCard } from "../../config/tarot.js";
import { PersonaCombat } from "../combat/persona-combat.js";
import { CombatResult } from "../combat/combat-result.js";
import { NonCombatTriggerTypes } from "../../config/triggers.js";
import { SocialLink } from "../actor/persona-actor.js";
import { PersonaItem } from "../item/persona-item.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../config/persona-settings.js";
import { SocialCard } from "../item/persona-item.js";
import { PersonaError } from "../persona-error.js";
import { PC } from "../actor/persona-actor.js";
import { SocialStat } from "../../config/student-skills.js";
import { ModifierList } from "../combat/modifier-list.js";
import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { RollBundle } from "../persona-roll.js";
import { PersonaDB } from "../persona-db.js";
import { HTMLTools } from "../utility/HTMLTools.js";
import { StudentSkillExt } from "../../config/student-skills.js";

export class PersonaSocial {
	static allowMetaverse: boolean = true;
	static metaverseChoosers = 0;
	static cardDrawPromise: null | {
		res: (str: string) => void,
		rej: (x: any) => void,
	}
	static sound: FOUNDRY.AUDIO.Sound | null = null;

	static disqualifierStatuses : StatusEffectId[] = [
		"jailed",
		"exhausted",
		"crippled",
		"injured",
	];

	static #drawnCardIds: string[] = [];
	static rollState: null |
		{
			continuation: ((...args: any) => void);
			cardData: CardData;
		};


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
			TurnAlert.alert();
		if (!game.user.isGM) {return;}
		//only GM access beyond this point
		let startTurnMsg = [ `<u><h2> ${pc.name}'s Social Turn</h2></u><hr>`];
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
				startTurnMsg.push(` <b>${activity.displayedName}</b> is available today.`);
			}
		}
		const speaker = {alias: "Social Turn Start"};
		let messageData = {
			speaker: speaker,
			content: startTurnMsg.join("<br>"),
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		ChatMessage.create(messageData, {});
	}

	static async endSocialTurn( pc: PC) {
		let endTurnMsg = [] as string[];
		//Check exhaustion statuses

		try {
			endTurnMsg.push(...await pc.onEndSocialTurn());
		} catch (e) {
			PersonaError.softFail(`Problem trying to end social turn on ${pc.name}`);
		}
		if (endTurnMsg.length) {
			const speaker = {alias: "Social Turn End"};
			let messageData = {
				speaker: speaker,
				content: endTurnMsg.join("<br>"),
				style: CONST.CHAT_MESSAGE_STYLES.OOC,
			};
			ChatMessage.create(messageData, {});
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

	static async rollSocialStat( pc: PC, socialStat: SocialStat, extraModifiers?: ModifierList, altName ?: string, situation?: Situation) : Promise<RollBundle> {
		let mods = pc.getSocialStat(socialStat);
		let socialmods = pc.getPersonalBonuses("socialRoll");
		mods = mods.concat(socialmods);
		const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
		mods.add("Custom Modifier", customMod);
		if (extraModifiers) {
			mods = mods.concat(extraModifiers);
		}
		const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
		const rollName = (altName) ? altName : skillName;
		const sit: Situation = situation ?? {
			user: PersonaDB.getUniversalActorAccessor(pc),
			attacker: pc.accessor,
		};
		const r = await new Roll("1d20").roll();
		const dice = new RollBundle(rollName, r, true,  mods, sit);
		return dice;
	}

	static async boostSocialSkill(pc: PC, socialStat: SocialStat) {
		const amount = await HTMLTools.numberButtons("Amount", 1, 3) as 1 | 2| 3;
		await pc.alterSocialSkill(socialStat, amount);
	}

	static async lowerSocialSkill(pc: PC, socialStat: SocialStat) {
		const amount = await HTMLTools.numberButtons("Amount", -3, -1) as -3 | -2| -1;
		await pc.alterSocialSkill(socialStat, -Math.abs(amount));
	}

	static resolvePrimarySecondarySocialStat(choice: StudentSkillExt, link: SocialLink | Activity) : StudentSkill {
		switch (choice) {
			case "primary":
			case "secondary":
				if (link instanceof PersonaActor){
					return link.getSocialStatToRaiseLink(choice);
				}else {
					return link.system.keyskill[choice];
				}
			default:
				return choice;
		}
	}

	static async getPrimarySecondary(defaultChoice: "primary" | "secondary" | SocialStat = "primary") :Promise<"primary" | "secondary" | SocialStat> {
		const skillList = foundry.utils.mergeObject(
			{
				"primary" :		"persona.term.primary",
				"secondary" : "persona.term.secondary"
			} ,
			STUDENT_SKILLS);
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/dialogs/social-skill-selector.hbs`, {skillList, defaultChoice} );
		return await new Promise( (conf, reject) => {
			const dialog = new Dialog({
				title: `Prompt`,
				content: html,
				render: async (html: string) => {
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

	static validSocialCards(actor: PC, activity: SocialLink) : SocialEncounterCard[] {
		const link = this.lookupSocialLink(actor, activity.id)
		const situation : Situation= {
			user: actor.accessor,
			attacker: actor.accessor,
			socialTarget: link? link.actor.accessor : undefined,
			isSocial: true,
			// target: link ? link.actor.accessor : undefined,
		};
		const cardList = PersonaDB.socialEncounterCards();
		if (cardList.length == 0) {
			PersonaError.softFail("Card list in DB has length 0");
		}
		const preconditionPass =  cardList
			.filter( card => card.system.frequency > 0)
			.filter( card => testPreconditions(card.cardConditionsToSelect(), situation, null));
		if (PersonaSettings.debugMode() == true) {
			console.log(`Valid Cards: ${preconditionPass.map(x=> x.name).join(", ")}`);
		}
		if (preconditionPass.length == 0) {
		}
		return preconditionPass;
	}

	static async #drawSocialCard(actor: PC, link : Activity | SocialLink) : Promise<SocialCard> {
		if (!game.user.isGM)
		return await this.#sendGMCardRequest(actor, link);
		if (link instanceof PersonaItem) {
			return link;
		}
		const cards = this.validSocialCards(actor, link);
		const undrawn = cards;
		const weightedList = undrawn.map( card=> ({
				item: card,
				weight: Number(card.system.frequency) ?? 1,
			}))
		const chosenCard = weightedChoice(weightedList);
		if (!chosenCard) throw new PersonaError("Can't find valid social card!");
		return chosenCard;
	}

	static async #socialEncounter(actor: PC, activity: SocialLink | Activity) : Promise<ChatMessage[]> {
		let replaceSet : Record<string, string> = {};
		if (activity instanceof PersonaActor) {
			const link = this.lookupSocialLink(actor, activity.id);
			replaceSet["$TARGET"] = link.actor.name;
			if (link.actor.isSpecialEvent(link.linkLevel+1)) {
				const msg = await this.specialEvent(actor, activity)
				return [msg];
			}
		}
		const card = await this.#drawSocialCard(actor, activity);
		const cameos = this.#getCameos(card, actor, activity.id);
		const perk = this.#getPerk(card, actor, activity, cameos);
		const cameo = cameos.length > 0 ? cameos[0].accessor : undefined;
		const situation : CardData["situation"] = {
			user: actor.accessor,
			socialTarget: activity instanceof PersonaActor ?  activity.accessor: undefined,
			attacker: actor.accessor,
			// target: activity instanceof PersonaActor ?  activity.accessor: undefined,
			cameo,
			isSocial: true,
			socialRandom : Math.floor(Math.random() * 20) + 1,
		};
		if (cameos[0]) {
			replaceSet["$CAMEO"] = cameos[0].name;
		} else {
			replaceSet["$CAMEO"] = "NULL CAMEO";
		}
		const eventList = card.cardEvents().slice() ;
		if (activity instanceof PersonaActor) {
			const questionsAsEvents= this.questionsAsEvents(activity);
			eventList.push(...questionsAsEvents);
		}
		const cardData : CardData = {
			card,
			actor,
			linkId: activity.id,
			activity,
			cameos,
			perk,
			eventsChosen: [],
			eventsRemaining: card.system.num_of_events,
			situation,
			forceEventLabel: null,
			eventList,
			replaceSet,
			variables: {},
			extraCardTags: []
		};
		return await this.#execCardSequence(cardData);
	}

	static questionsAsEvents( socialTarget: SocialLink) : SocialCard["system"]["events"] {
		const questions = socialTarget.questions
		.filter( q=>!q.expended);
		return questions.map(this.questionToEvent);
	}

	static questionToEvent(question: NPC["system"]["questions"][number]) : SocialCard["system"]["events"][number] & {origName: string} {
		const eventTags  = ["question", "one-shot"] as SocialCard["system"]["events"][number]["eventTags"];
		if (question.expended) {
			eventTags.push("disabled");
		}
		const conditions= [] as Precondition[];
		if (question.SLmax < 10) {
			conditions.push( {
				type: "numeric",
				comparisonTarget:"social-link-level",
				comparator: ">=",
				num: question.SLmax,
				socialLinkIdOrTarot: "target",
			});
		}
		if (question.SLmin > 1) {
			conditions.push( {
				type: "numeric",
				comparisonTarget:"social-link-level",
				comparator: "<=",
				num: question.SLmin,
				socialLinkIdOrTarot: "target",
			});
		}
		if (question.requiresDating) {
			conditions.push( {
				type: "boolean",
				booleanState: true,
				boolComparisonTarget: "social-availability",
				conditionTarget: "user",
				socialTypeCheck: "is-dating",
				socialLinkIdOrTarot: "target",
			});
		}
		const event = {
			parent: question.parent,
			label: "",
			text: question.text,
			img: (question?.parent?.parent as unknown as NPC)?.img ?? "",
			eventTags,
			sound: "",
			volume: 0,
			frequency: 1,
			placement: {
				starter: false,
				middle: true,
				finale: false,
				special: false,
			},
			name: "Question",
			origName: question.name,
			conditions: conditions,
			choices : shuffle( question.choices.map(PersonaSocial.convertQuestionChoiceToEventChoice)),
		} satisfies SocialCard["system"]["events"][number] & {origName: string};
		return event;
	}


	static convertQuestionChoiceToEventChoice( choice: NPC["system"]["questions"][number]["choices"][number]) : SocialCard["system"]["events"][number]["choices"][number] {
		const responseText = (choice.response ?? "").trim();
		const effects : SocialCard["system"]["events"][number]["choices"][number]["postEffects"]["effects"] = [];
		if (responseText.length >0) {
			const responseEffects = [{
				type: "social-card-action",
				cardAction: "card-response",
				text: responseText,
			}] satisfies typeof effects[number]["consequences"];
			effects.push({
				conditions: [{type: "always"}],
				consequences: responseEffects,
			});
		}
		return  {
			name: choice.name,
			conditions: [],
			text: choice.name,
			appendedText: choice.name,
			roll: {
				rollType: "question",
				progressSuccess: choice.progressSuccess,
				progressFail: 0,
				progressCrit: 0,
				rollTag1: "",
				rollTag2: "",
				rollTag3: "",
			},
			postEffects: {effects},
		};

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
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		return await ChatMessage.create(msgData,{} );
	}

	static lookupLink(cardData: CardData): ActivityLink | SocialLinkData {
		switch (cardData.card.system.cardType) {
			case "social":
				return this.lookupSocialLink(cardData.actor, cardData.linkId);
			default:
				return this.lookupActivity(cardData.actor, cardData.linkId);
		}

	}

	static lookupActivity(actor: PC, activityId: string): ActivityLink {
		const link = actor.activityLinks.find( x=> x.activity.id == activityId);
		if (!link) throw new PersonaError(`Can't find activity: ${activityId}`);
		return link;
	}

	static lookupSocialLink(actor: PC, linkId: string) :SocialLinkData {
		const link= actor.socialLinks.find(link => link.actor.id == linkId);
		if (!link)
			throw new PersonaError(`Can't find link ${linkId}`);
		return link;
	}

	static #getCameos(card: SocialCard, actor: PC, linkId: string) : SocialLink[] {
		let targets : (SocialLink)[] = [];
		const testCameo = (cameo: SocialLink) => {
			if (cameo.id == actor.id) return false;
			if (cameo.id == linkId) return false;
			const acc = cameo.accessor;
			if (!cameo.isAvailable(actor)) return false;
			if (cameo.hasCreatureTag("stuck-in-metaverse")) return false;
			const target = PersonaDB.socialLinks().find(link => link.id == linkId) as SocialLink | undefined;
			const targetAcc = target?.accessor;
			const situation: Situation = {
				cameo: acc,
				isSocial: true,
				user: actor.accessor,
				attacker: actor.accessor,
				socialTarget: targetAcc,
				socialRandom : Math.floor(Math.random() * 20) + 1,
			};
			if (this.disqualifierStatuses.some( st => cameo.hasStatus(st))) { return false;}
			return testPreconditions(card.system.cameoConditions , situation, null);
		}
		const allCameos = PersonaDB.socialLinks().
			filter (link => testCameo(link));
		switch (card.system.cameoType) {
			case "none": return [];
			case "above": {
				const initChar = this.getCharInInitiativeList(-1);
				if (initChar) {
					targets.push(initChar);
				}
				targets = targets.filter( x=> testCameo(x));
				break;
			}
			case "below": {
				const initChar = this.getCharInInitiativeList(1);
				if (initChar) {
					targets.push(initChar);
				}
				targets = targets.filter( x=> testCameo(x));
				break;
			}
			case "above+below": {
				const initChar1 = this.getCharInInitiativeList(1);
				const initChar2 = this.getCharInInitiativeList(-1);
				if (initChar1) { targets.push(initChar1);}
				if (initChar2) {targets.push(initChar2);}
				targets = targets.filter( x=> testCameo(x));
				break;
			}
			case "student": {
				const students = allCameos
				.filter( x=> x.hasCreatureTag("student"));
				if (students.length == 0) return [];
				const randomPick = students[Math.floor(Math.random() * students.length)];
				if (!randomPick)
				throw new PersonaError("Random student select failed");
				return [randomPick];
			}
			case "any": {
				const anyLink = allCameos;
				if (allCameos.length == 0) return [];
				const randomPick = anyLink[Math.floor(Math.random() * anyLink.length)];
				if (!randomPick)
				throw new PersonaError("Random any link select failed");
				return [randomPick];
			}
			case "invite-sl4":
				PersonaError.softFail("invite not yet implemented");
				return [];
			case "invite-couple":
				PersonaError.softFail("invite couple type not yet implemented");
				return [];
			case "buy-in-2":
				PersonaError.softFail("Buy in 2 not yet implemented");
				return [];
			case "date-default":
				//TODO: exception for devil multidate
				return [];
			case "cockblocker": {
				const otherDates = allCameos
				.filter( x =>  actor.isDating(x));
				if (otherDates.length ==0) return [];
				return [randomSelect(otherDates)];
			}
			default:
				card.system.cameoType satisfies never;
		}
		return targets.filter( x=> x != undefined
			&& x != actor
			&& x.id != linkId) as SocialLink[];
	}

	static #getPerk(card: SocialCard,actor: PC, link: Activity | SocialLink, cameos: SocialLink[]) {
		switch (card.system.perkType) {
			case "standard":
				return link.perk;
			case "standard-or-cameo":
				return "Choose One: <br>" +
					[link].concat(cameos)
					.map( x=> `* ${x.perk}`)
					.join("<br>");
			case "card-or-cameo":
				return "Choose One: <br>" +
					[card.system.perk].concat(cameos.map( x=> `* ${x.perk}`))
					.join("<br>");
			case "custom-only":
				return card.system.perk;
			case "standard-or-custom":
				return "Choose One: <br>" +
					[link.perk, card.perk]
					.map( x=> `* ${x}`)
					.join("<br>");
			case "standard-or-date":
				let datePerk : string | undefined = undefined;
				if (actor.isDating(link.id)) {
					switch (link.system.type) {
						case "pc":
							datePerk = this.defaultDatePerk();
							break;
						case "npc":
							datePerk = link.system.datePerk || this.defaultDatePerk();
							break;
						default:
							PersonaError.softFail(`No datePerk type for ${link.system.type}`);
							datePerk="";
					}
				}
				return "Choose One: <br>" +
					[actor.perk, datePerk]
					.filter ( x=> x != undefined)
					.map( x=> `* ${x}`)
					.join("<br>");
			case "none":
				return "";
			default:
				card.system.perkType satisfies never;
				return "";
		}
	}

	static defaultDatePerk() : string {
		return "Gain 2 social progress tokens with the target character";
	}

	static getCharInInitiativeList( offset: number) : SocialLink | undefined {
		if (!game.combat || !game.combat.combatant) return undefined;
		const initList = game.combat.turns;
		const index = initList.indexOf(game.combat.combatant);
		let modOffset = (index + offset) % initList.length;
		while(modOffset < 0) {
			modOffset += initList.length;
		}
		return initList[modOffset].actor as SocialLink;
	}

	static async #execCardSequence(cardData: CardData): Promise<ChatMessage[]> {
		let chatMessages: ChatMessage[] = [];
		await this.#printCardIntro(cardData);
		this.rollState = {
			continuation: () => {},
			cardData
		};
		const effectList = ConditionalEffectManager.getEffects(cardData.card.system.immediateEffects ?? [], null, null);
		await this.applyEffects(effectList,cardData.situation, cardData.actor);
		while (cardData.eventsRemaining > 0) {
			const ev = this.#getCardEvent(cardData);
			if (!ev) {
				PersonaError.softFail("Ran out of events");
				break;
			}
			cardData.eventsRemaining--;
			const msg = await this.#execEvent(ev, cardData);
			chatMessages.push(msg);
		}
		const opp = await this.#execOpportunity(cardData);
		if (opp) {
			chatMessages.push(opp);
		}
		const finale = await this.#finalizeCard(cardData);
		chatMessages.push(finale);
		this.stopCardExecution();
		return chatMessages;
	}

	static async #execOpportunity(cardData: CardData) {
		const card = cardData.card;
		if (!card.system.opportunity
			&& !card.system.opportunity_choices)
			return;
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-opportunity.hbs`, {item: card,card,cardData} );
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		return await ChatMessage.create(msgData,{} );
	}

	static #getCardEvent(cardData:CardData) : CardEvent | undefined  {
		const cardEventList = cardData.eventList;
		if (cardData.forceEventLabel) {
			const gotoEvent = cardEventList
				.filter( x=> x.label  == cardData.forceEventLabel)
				.filter( x=> !x.eventTags.includes("disabled"))
			;
			cardData.forceEventLabel = null;
			if (gotoEvent.length > 0) {
				return weightedChoice(gotoEvent.map( event => ({
					item: event,
					weight: Number(event.frequency) > 0 ? (Number(event.frequency) ?? 1) : 1,
				})));
			}
			PersonaError.softFail (`Can't find event label ${cardData.forceEventLabel} on card ${cardData.card.name}`);
		}
		let eventList = cardEventList
			.filter ( ev => !ev.eventTags.includes("disabled"))
			.filter( (ev, i) => !cardData.eventsChosen.includes(i) && testPreconditions(
				ConditionalEffectManager.getConditionals( ev.conditions, null, null),
				cardData.situation, null));
		const isEvType = function (ev: CardEvent, evType: keyof NonNullable<CardEvent["placement"]>) {
			let placement = ev.placement ?? {
				starter: true,
				middle: true,
				finale: true,
				special: false,
			};
			if (Object.values(placement).every( x=> x == false)) {
				placement = {
					starter: true,
					middle: true,
					finale: true,
					special: false,
				};
			}
			return placement[evType];
		};
		switch (true) {
			case cardData.eventsChosen.length == 0:
				eventList = eventList.filter( ev => isEvType(ev, "starter"));
				break;
			case cardData.eventsRemaining > 1:
				eventList = eventList.filter( ev => isEvType(ev, "middle"));
				break;
			case cardData.eventsRemaining <= 1:
				eventList = eventList.filter( ev => isEvType(ev, "finale"));
				break;
		}
		const eventWeights = eventList.map( event => ({
			item: event,
			weight: Number(event.frequency) ?? 1
		})
		);
		const ev = weightedChoice(eventWeights);
		if (!ev) return undefined;
		cardData.eventsChosen.push(cardEventList.indexOf(ev));
		return ev;
	}

	static async #printCardIntro(cardData: CardData) {
		const {card, cameos, perk, actor } = cardData;
		const link = this.lookupLink(cardData);
		const DC = this.getBaseSkillDC(cardData);
		const linkId =  "actor" in link ? link.actor.id : link.activity.id;
		const { perkDisabled} = card.system;
		const isCameo = card.system.cameoType != "none";
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-intro.hbs`, {item: card,card, cameos, perk, perkDisabled, link: link, linkId, pc: actor, isCameo, user: game.user, DC} );
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		return await ChatMessage.create(msgData,{} );
	}

	static async #execEvent(event: CardEvent, cardData: CardData) {
		const eventNumber = cardData.eventsChosen.length;
		const eventIndex = cardData.eventList.indexOf(event);
		if (event.eventTags.includes("one-shot")) {
			await this.markEventUsed(event);
		}
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-event.hbs`,{event, eventNumber, cardData, situation : cardData.situation, eventIndex});
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		const msg = await ChatMessage.create(msgData,{} );
		if (event.sound && event.sound.length > 0) {
			cardData.sound = await PersonaSounds.playFree(event.sound, event.volume ?? 0.5);
		}
		if (ArrayCorrector(event.choices).length > 0) {
			await new Promise( (conf, _rej) => {
				this.rollState = {
					cardData,
					continuation: conf
				};
			});
		}
		return msg;
	}

	static async markEventUsed(event: CardEvent) {
		let parent = event.parent;
		while (true) {
			if (parent == undefined) {
				PersonaError.softFail("Can't trace parent to card or actor");
				return;
			}
			if (parent instanceof PersonaItem && parent.system.type == "socialCard") {
				await this.markSocialCardEventUsed(parent as SocialCard, event);
				return;
			}
			if (parent instanceof PersonaActor && parent.system.type == "npc") {
				await this.markQuestionUsed(parent as NPC, event);
				return;
			}
			parent = parent.parent;
		}
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

	static getCardModifiers(cardData: CardData) : ModifierList {
		const card= cardData.card;
		let effects : ConditionalEffect[] = [];
		const globalMods = ConditionalEffectManager.getEffects(card.system.globalModifiers, null, null);
		effects = effects.concat(globalMods);
		const retList = new ModifierList();
		retList.addConditionalEffects(effects, "Card Modifier",["socialRoll"]);
		return retList;
	}

	static async #finalizeCard( cardData: CardData) : Promise<ChatMessage<Roll>> {
		let html = "";
		let pcImproveSpend = "";
		if (cardData.card.system.cardType == "social") {
			const link = this.lookupLink(cardData) as SocialLinkData;
			if (link.actor.isPC()) {
				pcImproveSpend = `<li class="token-spend"> spend 4 progress tokens to raise link with ${link.actor.name}</li>`;
			}
		}
		const tokenSpends = (cardData.card.system.tokenSpends ?? [])
		.concat(cardData.activity != cardData.card ?  cardData.activity.system.tokenSpends ?? [] : [])
		.filter( spend => testPreconditions(spend.conditions ?? [], cardData.situation, null))
		.map(x=> `spend ${x.amount} progress tokens to ${x.text}.`)
		.map(x=> `<li class="token-spend"> ${x} </li>`);
		const finale = (cardData.card.system.finale?.trim()) ? `
		<h2> Finale </h2>
		<span class="finale">
		${cardData.card.system.finale.trim()}
		</span>
		` : "";
		html += finale;
		html += `<div class="token-spends">
		<h3>Token Spends:</h3>
		<ul>
		${pcImproveSpend}
		${tokenSpends.join("")}
		</ul>
		</div>
		`;
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		const msg= await ChatMessage.create(msgData,{} );
		return msg;
	}

	static async chooseActivity(actor: PC, activity: SocialLink | Activity, _options: ActivityOptions = {}) {
		const debug = PersonaSettings.debugMode();
		if (!debug &&
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
			if (!testPreconditions( activity.system.conditions, situation, null)) {
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
		this.#socialEncounter(actor, activity);
	}

	static drawnCards() : string[] {
		//NOTE: Only a debug function
		return this.#drawnCardIds;
	}

	static async execTrigger( trigger: NonCombatTriggerTypes, actor: PC, situation ?: Situation, msg = "Triggered Effect"): Promise<void> {
		return await TriggeredEffect.execNonCombatTrigger(trigger, actor, situation, msg);
	}

	static onTrigger(trigger: NonCombatTriggerTypes, actor: PC, situation ?: Situation) : CombatResult {
		return TriggeredEffect.onTrigger(trigger, actor, situation);
	}

	static async awardPerk(target: PC, socialLink: SocialLink) {
		const situation : Situation = {
			user: target.accessor,
			tarot: socialLink.tarot?.name as TarotCard,
			target: target.accessor,
			socialTarget: target.accessor,
		}
		// console.log(situation);
		await this.execTrigger("on-attain-tarot-perk", target, situation, `Gains Perk (${socialLink.tarot?.name})`) ;
	}

	static getBaseSkillThreshold (cardData: CardData) : number {
		return this.getBaseSkillDC(cardData) - 5;
	}


	static getSocialLinkDC (cardData: CardData, type: "cameo" | "target" = "target") : number | undefined {
		switch (type) {
			case "cameo": {
				const cameoId = cardData.cameos[0]?.id;
				if (!cameoId) return undefined;
				const link = this.lookupSocialLink(cardData.actor, cameoId);
				return 10 + link.linkLevel * 2;
			}
			case "target": {
				const link = this.lookupSocialLink(cardData.actor, cardData.linkId);
				return 10 + link.linkLevel * 2;
			}
		}
	}

	static getBaseSkillDC (cardData: CardData) : number {
		const ctype = cardData.card.system.cardType;
		switch (ctype) {
			case "social":
				return this.getSocialLinkDC(cardData, "target") ?? -1;
			case "training":
			case "other":
			case "job":
			case "recovery":
				switch (cardData.card.system.dc.thresholdType) {
					case "static":
						return cardData.card.system.dc.num;
					case "levelScaled":
						return cardData.card.system.dc.multiplier * cardData.actor.system.combat.classData.level + cardData.card.system.dc.startingVal;
					case "statScaled":
						const stat = cardData.card.system.dc.stat;
						return 10 + (cardData.actor.system.skills[stat] ?? -999);
					default:
							cardData.card.system.dc satisfies never;
						return 20;
				}
			default:
				ctype satisfies never;
				throw new PersonaError("Should be unreachable");
		}
	}

	static getCardRollDC(cardData: CardData, roll: CardRoll) : number {
		switch (roll.rollType) {
			case "save":
				switch (roll.saveType) {
					case "normal": return 11;
					case "easy": return 6;
					case "hard": return 16;
					default: roll.saveType satisfies never;
						throw new PersonaError("Should be unreachable");
				}
			case "studentSkillCheck":
				switch (roll.DC.subtype) {
					case "static":
						return roll.DC.staticDC;
					case "base":
						return this.getBaseSkillDC(cardData);
					case "cameoSocial":
						return this.getSocialLinkDC(cardData, "cameo") ?? -1;
					default:
						roll.DC.subtype satisfies never;

				}
			default: return 0;
		}
	}

	static async handleCardChoice(cardData: CardData, cardChoice: DeepNoArray<CardChoice>) {
		const cardRoll = cardChoice.roll;
		// const effectList  = cardChoice?.postEffects?.effects ?? [];
		const effectList = ConditionalEffectManager.getEffects(cardChoice?.postEffects?.effects ?? [], null, null);
		switch (cardRoll.rollType) {
			case "question":
			case "none": {
				await this.processAutoProgress(cardData, cardRoll, true, false);
				await this.applyEffects(effectList,cardData.situation, cardData.actor);
				break;
			}
			case "gmspecial":
				await this.applyEffects(effectList,cardData.situation, cardData.actor);
				break;
			case "studentSkillCheck": {
				const modifiers = this.getCardModifiers(cardData);
				modifiers.add("Roll Modifier", cardRoll.modifier);
				const DC = this.getCardRollDC(cardData, cardRoll);
				const link = this.lookupLink(cardData);
				const activityOrActor = "actor" in link ? link.actor: link.activity;
				const skill = this.resolvePrimarySecondarySocialStat(cardRoll.studentSkill, activityOrActor);
				const roll = await this.rollSocialStat(cardData.actor, skill, modifiers, `Card Roll (${skill} ${cardRoll.modifier || ""} vs DC ${DC})`,  cardData.situation);
				await roll.toModifiedMessage();
				const hit = roll.total >= DC;
				const critical =roll.total >= DC + 10;
				const situation : Situation = {
					...cardData.situation,
					hit,
					criticalHit: critical,
					naturalRoll: roll.natural,
					rollTotal: roll.total,
					rollTags: this.getCardRollTags(cardRoll),
				};
				await this.processAutoProgress(cardData, cardRoll, hit, critical );
				await this.#onCardRoll(situation);
				await this.applyEffects(effectList, situation, cardData.actor);
				break;
			}
			case "save": {
				const saveResult = await PersonaCombat.rollSave(cardData.actor, {
					DC: this.getCardRollDC(cardData, cardRoll),
					label: "Card Roll (Saving Throw)",
				});
					const situation : Situation = {
					...cardData.situation,
					hit: saveResult.success,
					rollTotal: saveResult.total,
					naturalRoll: saveResult.natural,
					rollTags: this.getCardRollTags(cardRoll),
				};
				await this.processAutoProgress(cardData, cardRoll, saveResult.success, false);
				await this.applyEffects(effectList,situation, cardData.actor);
				break;
			}
			case "dual":
				//TODO: implement dual roll
				PersonaError.softFail("Dual roll is not yet supported")
				break;
			default:
				cardRoll satisfies never;
		}
	}

	static async #onCardRoll(situation: Situation & RollSituation) {
		const userAcc = situation.user;
		if (!userAcc) {
			PersonaError.softFail("No user in Card Roll Situation");
			return;
		}
		const user = PersonaDB.findActor(userAcc);
		if (!user) {
			PersonaError.softFail("Can't find user in Card Roll Situation");
			return;
		}
		await user.onRoll(situation);
	}

	static async processAutoProgress( cardData: CardData, cardRoll: CardRoll, hit: boolean, critical: boolean) : Promise<void> {
		let progress = 0;
		progress += hit ? cardRoll.progressSuccess ?? 0 : 0;
		progress += critical ? cardRoll.progressCrit ?? 0 : 0;
		progress += !hit ? cardRoll.progressFail ?? 0 : 0;
		if (progress != 0) {
			await this.applyCardProgress(cardData, progress)
		}
	}

	static async applyCardProgress(cardData: CardData, amount: number) {
		const actor = cardData.actor;
		switch (cardData.card.system.cardType) {
			case "social":
				return await actor.alterSocialLinkProgress(cardData.linkId, amount);
			case "job":
			case "training":
			case "recovery":
			case "other":
				return await actor.activityProgress(cardData.card.id, amount);
			default:
				cardData.card.system.cardType satisfies never;
				return;
		}
	}

	static async applyEffects(effects: ConditionalEffect[], situation: Situation, actor: PC) {
		const results = ArrayCorrector(effects ?? []).flatMap( eff=> getActiveConsequences(eff, situation, null));
		const processed= PersonaCombat.ProcessConsequences_simple(results);
		const result = new CombatResult();
		for (const c of processed.consequences) {
			result.addEffect(null, actor, c.cons);
		}
		await result.emptyCheck()
			?.autoApplyResult();
		// .toMessage("Social Roll Effects", actor);

	}

	static async makeCardRoll(ev: JQuery.ClickEvent) {
		if (!this.rollState)
			throw new PersonaError("No event state present, can't resume roll");
		const cardId = HTMLTools.getClosestData(ev, "cardId");
		const messageId = HTMLTools.getClosestData(ev, "messageId");
		const message = game.messages.get(messageId);
		if (!message) {
			throw new PersonaError(`Couldn't find messsage ${messageId}`);
		}
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		const choiceIndex = Number(HTMLTools.getClosestData(ev, "choiceIndex"));
		const card = PersonaDB.allSocialCards().find(card=> card.id == cardId);

		if (!card) {
			throw new PersonaError(`Can't find card ${cardId}`);
		}
		const cardEvent = this.rollState.cardData.eventList[eventIndex];
		const choice = cardEvent.choices[choiceIndex];
		await this.handleCardChoice(this.rollState.cardData, choice);
		const content = $(message.content);
		content
			.closest(".social-card-event")
			.find(".event-choice")
			.each( function () {
				const index = Number(HTMLTools.getClosestData($(this), "choiceIndex"));
				if (index != choiceIndex) {
					$(this).remove();
				} else {
					$(this).find("button").remove();
					$(this).find(".event-choice").addClass("chosen");
				}
			});
		const html = content.html();
		await message.update( {"content": html});
		if (!this.rollState.continuation) {
			throw new PersonaError("No roll is currently ongoing, can't execute");
		}
		this.rollState.continuation();
	}


	static async #sendGMCardRequest(actor: PC, link: SocialLink | Activity) : Promise<SocialCard> {
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
		if (!card) throw new PersonaError(`No card found for ${link.name}`);
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
		const card = await this.#drawSocialCard(actor, activity)
		const sendBack = [socketPayload.sender];
		// console.log(`Send back ${card.name}`);
		PersonaSockets.simpleSend("CARD_REPLY", {cardId: card.id}, sendBack);
	}

	static async getCardReply(req: SocketMessage["CARD_REPLY"]) {
		console.log(`got reply ${req.cardId}`);
		if (!this.cardDrawPromise) return;
		if (req.cardId) {
			this.cardDrawPromise.res(req.cardId);
		}
	}

	static async execSocialCardAction(eff: SocialCardActionConsequence) : Promise<void> {
		if (!this.rollState) {
			PersonaError.softFail(`Can't execute card action ${eff.cardAction}. No roll state`);
			return;
		}
		switch (eff.cardAction) {
			case "stop-execution":
				await this.stopCardExecution();
				break;
			case "exec-event":
				this.forceEvent(eff.eventLabel);
				this.addExtraEvent(1);
				break;
			case "inc-events":
				this.addExtraEvent(eff.amount ?? 0);
				break;
			case "gain-money":
					await this.gainMoney(eff.amount ?? 0)
				break;
			case "modify-progress-tokens":
					await this.modifyProgress(eff.amount ?? 0);
				break;
			case "alter-student-skill":
					if (!eff.studentSkill) {
						PersonaError.softFail("No student skill given");
						break;
					}
				await this.alterStudentSkill( eff.studentSkill, eff.amount ?? 0);
				break;
			case "modify-progress-tokens-cameo": {
				const cameos = this.rollState.cardData.cameos
				const actor  = this.rollState.cardData.actor;
				if (!cameos || cameos.length < 1) {
					break;
				}
				for (const cameo of cameos) {
					await actor.socialLinkProgress(cameo.id, eff.amount ?? 0);
				}
				break;
			}
			case "add-card-events-to-list":
					await this.addCardEvents(eff.cardId);
				break;
			case "replace-card-events":
					await this.replaceCardEvents(eff.cardId, eff.keepEventChain);
				break;
			case "set-temporary-variable":
					await this.variableAction(eff.operator, eff.variableId, eff.value);
				break;
			case "card-response":
					await this.#applyCardResponse(eff.text);
				break;
			case "append-card-tag":
				await this.#appendCardTag(eff.cardTag);
				break;
			default:
					eff satisfies never;
				break;
		}
	}

	static async #appendCardTag(tag: CardTag) {
		if (!this.rollState) {
			PersonaError.softFail("Can't find Rollstate when trying to apply Card Response");
			return;
		}
		const cardData = this.rollState.cardData;
		cardData.extraCardTags.push(tag);
	}

	static async #applyCardResponse(text: string) {
		if (!this.rollState) {
			PersonaError.softFail("Can't find Rollstate when trying to apply Card Response");
			return;
		}
		const cardData = this.rollState.cardData;
		const link = game.actors.get(cardData.linkId);
		if (!link) {
			PersonaError.softFail(`Can't get link for apply Card Response ${cardData.linkId}`, cardData.linkId);
		}
		const linkImg = link?.img ?? "";
		const templateData= {
			item: cardData.card,
			cardData,
			text,
			linkImg
		};
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-response.hbs`, templateData);
		const messageData = {
			speaker: {alias: "Question Response"},
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		};
		await ChatMessage.create( messageData);
	}

	static async variableAction(operator: VariableAction, variableName: string, amount: number) {
		if (!this.rollState) {
			PersonaError.softFail(`Can't create more events as there is no RollState`);
			return;
		}
		let varVal = this.getSocialVariable(variableName);
		switch (operator) {
			case "set":
				varVal = amount;
				this.setSocialVariable(variableName, varVal);
				break;
			case "add":
				if ( varVal == undefined) {
					PersonaError.softFail(`Social Variable ${variableName} doesn't exist`);
					break;
				}
				varVal += amount;
				this.setSocialVariable(variableName, varVal);
				break;
			case "multiply":
				if ( varVal == undefined) {
					PersonaError.softFail(`Social Variable ${variableName} doesn't exist`);
					break;
				}
				varVal *= amount;
				this.setSocialVariable(variableName, varVal);
				break;
			default:
				operator satisfies never;
		}
	}

	static getSocialVariable(varId: string): number | undefined {
		if (!this.rollState) {
			console.log(`No rollstate so couldn't get variable ${varId}`);
			return undefined;
		}
		const varData = this.rollState.cardData.variables;
		return varData[varId];
	}

	static async setSocialVariable(varId: string, value: number) {
		if (!this.rollState) {
			console.log(`No rollstate so couldn't alter variable ${varId} ${value}`);
			return;
		}
		const varData = this.rollState.cardData.variables;
		varData[varId] = value;
	}

	static async addCardEvents(cardId: string) {
		if (!cardId) throw new PersonaError("No card ID given to addCardEvent");
		if (!this.rollState) {
			PersonaError.softFail(`Can't create more events as there is no RollState`);
			return;
		}
		const newCard = PersonaDB.allSocialCards().find(x=> x.id == cardId);
		if (!newCard) {
			PersonaError.softFail(`Can't find Social Card id ${cardId} `);
			return;
		}
		this.rollState.cardData.eventList.push(...newCard.cardEvents().slice());
	}

	static async replaceCardEvents(cardId: string, keepEventChain = false) {
		if (!cardId) {
			PersonaError.softFail("No card ID given to addCardEvent");
			return;
		}
		if (!this.rollState) {
			PersonaError.softFail(`Can't create more events as there is no RollState`);
			return;
		}
		const newCard = PersonaDB.allSocialCards().find(x=> x.id == cardId);
		if (!newCard) {
			PersonaError.softFail(`Can't find Social Card id ${cardId} `);
			return;
		}
		console.log(`Replacing Card Event list wtih ${newCard.name}`);
		if (!keepEventChain) {
			this.rollState.cardData.eventsRemaining = newCard.system.num_of_events;
		}
			this.rollState.cardData.eventsChosen = [];
		this.rollState.cardData.eventList = newCard.cardEvents().slice();
	}

	static async modifyProgress(amt: number) {
		const  rs = this.checkRollState("modify Progress tokens");
		if (!rs) return;
		const actor = rs.cardData.actor;
		if (rs.cardData.situation.socialTarget) {
			const linkId = rs.cardData.linkId;
			await actor.socialLinkProgress(linkId, amt);
		} else {
			const id = rs.cardData.card.id
			await actor.activityProgress(id, amt);
		}
	}

	static checkRollState(operation: string = "perform Social Roll Operation") : typeof PersonaSocial["rollState"]  | undefined {
		if (this.rollState) {
			return this.rollState;
		}
		PersonaError.softFail(`Roll state doesn't exist can't ${operation}`);
		return undefined;
	}

	static async alterStudentSkill(skill: StudentSkill, amt: number) {
		const rs = this.checkRollState("alter student skill");
		if (!rs) return;
		await rs.cardData.actor.alterSocialSkill(skill, amt);
	}

	static async gainMoney(amt: number) {
		if (!this.rollState) {
			PersonaError.softFail(`Can't grant money. No Rollstate`);
			return;
		}
		await this.rollState.cardData.actor.gainMoney(amt, true);

	}

	static addExtraEvent(amount: number) {
		if (!this.rollState) {
			PersonaError.softFail(`Can't create more events as there is no RollState`);
			return;
		}
		this.rollState.cardData.eventsRemaining += amount;
	}

	static async stopCardExecution() {
		if (this.sound) this.sound.stop();
		this.sound = null;
		this.rollState = null;
		this.cardDrawPromise= null;
	}

	static forceEvent(evLabel?: string) {
		console.log(`Entering Force Event : ${evLabel}`);
		if (!evLabel) return;
		if (!this.rollState) {
			PersonaError.softFail(`Can't force event ${evLabel} as there is no rollstate`);
			return;
		}
		console.log(`Forcing Event : ${evLabel}`);
		this.rollState.cardData.forceEventLabel = evLabel;
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
		tracker.find("div.weather-icon").append(weatherIcon);
		const doom = PersonaCalendar.DoomsdayClock;
		const doomtxt = `${doom.amt} / ${doom.max}`
		tracker.find("span.doomsday").text(doomtxt);
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
		// const situation: Situation = {
		// 	user: initiator.accessor,
		// 	attacker: initiator.accessor,
		// 	isSocial: true,
		// 	target: target.accessor,
		// 	socialTarget: target.accessor,
		// };
		if (!this.meetsConditionsToStartLink(initiator, target)) {
		// if (!testPreconditions(target.system.type == "npc" ? target.system.conditions : [], situation, null)) {
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

	static async requestAvailabilitySet(targetId: string, newValue: boolean) {
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
		return testPreconditions(target.system.type == "npc" ? target.system.conditions : [], situation, null);
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

	static getCardRollTags (cardRoll: CardRoll) : RollTag[] {
		return [
			cardRoll.rollTag1,
			cardRoll.rollTag2,
			cardRoll.rollTag3,
		].filter(x=> x);
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
	PersonaSockets.setHandler("DRAW_CARD", PersonaSocial.answerCardRequest.bind(PersonaSocial));
	PersonaSockets.setHandler("CARD_REPLY", PersonaSocial.getCardReply.bind(PersonaSocial));
	PersonaSockets.setHandler("EXPEND_EVENT", PersonaSocial.getExpendEventRequest.bind(PersonaSocial));
	PersonaSockets.setHandler("EXPEND_QUESTION", PersonaSocial.getExpendQuestionRequest.bind(PersonaSocial));
});


Hooks.on("socketsReady" , () => {
	PersonaSockets.setHandler("DEC_AVAILABILITY", ( task_id: string) => {
		if (!game.user.isGM) return;
		const link = game.actors.find(x=> x.id == task_id);
		if (link) {
			const actor = link as PersonaActor;
			if (actor.system.type == "npc" || actor.system.type == "pc") {
				(actor as SocialLink).setAvailability(false);
			}
			return;
		}
		throw new PersonaError(`Can't find Task ${task_id} to decremetn availability`);
	});
});

//@ts-ignore
window.PersonaSocial = PersonaSocial

Hooks.on("updateActor", async (_actor: PersonaActor, changes) => {
	if ((changes as any)?.system?.weeklyAvailability) {
		(game.actors.contents as PersonaActor[])
			.filter(x=> x.system.type =="pc"
				&& x.sheet._state > 0)
			.forEach(x=> x.sheet.render(true));
	}
});

Hooks.on("updateItem", async (_item: PersonaItem, changes) => {
	if ((changes as any)?.system?.weeklyAvailability) {
		(game.actors.contents as PersonaActor[])
			.filter(x=> x.system.type =="pc"
				&& x.sheet._state > 0)
			.forEach(x=> x.sheet.render(true));
	}
});

Hooks.on("renderChatMessage", async (message: ChatMessage, html: JQuery ) => {
	if ((message?.author ?? message?.user) == game.user) {
		html.find(".social-card-roll .make-roll").on("click", PersonaSocial.makeCardRoll.bind(PersonaSocial));
		html.find(".social-card-roll .next").on("click", PersonaSocial.makeCardRoll.bind(PersonaSocial));
	}
});

export type CardData = {
	card: SocialCard,
	actor: PC,
	linkId: string,
	activity: Activity | SocialLink,
	cameos: SocialLink[],
	perk: string,
	forceEventLabel: null | string,
	eventList: SocialCard["system"]["events"];
	eventsChosen: number[],
	eventsRemaining: number,
	situation: Situation & SocialCardSituation;
	replaceSet: Record<string, string>;
	sound?: FOUNDRY.AUDIO.Sound
	variables: Record<string, number>;
	extraCardTags: CardTag[];
};


export type SocialEncounterCard = SocialCard & {system: {cardType: "social"}};

export type ValidSocialTarget = NPC | PC | NPCAlly

