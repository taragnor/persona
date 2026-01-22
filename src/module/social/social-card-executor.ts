import {CardTag} from "../../config/card-tags.js";
import {HBS_TEMPLATES_DIR, PersonaSettings} from "../../config/persona-settings.js";
import {RollTag} from "../../config/roll-tags.js";
import {SocialCardSituation} from "../../config/situation.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {ConditionalEffectManager} from "../conditional-effect-manager.js";
import {EnchantedTreasureFormat, TreasureSystem} from "../exploration/treasure-system.js";
import {PersonaItem} from "../item/persona-item.js";
import {PersonaSockets} from "../persona.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {testPreconditions} from "../preconditions.js";
import {randomSelect} from "../utility/array-tools.js";
import { SocialCardEventHandler} from "./card-event-handler.js";
import {PersonaSocial} from "./persona-social.js";
import {ItemSelector} from "../../config/consequence-types.js";

export class SocialCardExecutor {
	_handler : U<SocialCardEventHandler>;
	sound: FOUNDRY.AUDIO.Sound | null = null;

	mainActor: PC;
	activity: SocialLink | Activity;
	_abort: boolean = false;

	private rollState: RollState;

	get abort() {
		return this._abort;
	}

	get handler() {
		if (this.abort) {
			throw new PersonaError("Card execution has aborted this shouldn't get called");
		}
		if (!this._handler) {
			PersonaError.softFail("No handler found for SocialCardExecutor", this);
		}
		return this._handler;

	}

	_nullContinuation(this: void) {
		PersonaError.softFail("Continuation was called in error because there is no active continatuion");
	}

	constructor(actor: PC, activity: SocialLink | Activity) {
		this.mainActor = actor;
		this.activity = activity;
		this.sound = null;
	}

	activateContinuation(x: unknown) {
		if (this.abort) {
			throw new PersonaError("Card execution has aborted this shouldn't get called");
		}
		this.rollState.continuation(x);
	}

	get link() : ActivityLink | SocialLinkData  {
		return this.lookupLink();
	}

	setContinuation(promiseResolvefn: (...args : unknown[]) => void ){
		if (this.rollState == null) {
			throw new PersonaError("No roll state, can't set confirmation");
		}
		this.rollState.continuation = promiseResolvefn;
	}



	get cardData() : CardData{
		if (this.abort) {
			throw new PersonaError("Card execution has aborted this shouldn't get called");
		}
		if (!this.rollState) {
			throw new PersonaError("Card state is missing from event Executor");
		}
		return this.rollState.cardData;
	}

	async generateCardData() :Promise<CardData> {
		const actor = this.mainActor, activity= this.activity;
		const replaceSet : Record<string, string> = {};
		if (activity instanceof PersonaActor) {
			const link = PersonaSocial.lookupSocialLink(actor, activity.id);
			replaceSet["$TARGET"] = link.actor.name;
		}
		const card = await this.#drawSocialCard(actor, activity);
		const cameos = this.#getCameos(card, actor, activity.id);
		const perk = this.#getPerk(card, actor, activity, cameos);
		const cameo = cameos.length > 0 ? cameos[0].accessor : undefined;
		const situation : CardData["situation"] = {
			user: actor.accessor,
			socialTarget: activity instanceof PersonaActor ?  activity.accessor: undefined,
			attacker: actor.accessor,
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
			const questionsAsEvents= SocialCardEventHandler.questionsAsEvents(activity);
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
			extraCardTags: [],
			currentEvent: null,
			item: undefined,
		};
		return cardData;
	}

	async exec() : Promise<ChatMessage[]> {
		const continuation = this._nullContinuation;
		const cardData= await this.generateCardData();
		this.rollState = {
			cardData,
			continuation,
		};
		return await this.#execCardSequence();
	}

	async #execCardSequence(): Promise<ChatMessage[]> {
		const cardData= this.cardData;
		const chatMessages: ChatMessage[] = [];
		this._handler = new SocialCardEventHandler(this);
		await this.#printCardIntro(cardData);
		this.rollState = {
			continuation: () => {},
			cardData
		};
		const effectList = ConditionalEffectManager.getEffects(cardData.card.system.immediateEffects ?? [], null, null);
		await PersonaSocial.applyEffects(effectList, cardData.situation, cardData.actor);
		const msgs = await this.handler!.cardEventLoop();
		chatMessages.push(...msgs);
		if (this.abort) { return chatMessages;}
		const opp = await this.#execOpportunity(cardData);
		if (opp) {
			chatMessages.push(opp as ChatMessage);
		}
		const finale = await this.#printCardFinale(cardData);
		chatMessages.push(finale);
		this.stopCardExecution();
		return chatMessages;
	}

	async #execOpportunity(cardData: CardData) {
		const card = cardData.card;
		if (!card.system.opportunity
			&& !card.system.opportunity_choices)
		{return;}
		const html = await foundry.applications.handlebars.renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-opportunity.hbs`, {item: card,card,cardData} );
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		return await ChatMessage.create(msgData,{} );
	}

	async #printCardIntro(cardData: CardData) {
		const {card, cameos, perk, actor } = cardData;
		const link = this.link;
		const DC = this.handler?.getBaseSkillDC(cardData) ?? -999;
		const linkId =  "actor" in link ? link.actor.id : link.activity.id;
		const { perkDisabled } = card.system;
		const isCameo = card.system.cameoType != "none";
		const html = await foundry.applications.handlebars.renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-intro.hbs`, {item: card,card, cameos, perk, perkDisabled, link: link, linkId, pc: actor, isCameo, user: game.user, DC} );
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		return await ChatMessage.create(msgData,{} );
	}

	async #printCardFinale( cardData: CardData) : Promise<ChatMessage<Roll>> {
		let html = "";
		let SLImproveSpend = "";
		let giftStr= "";
		if (cardData.card.system.cardType == "social") {
			const link = this.lookupLink() as SocialLinkData;
			if (link.actor) {
				const SL=  (cardData.actor.getSocialSLWith(link.actor));
				let improveAmt = 5;
				if (SL <= 3 && cardData.actor?.tarot?.name == "Fool") {
					improveAmt -= 2;
				}
				SLImproveSpend = `<li class="token-spend"> spend ${improveAmt} progress tokens to raise link with ${link.actor.name}</li>`;
			}
			giftStr += `You may give a gift to anyone in the scene (max 1 gift per person). `;
			const SLCameos = cardData.cameos.filter(cameo => cardData.actor.getSocialSLWith(cameo) >= 4);
			if (SLCameos.length > 0) {
				giftStr += `However since there are multiple people in the scene...  ${SLCameos.map(x=> x.name).join(", ")}. Anyone who doesn't get a gift will lose a progress token if they are SL 4+ or higher. `;
			}
		}
		const tokenSpends = (cardData.card.system.tokenSpends ?? [])
		.concat(cardData.activity != cardData.card ?  cardData.activity.system.tokenSpends ?? [] : [])
		.filter( spend => {
			const conds = ConditionalEffectManager.getConditionals(spend.conditions, null, null, null);
			return testPreconditions(conds ?? [], cardData.situation);
		})
		.map(x=> `spend ${x.amount} progress tokens to ${x.text}.`)
		.map(x=> `<li class="token-spend"> ${x} </li>`);
		const finale =`
		<h2> Finale </h2>
		<div class="gift">
		${giftStr}
		</div>
		<span class="finale">
		${cardData.card.system.finale.trim()}
		</span>
		`;
		html += finale;
		if (tokenSpends.length + SLImproveSpend.length > 0) {
			html += `<div class="token-spends">
		<h3>Token Spends:</h3>
		<ul>
		${SLImproveSpend}
		${tokenSpends.join("")}
		</ul>
		</div>
		`;
		}
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		const msg = await ChatMessage.create(msgData,{} );
		return msg;
	}

	static validSocialCards(actor: PC, activity: SocialLink) : SocialEncounterCard[] {
		const link = PersonaSocial.lookupSocialLink(actor, activity.id);
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
			.filter( card => testPreconditions(card.cardConditionsToSelect(), situation));
		if (PersonaSettings.debugMode() == true) {
			console.log(`Valid Cards: ${preconditionPass.map(x=> x.name).join(", ")}`);
		}
		// if (preconditionPass.length == 0) { }
		return preconditionPass;
	}

	async #drawSocialCard(actor: PC, link : Activity | SocialLink) : Promise<SocialCard> {
		if (!game.user.isGM)
		{return await PersonaSocial.sendGMCardRequest(actor, link);}
		return PersonaSocial._drawSocialCard(actor, link);
	}

	static socialLinkIsMetaverseBased(link: SocialLink) : boolean {
		return link.hasCreatureTag("stuck-in-metaverse");
	}

	#getCameos(card: SocialCard, actor: PC, linkId: string) : SocialLink[] {
		let targets : (SocialLink)[] = [];
		const testCameo = (cameo: SocialLink) => {
			if (cameo.id == actor.id) {return false;}
			if (cameo.id == linkId) {return false;}
			const acc = cameo.accessor;
			if (!cameo.isSociallyDisabled()) {return false;}
			// if (!cameo.isAvailable(actor)) {return false;}
			if (cameo.hasCreatureTag("stuck-in-metaverse")) {return false;}
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
			if (PersonaSocial.cameoDisqualifierStatuses.some( st => cameo.hasStatus(st))) { return false;}
			const sourcedConditions = ConditionalEffectManager.getConditionals(card.system.cameoConditions, null, null, null);
			return testPreconditions(sourcedConditions, situation);
		};
		const allCameos = PersonaDB.socialLinks().
			filter (link => testCameo(link));
		switch (card.system.cameoType) {
			case "none": return [];
			case "any-pc": {
				targets = allCameos.filter(
					x=> testCameo(x) && x.isPC()
				);
				break;
			}
			case "above": {
				const initChar = PersonaSocial.getCharInInitiativeList(-1);
				if (initChar) {
					targets.push(initChar);
				}
				targets = targets.filter( x=> testCameo(x));
				break;
			}
			case "below": {
				const initChar = PersonaSocial.getCharInInitiativeList(1);
				if (initChar) {
					targets.push(initChar);
				}
				targets = targets.filter( x=> testCameo(x));
				break;
			}
			case "above+below": {
				const initChar1 = PersonaSocial.getCharInInitiativeList(1);
				const initChar2 = PersonaSocial.getCharInInitiativeList(-1);
				if (initChar1) { targets.push(initChar1);}
				if (initChar2) {targets.push(initChar2);}
				targets = targets.filter( x=> testCameo(x));
				break;
			}
			case "student": {
				const students = allCameos
				.filter( x=> x.hasCreatureTag("student"));
				if (students.length == 0) {return [];}
				const randomPick = students[Math.floor(Math.random() * students.length)];
				if (!randomPick)
				{throw new PersonaError("Random student select failed");}
				return [randomPick];
			}
			case "any": {
				const anyLink = allCameos;
				if (allCameos.length == 0) {return [];}
				const randomPick = anyLink[Math.floor(Math.random() * anyLink.length)];
				if (!randomPick)
				{throw new PersonaError("Random any link select failed");}
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
				if (otherDates.length ==0) {return [];}
				return [randomSelect(otherDates)];
			}
			default:
				card.system.cameoType satisfies never;
		}
		return targets.filter( x=> x != undefined
			&& x != actor
			&& x.id != linkId);
	}


	private lookupLink(): ActivityLink | SocialLinkData {
		const cardData =this.cardData;
		switch (cardData.card.system.cardType) {
			case "social":
				return PersonaSocial.lookupSocialLink(cardData.actor, cardData.linkId);
			default:
				return PersonaSocial.lookupActivity(cardData.actor, cardData.linkId);
		}

	}

	#getPerk(card: SocialCard,actor: PC, link: Activity | SocialLink, cameos: SocialLink[]) {
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
			case "standard-or-date": {
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
			}
			case "none":
				return "";
			default:
				card.system.perkType satisfies never;
				return "";
		}
	}

	stopCardExecution() {
		if (this.sound) {this.sound.stop();}
		this.sound = null;
		this._abort = true;
		// this.cardDrawPromise= null;
	}

	defaultDatePerk() : string {
		return "Gain 2 social progress tokens with the target character";
	}

	setSocialVariable(varId: string, value: number) {
		if (PersonaSettings.debugMode()) {
			const msg =`Setting social var ${varId} to ${value}`;
			ui.notifications.notify(msg);
			console.log(msg);
		}
		const varData = this.cardData.variables;
		varData[varId] = value;
	}

	public setSocialCardItem(selector: ItemSelector){
		const cardData = this.cardData;
		const item = PersonaItem.resolveItemSelector(selector, cardData.situation);
		cardData.item = item.at(0);
		if (cardData.item) {
			cardData.item.costMult = selector.costMult ?? 1;
		}
		cardData.situation.cardEventItem = cardData.item;
		cardData.replaceSet["$ITEM"] = cardData.item ? TreasureSystem.printEnchantedTreasureString(cardData.item): `No Item` ;
		cardData.replaceSet["$ITEMCOST"] = cardData.item ? String(TreasureSystem.getValueOf(cardData.item)): `No Item` ;
		if (!cardData.item) {
			PersonaError.softFail("Unable to find item to select for set card item", selector, cardData.situation);
		}
		// Debug(cardData.item);
	}

	getSocailVariable(varId: string) {
		return this.cardData.variables[varId] ?? 0;
	}

} //end of class

export type CardData = {
	card: SocialCard,
	actor: PC,
	linkId: string,
	activity: Activity | SocialLink,
	cameos: SocialLink[],
	perk: string,
	forceEventChain ?: {
		chainLabel: string,
		chainCount: number,
	};
	forceEventLabel: null | string,
	eventList: SocialCard["system"]["events"];
	eventsChosen: SocialCard["system"]["events"][number][];
	eventsRemaining: number,
	currentEvent: SocialCard["system"]["events"][number] | null;
	situation: Situation & SocialCardSituation;
	replaceSet: Record<string, string>;
	sound?: FOUNDRY.AUDIO.Sound
	variables: Record<string, number>;
	extraCardTags: (CardTag | RollTag | Tag)[];
	item : U<EnchantedTreasureFormat>;

};

export type SocialEncounterCard = SocialCard & {system: {cardType: "social"}};

type RollState = {
	continuation: ((...args: unknown[]) => void);
	cardData: CardData;
};


Hooks.on("socketsReady", () => {
	console.log("Sockets set handler");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	PersonaSockets.setHandler("DRAW_CARD", PersonaSocial.answerCardRequest.bind(PersonaSocial));
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	PersonaSockets.setHandler("CARD_REPLY", PersonaSocial.getCardReply.bind(PersonaSocial));
});
