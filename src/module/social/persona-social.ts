import { testPreconditions } from "../preconditions.js";
import { CardEvent } from "../../config/social-card-config.js";
import { STUDENT_SKILLS_LIST } from "../../config/student-skills.js";
import { PersonaSockets } from "../persona.js";
import { SocialLinkData } from "../actor/persona-actor.js";
import { TarotCard } from "../../config/tarot.js";
import { PersonaCombat } from "../combat/persona-combat.js";
import { CombatResult } from "../combat/combat-result.js";
import { NonCombatTrigger } from "../../config/triggers.js";
import { SocialLink } from "../actor/persona-actor.js";
import { Job } from "../item/persona-item.js";
import { PersonaItem } from "../item/persona-item.js";
import { NPC } from "../actor/persona-actor.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../config/persona-settings.js";
import { SocialCard } from "../item/persona-item.js";
import { PersonaSounds } from "../persona-sounds.js";
import { Logger } from "../utility/logger.js";
import { PersonaError } from "../persona-error.js";
import { PC } from "../actor/persona-actor.js";
import { SocialStat } from "../../config/student-skills.js";
import { ModifierList } from "../combat/modifier-list.js";
import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { Situation } from "../preconditions.js";
import { RollBundle } from "../persona-roll.js";
import { PersonaDB } from "../persona-db.js";
import { HTMLTools } from "../utility/HTMLTools.js";

export class PersonaSocial {

	static #drawnCardIds: string[] = [];
	static continuation: null | ((...args: any) => void) = null;


	static async rollSocialStat( pc: PC, socialStat: SocialStat, extraModifiers?: ModifierList, altName ?: string, situation?: Situation) : Promise<RollBundle> {
		let mods = pc.getSocialStat(socialStat);
		let socialmods = pc.getBonuses("socialRoll");
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
		};
		const r = await new Roll("1d20").roll();
		const dice = new RollBundle(rollName, r,  mods, sit);
		return dice;
	}

	static async boostSocialSkill(pc: PC, socialStat: SocialStat) {
		const amount = await HTMLTools.numberButtons("Amount", 1, 3) as 1 | 2| 3;
		await pc.raiseSocialSkill(socialStat, amount);
		await PersonaSounds.skillBoost(amount);
		await Logger.sendToChat(`<b>${pc.name}:</b> Raised ${socialStat} by ${amount}`, pc);
	}

	static async makeUpgradeLinkRoll(actor: PC, linkId: string) {
		const link = actor.socialLinks.find(link => link.actor.id == linkId);
		if (!link) throw new PersonaError(`Couldn't find link to ${linkId}`);
		if (link.actor == actor) {
			ui.notifications.notify("Can't make a roll against yourself");
			return;
		}
		const statChoice : "primary" | "secondary" | SocialStat = await this.getPrimarySecondary();
		let socialStat: SocialStat;
		switch (statChoice) {
			case "primary":
			case "secondary":
				socialStat = link.actor.getSocialStatToRaiseLink(statChoice);
				break;
			default:
				socialStat = statChoice;
				break;
		}
		const situation: Situation  = {
			user: actor.accessor,
			usedSkill: socialStat,
			socialTarget: link.actor.accessor,
			isSocial: true,
		};
		const progressTokens = link.currentProgress;
		let mods = new ModifierList();
		const DC = 10 + 3 * link.linkLevel;
		mods.add("Progress Tokens", 3 * progressTokens)
		const availabilityMod = this.getAvailModifier(link.actor.system.availability);
		mods = mods.concat(availabilityMod);
		const rollName= `${link.actor.name} --> Social Roll (${socialStat}) vs DC ${DC}`;
		const roll =await this.rollSocialStat(actor, socialStat, mods, rollName, situation);
		await roll.toModifiedMessage();
		situation.hit = roll.total >= DC ;
		situation.criticalHit = roll.total >= DC + 10;
		await this.degradeActivity(link.actor);
	}


	static async getPrimarySecondary(defaultChoice: "primary" | "secondary" | SocialStat = "primary") :Promise<"primary" | "secondary" | SocialStat> {
		const skillList = foundry.utils.mergeObject(
			{
				"primary":		"persona.term.primary",
				"secondary":"persona.term.secondary"
			} ,
			STUDENT_SKILLS);
			const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/dialogs/social-skill-selector.hbs`, {skillList, defaultChoice} );
		return await new Promise( (conf, reject) => {
			const dialog = new Dialog({
				title: `Prompt`,
				content: html,
				render: async (html: string) => {
					$(html).find(".numInput").focus();
				},
				buttons: {
					one: {
						icon: `<i class="fas fa-check"></i>`,
						label: "Confirm",
						callback: (htm: string) => {
							// const value =$('select[name="PorS"]:checked').val() as "primary" | "secondary" | undefined;
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

	static validSocialCards(actor: PC, linkId?: string) : SocialCard[] {
		const link = actor.socialLinks.find(link => link.actor.id == linkId);
		const situation : Situation= {
			user: actor.accessor,
			attacker: actor.accessor,
			socialTarget: link? link.actor.accessor : undefined,
			isSocial: true,
		};
		const preconditionPass=  PersonaDB.allSocialCards()
			.filter( card => testPreconditions(card.system.conditions, situation, null));
		if (!link) return preconditionPass;
		else return  preconditionPass
			.filter( item => {
				const relationshipName : string = link.relationshipType;
				return item.system.qualifiers
					.some(x=> x.relationshipName == relationshipName
						&& link.linkLevel >= x.min
						&& link.linkLevel <= x.max
					)
			});
	}

	static #drawSocialCard(actor: PC, linkId : string) : SocialCard {
		const link = actor.socialLinks.find(link => link.actor.id == linkId);
		if (!link) throw new PersonaError(`Can't find link ${linkId}`);
		const cards = this.validSocialCards(actor, linkId);

		let undrawn = cards.filter( card=> !this.#drawnCardIds.includes(card.id));

		if (undrawn.length < 4) {
			undrawn = cards;
			this.#drawnCardIds = this.#drawnCardIds
				.filter(cardId=> !cards.find(card => card.id == cardId));
		}
		const draw  = Math.floor(Math.random() * undrawn.length) ;
		const chosenCard =  undrawn[draw];
		if (!chosenCard) throw new PersonaError("Can't find valid social card!");
		this.#drawnCardIds.push(chosenCard.id);
		return chosenCard;
	}

	static async drawSocialCard(actor: PC, linkId: string) : Promise<ChatMessage[]> {
		const link = this.lookupLinkId(actor, linkId);
		if (link.actor.isSpecialEvent(link.linkLevel+1)) {
			//TODO: Finish later

		}
		const card = this.#drawSocialCard(actor, linkId);
		const cameos = this.#getCameos(card, actor, linkId);
		const perk = this.#getPerk(card, actor, linkId, cameos);
		const situation : Situation = {
			user: actor.accessor,
			socialTarget: link.actor.accessor,
			attacker: actor.accessor,
			isSocial: true,
		};
		const cardData : CardData = {
			card,
			actor,
			linkId,
			cameos,
			perk,
			eventsChosen: [],
			eventsRemaining : card.system.num_of_events,
			situation
		};
		return await this.#execCardSequence(cardData);

		// return await this.#printSocialCard(card, actor, linkId, cameos, perk);
	}


	static lookupLinkId(actor: PC, linkId: string) :SocialLinkData {
		const link= actor.socialLinks.find(link => link.actor.id == linkId);
		if (!link)
			throw new PersonaError(`Can't find link ${linkId}`);
		return link;
	}

	static #getCameos(card: SocialCard, actor: PC, linkId: string) : SocialLink[] {
		let targets : (undefined | SocialLink)[] = [];
		switch (card.system.cameoType) {
			case "none": return [];
			case "above":
				targets.push(this.getCharInInitiativeList(-1));
				break;
			case "below":
				targets.push(this.getCharInInitiativeList(1));
				break;
			case "above+below":
				targets.push(this.getCharInInitiativeList(-1));
				targets.push(this.getCharInInitiativeList(1));
				break;
			case "student": {
				const students = (game.actors.contents as PersonaActor[])
					.filter( x=>
						(x.system.type == "npc" || x.system.type == "pc")
						&& x.baseRelationship == "PEER"
						&& x != actor && x.id != linkId
						&& x.system.availability != "N/A"
					) as SocialLink[];
				const randomPick = students[Math.floor(Math.random() * students.length)];
				if (!randomPick)
					throw new PersonaError("Random student select failed");
				return [randomPick];
			}
			case "any": {
				const anyLink = (game.actors.contents as PersonaActor[])
					.filter( x=>
						(x.system.type == "npc" || x.system.type == "pc")
						&& x.baseRelationship != "SHADOW"
						&& x != actor && x.id != linkId
						&& x.system.availability != "N/A"
					) as SocialLink[];
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
			default:
				card.system.cameoType satisfies never;
		}
		return targets.filter( x=> x != undefined 
			&& x != actor
			&& x.id != linkId) as SocialLink[];
	}

	static #getPerk(card: SocialCard,actor: PC, linkId: string, cameos: SocialLink[]) {
		const linkdata = this.lookupLinkId(actor, linkId);
		switch (card.system.perkType) {
			case "standard":
				return linkdata.actor.perk;
			case "standard-or-cameo":
				return "Choose One: <br>" +
					cameos.concat([linkdata.actor])
				.map( x=> `* ${x.perk}`)
				.join("<br>");
			case "custom-only":
				return card.system.perk;
			case "standard-or-custom":
				return "Choose One: <br>" +
					[linkdata.actor.perk, card.system.perk]
				.map( x=> `* ${x}`)
				.join("<br>");
			case "standard-or-date":
				const link = linkdata.actor;
				let datePerk : string;
				switch (link.system.type) {
					case "pc":
						datePerk = this.defaultDatePerk();
						break;
					case "npc":
						datePerk = link.system.datePerk || this.defaultDatePerk();
						break;
				}
				return "Choose One: <br>" +
					[actor.perk, datePerk]
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
		const final = await this.#finalizeCard(cardData);
		chatMessages.push(final);
		return chatMessages;
	}

	static async #execOpportunity(cardData: CardData) {
		const card = cardData.card;
		if (card.system.opportunity.trim() == ""
			&& card.system.opportunity_choices == 0)
			return;
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-opportunity.hbs`, {item: card,card,cardData} );
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		return await ChatMessage.create(msgData,{} );
	}

	static #getCardEvent(cardData:CardData) : CardEvent | undefined  {
		const eventList = cardData.card.system.events
		.filter( (_ev, i) => !cardData.eventsChosen.includes(i));
		if (eventList.length == 0)
			return undefined;
		const index =  Math.floor(Math.random() * eventList.length);
		const ev = eventList[index];
		cardData.eventsChosen.push(cardData.card.system.events.indexOf(ev));
		return ev;
	}

	static async #printCardIntro(cardData: CardData) {
		const {card, cameos, perk, actor } = cardData;
		const link = this.lookupLinkId(actor, cardData.linkId);
		const isCameo = card.system.cameoType != "none";
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-intro.hbs`, {item: card,card, cameos, perk, link: link, pc: actor, isCameo, user: game.user} );
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		return await ChatMessage.create(msgData,{} );
	}

	static async #execEvent(event: CardEvent, cardData: CardData) {
		const eventNumber = cardData.eventsChosen.length;
		const link = this.lookupLinkId(cardData.actor, cardData.linkId);
		const eventIndex = cardData.card.system.events.indexOf(event);
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-event.hbs`,{event,eventNumber, cardData, situation : cardData.situation, eventIndex});
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		const msg= await ChatMessage.create(msgData,{} );
		await new Promise( (conf, ref) => {
			this.continuation=conf;
		});
		return msg;
	}

	static async #finalizeCard( cardData: CardData) : Promise<ChatMessage<Roll>> {
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-final.hbs`,{cardData, situation : cardData.situation});
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		const msg= await ChatMessage.create(msgData,{} );
		return msg;
	}

	static async #printSocialCard(card: SocialCard, actor: PC, linkId: string, cameos: SocialLink[], perk:string ) : Promise<ChatMessage> {
		const link = this.lookupLinkId(actor, linkId);
		const DC = 10 + link.linkLevel *3;
		const perkAvail = link.actor.system.availability == "++" || link.actor.system.availability == "+";
		const isCameo = card.system.cameoType != "none";
		const skill = STUDENT_SKILLS[link.actor.getSocialStatToRaiseLink(card.system.skill)];

		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/social-card.hbs`, {item: card,card,  skill, cameos, perk, link: link, pc: actor, perkAvail, isCameo, DC, user: game.user} );

		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		return await ChatMessage.create(msgData,{} );
	}

	static async rerollAvailability() {
		let rolls : Roll[] = [];
		let html = "";
		const links = (game.actors.contents as PersonaActor[])
			.filter( x=> (x.system.type == "pc" || x.system.type == "npc" ) && x.system.availability != "N/A" && x.tarot);
		for (const social of links) {
			const [newavail, roll] = await this.#rollAvailability();
			await (social as PC | NPC).update({"system.availability": newavail});
			rolls.push(roll);
			html += `<div> ${social.name} : ${newavail} </div>`;
		}
		const jobs = (game.items.contents as PersonaItem[])
		.filter( item => item.system.type =="job"
			&& item.system.availability != "N/A" 
			&& item.system.active
		) as Job[];
		for (const job of jobs) {
			const [newavail, roll] = await this.#rollAvailability();
			await job.update({"system.availability": newavail});
			rolls.push(roll);
			html += `<div> ${job.name} : ${newavail} </div>`;
		}

		return await ChatMessage.create( {
			speaker: {
				alias: "Social System"
			},
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC,
			rolls: rolls,
		}, {});
	}

	static async #rollAvailability() : Promise<[availability: PC["system"]["availability"], roll: Roll]> {
		const roll = new Roll("1d6");
		await roll.roll();
		let newavail : PC["system"]["availability"];
		switch (roll.total) {
			case 1:
				newavail = "--";
				break;
			case 2:
			case 3:
				newavail = "-";
				break;
			case 4:
			case 5:
				newavail = "+";
				break;
			case 6:
				newavail = "++";
				break;
			default: throw new PersonaError(`Somehow a d6 got a value of ${roll.total}`);
		}
		return [newavail, roll];
	}

	static async chooseActivity(actor: PC, activity: SocialLink | Job, options: ActivityOptions = {}) {
		if (activity instanceof PersonaItem) {
			await this.#doJob(actor, activity, options);
		} else {
			await this.#socialEncounter(actor, activity);
		}
	}

	static async degradeActivity( activity: SocialLink | Job) {
		if (game.user.isGM) {
			const availability = activity.system.availability;
			await activity.update(
				{"system.availability": this.#degradedAvailability(availability) });
			console.log(`Degraded Activity: ${activity.name}`);
		} else {
			PersonaSockets.simpleSend("DEC_AVAILABILITY", activity.id, game.users.filter( x=> x.isGM && x.active).map( x=>x.id))
		}

	}


	static getAvailModifier (avail: NPC["system"]["availability"]) : ModifierList {
		const modifiers = new ModifierList();
		switch (avail) {
			case "++":
				modifiers.add("Favorable", 5);
				break;
			case "+":
				break;
			case "-":
				break;
			case "--":
				modifiers.add("Negative Availabilty", -5);
				break;
			default:
		}
		return modifiers;
	}

	static async #socialEncounter(actor: PC, activity: SocialLink) {
		await this.drawSocialCard(actor, activity.id);
	}


	static async #doJob(actor: PC,  activity :Job, options: ActivityOptions) {
		const roll = new Roll("1d6");
		await roll.roll();
		const stat =  (roll.total > 2) ? "primary": "secondary";
		const skill = activity.system.keyskill[stat];
		const situation : Situation = {
			user: actor.accessor,
			isSocial: true,
			socialId: activity.id
		};
		const avail = activity.system.availability;
		const modifiers = this.getAvailModifier(avail);
		let html = "";
		html += `<h2>${activity.name} (${activity.system.availability})</h2>`
		html += `<img src='${activity.img}'>`;
		const rollTitle = `${activity.name} roll (DC ${activity.system.dc}, ${stat} --- ${skill}) `
		const socialRoll = await this.rollSocialStat(actor, skill, modifiers, rollTitle,situation);
		html += await socialRoll.getHTML();
		// await socialRoll.toModifiedMessage();
		switch (avail) {
			case "++":
				html += `<div><b> Perk: </b> ${activity.system.perk}</div>`;
				break;
			case "+":
				html += `<div><b> Perk: </b> ${activity.system.perk}</div>`;
				break;
			case "-":
				break;
			case "--":
				break;
			default:
		}
		let pay = 0;
		if (socialRoll.total >= activity.system.dc) {
			pay = activity.system.pay.high;
		} else {
			pay = activity.system.pay.low;
		}
		const payBonus = actor.getBonuses("pay").total(situation);
		if (pay + payBonus > 0) {
			html += `<div> <b>Pay (auto-added):</b> ${pay} ${payBonus ? `+ ${payBonus}` : ""}`;
			await actor.gainMoney(pay + payBonus);
			await PersonaSounds.ching();
		}
		if (socialRoll.total >= activity.system.dc + 10 && activity.system.critical) {
			html += `<div> <b>Critical:</b> ${activity.system.critical}</div>`;
		}
		if (activity.system.bane) {
			html += `<div> <b>Bane:</b> ${activity.system.bane}</div>`;

		}
		const speaker = ChatMessage.getSpeaker();
		if (!options.noDegrade) {
			await this.degradeActivity(activity);
		}
		return await ChatMessage.create( {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.ROLL,
			rolls: [roll, socialRoll.roll]
		}, {});


	}

	static #degradedAvailability (availability: Job["system"]["availability"]) {
		switch (availability) {
			case "++":
				return "+";
			case "+":
				return "-";
			case "-":
				return "--";
			case "--":
				return "--";
			case "N/A":
				return "N/A";
		}
	}

	static drawnCards() : string[] {
		//NOTE: Only a debug function
		return this.#drawnCardIds;
	}

	static async execTrigger( trigger: NonCombatTrigger, actor: PC, situation ?: Situation, msg = "Triggered Effect") {
		await this.onTrigger(trigger, actor, situation)
			.emptyCheck()
			?.toMessage(msg, actor);

	}
	static onTrigger(trigger: NonCombatTrigger, actor: PC, situation ?: Situation) : CombatResult {
		const result = new CombatResult();
		if (!situation) {
			situation = {
				user: actor.accessor,
			}
		}
		situation = {
				...situation,
				trigger
			} ; //copy the object so it doesn't permanently change it
		for (const trig of actor.triggers) {
			for (const eff of trig.getEffects()) {
				if (!eff.conditions.every( cond =>
					ModifierList.testPrecondition(cond, situation, trig)
				)) { continue; }
				const cons = PersonaCombat.ProcessConsequences(trig, situation, eff.consequences, actor)
				for (const c of cons.consequences) {
					result.addEffect(null, actor, c.cons);
				}
			}
		}

		return result;
	}

	static async awardPerk(target: PC, socialLink: SocialLink) {
		const situation : Situation = {
			user: target.accessor,
			tarot: socialLink.tarot?.name as TarotCard,
			target: target.accessor
		}
		console.log(situation);
		await this.execTrigger("on-attain-tarot-perk", target, situation, `Gains Perk (${socialLink.tarot?.name})`) ;
	}

	static async execSocialCard(event: JQuery.ClickEvent) {
		console.log("Exec social card");
		const linkActorId = HTMLTools.getClosestData(event, "linkActorId");
		const userId = HTMLTools.getClosestData(event, "userId");
		const PCId = HTMLTools.getClosestData(event, "pcId");
		if (userId != game.user.id) {
			ui.notifications.notify(`Can't execute, user Id's not match`);
			return;
		}
		const pc = game.actors.get(PCId);
		if (!pc || pc.system.type != "pc") {
			ui.notifications.notify(`Can't find PC id ${PCId}`);
			return;
		}
		await this.makeUpgradeLinkRoll(pc as PC, linkActorId)
		const socialLink = game.actors.get(linkActorId);
		if (!socialLink) {
			ui.notifications.notify(`Can't find SL id ${linkActorId}`);
			return;
		}
	}

	static async makeCardRoll(ev: JQuery.ClickEvent) {
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
		const cardEvent = card.system.events[eventIndex];
		const choice= cardEvent.choices[choiceIndex];
		const roll = choice.roll;
		switch (roll.rollType) {
			case "none":
			case "gmspecial":
				break;
			case "studentSkillCheck":
				throw new PersonaError("Not yet implemented");
				//TODO: write this
				break;
			case "save":
				throw new PersonaError("Not yet implemented");
				//TODO: write this
				break;
			default:
				roll satisfies never;
		}
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
		if (!this.continuation) {
			throw new PersonaError("No roll is currently ongoing, can't execute");
		}
		this.continuation();
	}

} //end of class

type ActivityOptions = {
	noDegrade ?: boolean;

}

declare global {
	interface SocketMessage {
		"DEC_AVAILABILITY": string,
	}
}

Hooks.on("socketsReady" , () => {PersonaSockets.setHandler("DEC_AVAILABILITY", ( task_id: string) => {
	if (!game.user.isGM) return;
	const link = game.actors.find(x=> x.id == task_id);
	if (link) {
		PersonaSocial.degradeActivity(link as SocialLink);
		return;
	}
	const job = PersonaDB.allJobs().find( x=> x.id == task_id);
	if (job){
		PersonaSocial.degradeActivity(job);
		return;
	}
	throw new PersonaError(`Can't find Task ${task_id} to decremetn availability`);

});
});

//@ts-ignore
window.PersonaSocial = PersonaSocial

Hooks.on("updateActor", async (_actor: PersonaActor, changes) => {
	if ((changes as any)?.system?.availability) {
		(game.actors.contents as PersonaActor[])
			.filter(x=> x.system.type =="pc"
			&& x.sheet._state > 0)
		.forEach(x=> x.sheet.render(true));
	}
});

Hooks.on("updateItem", async (_item: PersonaItem, changes) => {
	if ((changes as any)?.system?.availability) {
		(game.actors.contents as PersonaActor[])
			.filter(x=> x.system.type =="pc"
			&& x.sheet._state > 0)
		.forEach(x=> x.sheet.render(true));
	}
});

Hooks.on("renderChatMessage", async (message: ChatMessage, html: JQuery ) => {
	if ((message?.author ?? message?.user) == game.user) {
		html.find("button.social-roll").on ("click", PersonaSocial.execSocialCard.bind(PersonaSocial));
		html.find(".social-card-roll .make-roll").on("click", PersonaSocial.makeCardRoll.bind(PersonaSocial));
		html.find(".social-card-roll .next").on("click", PersonaSocial.makeCardRoll.bind(PersonaSocial));
	}
});


export type CardData = {
	card: SocialCard,
	actor: PC,
	linkId: string,
	cameos: SocialLink[],
	perk: string,
	eventsChosen: number[],
	eventsRemaining: number,
	situation: Situation
};


