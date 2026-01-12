import {CardTag} from "../../config/card-tags.js";
import {HBS_TEMPLATES_DIR} from "../../config/persona-settings.js";
import {RollTag} from "../../config/roll-tags.js";
import {RollSituation} from "../../config/situation.js";
import {CardChoice, CardEvent, CardRoll} from "../../config/social-card-config.js";
import {StudentSkill, StudentSkillExt} from "../../config/student-skills.js";
import { PersonaActor} from "../actor/persona-actor.js";
import {ModifierList} from "../combat/modifier-list.js";
import {ConditionalEffectManager} from "../conditional-effect-manager.js";
import {ArrayCorrector, PersonaItem} from "../item/persona-item.js";
import {PreconditionConverter} from "../migration/convertPrecondition.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaRoller} from "../persona-roll.js";
import {PersonaSounds} from "../persona-sounds.js";
import {testPreconditions} from "../preconditions.js";
import {shuffle, weightedChoice} from "../utility/array-tools.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {PersonaSocial} from "./persona-social.js";
import {CardData, SocialCardExecutor} from "./social-card-executor.js";

export class SocialCardEventHandler {
	owner: SocialCardExecutor;

	constructor (exec: SocialCardExecutor) {
		this.owner = exec;
	}

	get cardData() : CardData { return this.owner.cardData; }
	get earlyAbort() : boolean {return this.owner.abort;}

	async cardEventLoop() : Promise<ChatMessage<Roll>[]> {
		const chatMessages : ChatMessage<Roll>[] = [];
		const cardData = this.cardData;
		while (cardData.eventsRemaining > 0) {
			// if (!this.rollState) { return chatMessages;}
			if (this.earlyAbort) { return chatMessages;}
			const ev = this.#getCardEvent(cardData);
			if (!ev) {
				cardData.currentEvent = null;
				PersonaError.softFail(`Missing Event choice for events remaining: ${this.cardData.eventsRemaining} on card ${this.cardData.card.name}`);
				cardData.eventsRemaining--;
				continue;
			}
			cardData.eventsChosen.push(ev);
			cardData.currentEvent = ev;
			cardData.eventsRemaining--;
			const msg = await this.#execEvent(ev, this.cardData);
			chatMessages.push(msg as ChatMessage);
		}
		return chatMessages;

	}


	async #execEvent(event: CardEvent, cardData: CardData) {
		const eventNumber = cardData.eventsChosen.length;
		const eventIndex = cardData.eventList.indexOf(event);
		if (event.eventTags.includes("one-shot")) {
			await this.markEventUsed(event);
		}
		event.choices.forEach( ch => {
			const roll : CardRoll = ch.roll;
			const rollTags = this.getRollTags(cardData, ch);
			const DC = this.getCardRollDC(cardData, ch.roll, rollTags);
			//@ts-expect-error forcing this on there
			roll.DCVal = DC;
		});
		const html = await foundry.applications.handlebars.renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-event.hbs`,{event, eventNumber, cardData, situation : cardData.situation, eventIndex});

		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		const msg = await ChatMessage.create(msgData,{} );
		if (event.sound && event.sound.length > 0) {
			if (cardData.sound) {cardData.sound.stop();}
			cardData.sound = await PersonaSounds.playFree(event.sound, event.volume ?? 0.5);
		}
		if (ArrayCorrector(event.choices).length > 0) {
			const cardEvent = await new Promise( (conf, _rej) => {
				this.owner.setContinuation(conf);
			});
			if (cardEvent != undefined) {
				const choice = cardEvent as CardData["eventList"][number]["choices"][number];
				await this.handleCardChoice(this.cardData, choice);
			}
		}
		return msg;
	}

	async handleCardChoice(cardData: CardData, cardChoice: DeepNoArray<CardChoice>) {
		const cardRoll = cardChoice.roll;
		const rollTags = this.getCardRollTags(cardRoll);
		if (cardData.currentEvent) {
			rollTags.push(...cardData.currentEvent.eventTags);
		}
		rollTags.push(...cardData.extraCardTags);
		if (!cardData.currentEvent) {
			PersonaError.softFail(`No current event for Card ${cardData.card.name}`);
		}
		const effectList = ConditionalEffectManager.getEffects(cardChoice?.postEffects?.effects ?? [], null, null);
		if (cardChoice.resourceCost > 0) {
			await cardData.actor.spendMoney(Math.abs(cardChoice.resourceCost ?? 0));
		}
		if (rollTags.includes("free-event")) {
			this.addExtraEvent(1);
		}
		switch (cardRoll.rollType) {
			case "question":
			case "none": {
				await this.processAutoProgress(cardData, cardRoll, true, false);
				await this.#onCardChoice(cardData, cardRoll, rollTags);
				await PersonaSocial.applyEffects(effectList,cardData.situation, cardData.actor);
				break;
			}
			case "gmspecial":
				await PersonaSocial.applyEffects(effectList,cardData.situation, cardData.actor);
				await this.#onCardChoice(cardData, cardRoll, rollTags);
				break;
			case "studentSkillCheck": {
				// modifiers.add("Roll Modifier", cardRoll.modifier);
				const DCMods = this.getCardRollDCModifiers(cardData, cardRoll, rollTags);
				const link = this.owner.link;
				const activityOrActor = "actor" in link ? link.actor: link.activity;
				const skill = this.resolvePrimarySecondarySocialStat(cardRoll.studentSkill, activityOrActor);
				const roll = await PersonaRoller.rollSocialStat(cardData.actor, skill, {
					askForModifier: true,
					rollTags,
					DC: 0,
					DCMods,
					situation: cardData.situation,
					label: `Card Roll (${skill} ${cardRoll.modifier || ""})`,
				});
				await roll.toModifiedMessage(true);
				const hit = roll.success ?? false;
				const critical = roll.critical ?? false;
				const situation = roll.resolvedSituation();
				await this.processAutoProgress(cardData, cardRoll, hit, critical );
				await this.#onCardRoll(cardData, cardRoll, situation);
				await PersonaSocial.applyEffects(effectList, situation, cardData.actor);
				break;
			}
			case "save": {
				const DCMods = this.getCardRollDCModifiers(cardData, cardRoll, rollTags);
				const saveResult = await PersonaRoller.rollSave(cardData.actor,  {
					askForModifier: true,
					DC: 0,
					DCMods,
					label: "Card Roll (Saving Throw)",
					rollTags,
					situation: cardData.situation,
				});
				await saveResult.toModifiedMessage(true);
				const situation = saveResult.resolvedSituation();
				await this.processAutoProgress(cardData, cardRoll, saveResult.success ?? false, false);
				await this.#onCardRoll(cardData, cardRoll, situation);
				await PersonaSocial.applyEffects(effectList, situation, cardData.actor);
				break;
			}
			case "dual":
				//TODO: implement dual roll
				PersonaError.softFail("Dual roll is not yet supported");
				break;
			default:
				cardRoll satisfies never;
		}
	}

	public static questionsAsEvents( socialTarget: SocialLink) : SocialCard["system"]["events"] {
		const questions = socialTarget.questions
			.filter( q=>!q.expended);
		return questions.map(this.questionToEvent);
	}

	private static questionToEvent(this:void, question: NPC["system"]["questions"][number]) : SocialCard["system"]["events"][number] & {origName: string} {
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
			choices : shuffle( question.choices.map(SocialCardEventHandler.convertQuestionChoiceToEventChoice)),
		} satisfies SocialCard["system"]["events"][number] & {origName: string};
		return event;
	}

	static convertQuestionChoiceToEventChoice( this: void, choice: NPC["system"]["questions"][number]["choices"][number]) : SocialCard["system"]["events"][number]["choices"][number] {
		const responseText = (choice.response ?? "").trim();
		const effects : SocialCard["system"]["events"][number]["choices"][number]["postEffects"]["effects"] = [];
		if (responseText.length >0) {
			const responseEffects = [{
				type: "social-card-action",
				cardAction: "card-response",
				text: responseText,
			}] satisfies typeof effects[number]["consequences"];
			effects.push({
				isDefensive: false,
				conditions: [{type: "always"}],
				consequences: responseEffects,
				isEmbedded: false,
			});
		}
		return  {
			name: choice.name,
			conditions: [],
			text: choice.name,
			appendedText: choice.name,
			resourceCost: 0,
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

	getBaseSkillDC (cardData: CardData) : number {
		const ctype = cardData.card.system.cardType;
		switch (ctype) {
			case "social":
				return this.getSocialLinkDC(cardData, "target") ?? -1;
			case "training":
			case "other":
			case "job":
			case "mixin":
			case "recovery":
			case "minor":
				switch (cardData.card.system.dc.thresholdType) {
					case "static":
						return cardData.card.system.dc.num;
					case "levelScaled":
						return cardData.card.system.dc.multiplier * cardData.actor.system.combat.classData.level + cardData.card.system.dc.startingVal;
					case "statScaled": {
						const stat = cardData.card.system.dc.stat;
						return 10 + (cardData.actor.system.skills[stat] ?? -999);
					}
					default:
						cardData.card.system.dc satisfies never;
						return 20;
				}
			default:
				ctype satisfies never;
				throw new PersonaError("Should be unreachable");
		}
	}

	private getSocialLinkDC (cardData: CardData, type: "cameo" | "target" = "target") : number | undefined {
		switch (type) {
			case "cameo": {
				const cameoId = cardData.cameos[0]?.id;
				if (!cameoId) {return undefined;}
				const link = PersonaSocial.lookupSocialLink(cardData.actor, cameoId);
				return 10 + link.linkLevel * 2;
			}
			case "target": {
				const link = PersonaSocial.lookupSocialLink(cardData.actor, cardData.linkId);
				return 10 + link.linkLevel * 2;
			}
		}
	}

	private getBaseCardRollDC(cardData: CardData, cardRoll: CardRoll): number {
		switch (cardRoll.rollType) {
			case "save":
				switch (cardRoll.saveType) {
					case "normal": return 11;
					case "easy": return 6;
					case "hard": return 16;
					default: cardRoll.saveType satisfies never;
						throw new PersonaError("Should be unreachable");
				}
			case "studentSkillCheck":
				switch (cardRoll.DC.subtype) {
					case "static":
						return cardRoll.DC.staticDC;
					case "base":
						return this.getBaseSkillDC(cardData);
					case "cameoSocial":
						return this.getSocialLinkDC(cardData, "cameo") ?? -1;
					default: {
						cardRoll.DC.subtype satisfies never;
						return 0;
					}

				}
			default: return 0;
		}
	}

	private getCardRollDC(cardData: CardData, cardRoll: CardRoll, rollTags: (RollTag | CardTag)[]) : number {
		const modifiers = this.getCardRollDCModifiers(cardData, cardRoll, rollTags);
		const situation = {
			... cardData.situation,
			rollTags,
		};
		return modifiers.total(situation);
	}

	private getCardRollDCModifiers(cardData: CardData, cardRoll: CardRoll, rollTags : (RollTag | CardTag)[]) : ModifierList {
		const base = this.getBaseCardRollDC(cardData, cardRoll);
		if ((cardRoll.rollType == "save" || cardRoll.rollType == "studentSkillCheck") && !(base > 0)) {
			// debugger;
		}
		let modifiers = new ModifierList();
		modifiers.add("Base DC", base);
		if ("modifier" in cardRoll) {
			modifiers.add("Roll Modifier Reversed", cardRoll.modifier * -1);
		}
		modifiers = modifiers.concat(this.getCardModifiers(cardData, rollTags));
		return modifiers;
	}

	private getCardModifiers(cardData: CardData, rollTags: (RollTag | CardTag)[] ) : ModifierList {
		const card = cardData.card;
		const effects : SourcedConditionalEffect[] = [];
		const globalMods = ConditionalEffectManager.getEffects(card.system.globalModifiers, null, null);
		effects.push(...globalMods);
		const universal = PersonaDB.getGlobalModifiers().flatMap(x => x.getEffects(null));
		effects.push(...universal);
		if (cardData.activity instanceof PersonaActor) {
			const link =cardData.activity;
			if (!rollTags.includes("on-cameo") && !rollTags.includes("on-other") && link instanceof PersonaActor) {
				effects.push(...link.socialEffects());
			}
		}
		if (rollTags.includes("on-cameo") && cardData.cameos) {
			const cameoEffects = cardData.cameos.flatMap( x=> x.socialEffects() );
			effects.push(...cameoEffects);
		}
		const retList = new ModifierList();
		retList.addConditionalEffects(effects, "Card Modifier",["DCIncrease"]);
		return retList;
	}

	#getCardEvent(cardData:CardData) : CardEvent | undefined  {
		const cardEventList = cardData.eventList;
		if (cardData.forceEventLabel) {
			const gotoEvent = cardEventList
				.filter( x=> x.label  == cardData.forceEventLabel)
				.filter( x=> !x.eventTags.includes("disabled"))
			;
			cardData.forceEventLabel = null;
			if (gotoEvent.length > 0) {
				const ev= weightedChoice(gotoEvent.map( event => ({
					item: event,
					weight: Number(event.frequency) > 0 ? Number(event.frequency ?? 1) : 1,
				})));
				return ev;
			}
			PersonaError.softFail (`Can't find event label ${cardData.forceEventLabel} on card ${cardData.card.name}`);
		}
		const situation = {
			...cardData.situation,
			rollTags: cardData.extraCardTags
		};
		let eventList = cardEventList
			.filter ( ev => !ev.eventTags.includes("disabled"))
			.filter( (ev) => !cardData.eventsChosen.includes(ev) && testPreconditions(
				ConditionalEffectManager.getConditionals( ev.conditions, null, null, null),
				situation));
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
			weight: Number(event.frequency ?? 1)
		})
		);
		const ev = weightedChoice(eventWeights);
		if (!ev) {return undefined;}
		return ev;
	}

	getCardRollTags (cardRoll: CardRoll) : (RollTag | CardTag)[] {
		return [
			cardRoll.rollTag1,
			cardRoll.rollTag2,
			cardRoll.rollTag3,
		].filter(x=> x);
	}

	addExtraEvent(amount: number) {
		this.cardData.eventsRemaining += amount;
	}

	async processAutoProgress( cardData: CardData, cardRoll: CardRoll, hit: boolean, critical: boolean) : Promise<void> {
		let progress = 0;
		progress += hit ? cardRoll.progressSuccess ?? 0 : 0;
		progress += critical ? cardRoll.progressCrit ?? 0 : 0;
		progress += !hit ? cardRoll.progressFail ?? 0 : 0;
		if (progress != 0) {
			await this.applyCardProgress(cardData, progress);
		}
	}

	async applyCardProgress(cardData: CardData, amount: number) : Promise<void> {
		const actor = cardData.actor;
		switch (cardData.card.system.cardType) {
			case "social":
				return await actor.alterSocialLinkProgress(cardData.linkId, amount);
			case "job":
			case "training":
			case "recovery":
			case "other":
				return await actor.activityProgress(cardData.card.id, amount);
			case "minor":
				ui.notifications.warn("Can't assign cardProgress for Minor Action Cards");
				return;
			case "mixin":
				ui.notifications.warn("Can't assign cardProgress for Add-on Cards");
				return;
			default:
				cardData.card.system.cardType satisfies never;
				return;
		}
	}

	private async markEventUsed(event: CardEvent) {
		let parent = event.parent;
		while (true) {
			if (parent == undefined) {
				PersonaError.softFail("Can't trace parent to card or actor");
				return;
			}
			if (parent instanceof PersonaItem && parent.system.type == "socialCard") {
				await PersonaSocial.markSocialCardEventUsed(parent as SocialCard, event);
				return;
			}
			if (parent instanceof PersonaActor && parent.system.type == "npc") {
				await PersonaSocial.markQuestionUsed(parent as NPC, event);
				return;
			}
			parent = parent.parent;
		}
	}

	private getRollTags(cardData: CardData, cardChoice: SocialCard["system"]["events"][number]["choices"][number]) : (RollTag | CardTag)[] {
		const cardRoll = cardChoice.roll;
		const rollTags = this.getCardRollTags(cardRoll);
		rollTags.pushUnique(...cardData.extraCardTags);
		rollTags.pushUnique(...cardData.card.system.cardTags);
		if (cardData.currentEvent) {
			rollTags.pushUnique(	...cardData.currentEvent.eventTags);
		}
		return rollTags;
	}

	async #onCardChoice(_cardData: CardData , _cardRoll: CardChoice["roll"], _rollTags: (RollTag | CardTag)[]) {

	}

	resolvePrimarySecondarySocialStat(choice: StudentSkillExt, _link: SocialLink | Activity) : StudentSkill {
		switch (choice) {
			case "primary":
			case "secondary":
				PersonaError.softFail("Primary/Secondary no longer accepted, defaulting to 'expression' as skill");
				return "expression";
				// if (link instanceof PersonaActor){
				// 	return link.getSocialStatToRaiseLink(choice);
				// }else {
				// 	return link.system.keyskill[choice];
				// }
			default:
				return choice;
		}
	}

	getBaseSkillThreshold (cardData: CardData) : number {
		return this.getBaseSkillDC(cardData) - 5;
	}

	async #onCardRoll(cardData: CardData, cardRoll: CardChoice["roll"], situation: Situation & RollSituation) {
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
		await this.#onCardChoice(cardData, cardRoll, situation.rollTags);

	}

	async makeCardRoll(eventIndex: number, choiceIndex: number, message: ChatMessage) {
		const cardEvent = this.cardData.eventList[eventIndex];
		if (cardEvent != this.cardData.currentEvent) {
			throw new PersonaError("Event mismatch on card, can't execute makeCardRoll");
		}
		const choice = cardEvent.choices[choiceIndex];
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
		this.owner.activateContinuation(choice);
	}

	forceEvent(evLabel?: string) {
		console.log(`Entering Force Event : ${evLabel}`);
		if (!evLabel) {return;}
		console.log(`Forcing Event : ${evLabel}`);
		this.cardData.forceEventLabel = evLabel;
	}

	public async applyCardResponse(text: string) {
		const cardData = this.cardData;
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
		const html = await foundry.applications.handlebars.renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-response.hbs`, templateData);
		const messageData = {
			speaker: {alias: "Question Response"},
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		await ChatMessage.create( messageData);
	}

	public addCardEvents(cardId: string) {
		if (!cardId) {throw new PersonaError("No card ID given to addCardEvent");}
		const newCard = PersonaDB.allSocialCards().find(x=> x.id == cardId);
		if (!newCard) {
			PersonaError.softFail(`Can't find Social Card id ${cardId} `);
			return;
		}
		this.cardData.eventList.push(...newCard.cardEvents().slice());
	}

	public replaceCardEvents(cardId: string, keepEventChain = false) {
		if (!cardId) {
			PersonaError.softFail("No card ID given to addCardEvent");
			return;
		}
		const newCard = PersonaDB.allSocialCards().find(x=> x.id == cardId);
		if (!newCard) {
			PersonaError.softFail(`Can't find Social Card id ${cardId} `);
			return;
		}
		console.log(`Replacing Card Event list wtih ${newCard.name}`);
		const cardData=  this.cardData;
		if (!keepEventChain) {
			cardData.eventsRemaining = newCard.system.num_of_events;
		}
		cardData.eventsChosen = [];
		cardData.eventList = newCard.cardEvents().slice();
		cardData.extraCardTags = newCard.system.cardTags.slice();
	}

	choiceMeetsConditions(choice: SocialCard["system"]["events"][number]["choices"][number] ) : boolean {
		const conditions = choice.conditions?.slice() ?? [];
		if (choice.resourceCost > 0) {
			conditions.push( {
				type: "numeric",
				comparisonTarget: "has-resources",
				comparator: ">=",
				num: choice.resourceCost,
			});
		}
		const sourced = conditions.map( cond => ({
			...PreconditionConverter.convertDeprecated(cond),
			owner: undefined,
			source: undefined,
			realSource: undefined,
		}));
		return testPreconditions(sourced, this.cardData.situation);
	}

}
