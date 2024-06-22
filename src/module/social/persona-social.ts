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
import { StudentSkillExt } from "../../config/student-skills.js";

export class PersonaSocial {

	static #drawnCardIds: string[] = [];
	static rollState: null |
		{
			continuation: ((...args: any) => void);
			cardData: CardData;
		};


	static async advanceCalendar() {
		if (!(await HTMLTools.confirmBox( "Advance Date", "Advnace Date?", true)))
			return;
		await PersonaCalendar.nextDay();

	}

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
		const socialStat = this.resolvePrimarySecondarySocialStat(statChoice, link.actor);
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

	static resolvePrimarySecondarySocialStat(choice: StudentSkillExt, link: SocialLink | Job) : StudentSkill {
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

	static validSocialCards(actor: PC, activity: Activity | SocialLink) : SocialCard[] {
		if (activity instanceof PersonaItem) {
			return PersonaDB.allSocialCards()
				.filter(card=> card.system.qualifiers
					.some(x=> x.relationshipName == activity.system.baseRelationship)
				);
		}
		const link = this.lookupSocialLink(actor, activity.id)
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

	static #drawSocialCard(actor: PC, link : Activity | SocialLink) : SocialCard {
		const cards = this.validSocialCards(actor, link);

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

	static async #socialEncounter(actor: PC, activity: SocialLink | Activity) : Promise<ChatMessage[]> {
		if (activity instanceof PersonaActor) {
			const link = this.lookupSocialLink(actor, activity.id);
			if (link.actor.isSpecialEvent(link.linkLevel+1)) {
				//TODO: Finish later
			}
		}
		const card = this.#drawSocialCard(actor, activity);
		const cameos = this.#getCameos(card, actor, activity.id);
		const perk = this.#getPerk(card, actor, activity, cameos);
		const situation : Situation = {
			user: actor.accessor,
			socialTarget: activity instanceof PersonaActor ?  activity.accessor: undefined,
			attacker: actor.accessor,
			isSocial: true,
		};
		const cardData : CardData = {
			card,
			actor,
			linkId: activity.id,
			activity,
			cameos,
			perk,
			eventsChosen: [],
			eventsRemaining : card.system.num_of_events,
			situation
		};
		return await this.#execCardSequence(cardData);

		// return await this.#printSocialCard(card, actor, linkId, cameos, perk);
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

	static #getPerk(card: SocialCard,actor: PC, link: Activity | SocialLink, cameos: SocialLink[]) {
		switch (card.system.perkType) {
			case "standard":
				return link.perk;
			case "standard-or-cameo":
				return "Choose One: <br>" +
					[link].concat(cameos)
				.map( x=> `* ${x.perk}`)
				.join("<br>");
			case "custom-only":
				return card.system.perk;
			case "standard-or-custom":
				return "Choose One: <br>" +
					[link.perk, card.perk]
				.map( x=> `* ${x}`)
				.join("<br>");
			case "standard-or-date":
				let datePerk : string;
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
		this.rollState = null;
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
		const link = this.lookupLink(cardData);
		const linkId =  "actor" in link ? link.actor.id : link.activity.id;
		const isCameo = card.system.cameoType != "none";
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-intro.hbs`, {item: card,card, cameos, perk, link: link, linkId, pc: actor, isCameo, user: game.user} );
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
		const eventIndex = cardData.card.system.events.indexOf(event);
		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/chat/social-card-event.hbs`,{event,eventNumber, cardData, situation : cardData.situation, eventIndex});
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		const msg= await ChatMessage.create(msgData,{} );
		await new Promise( (conf, _rej) => {
			this.rollState = {
				cardData,
				continuation: conf
			};
		});
		return msg;
	}

	static getCardModifiers(cardData: CardData) : ModifierList {
		const card= cardData.card;
		let effects : ConditionalEffect[] = [];
		effects = effects.concat(card.system.globalModifiers);
		const retList = new ModifierList();
		retList.addConditionalEffects(effects, "Card Modifier",["socialRoll"]);
		return retList;
	}



	static async #finalizeCard( cardData: CardData) : Promise<ChatMessage<Roll>> {
		let html = "";
		const tokenSpends = (cardData.card.system.tokenSpends ?? [])
		.concat(cardData.activity.system.tokenSpends ?? [])
		.filter( spend => testPreconditions(spend.conditions ?? [], cardData.situation, null))
		.map(x=> `spend ${x.amount} progress tokens to ${x.text}.`)
		.map(x=> `<li class="token-spend"> ${x} </li>`);


		html += `<div class="token-spends">
		<h3>Token Spends:</h3>
		<ul>
		${tokenSpends.join("")}
		</ul>
		</div>
		`;
		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		const msg= await ChatMessage.create(msgData,{} );
		return msg;
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

	static async chooseActivity(actor: PC, activity: SocialLink | Activity, options: ActivityOptions = {}) {
		if (activity instanceof PersonaItem) {
				await actor.addNewActivity(activity);
			}
		this.#socialEncounter(actor, activity);
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


	// static async #doJob(actor: PC,  activity :Job, options: ActivityOptions) {
	// 	const roll = new Roll("1d6");
	// 	await roll.roll();
	// 	const stat =  (roll.total > 2) ? "primary": "secondary";
	// 	const skill = activity.system.keyskill[stat];
	// 	const situation : Situation = {
	// 		user: actor.accessor,
	// 		isSocial: true,
	// 		socialId: activity.id
	// 	};
	// 	const avail = activity.system.availability;
	// 	const modifiers = this.getAvailModifier(avail);
	// 	let html = "";
	// 	html += `<h2>${activity.name} (${activity.system.availability})</h2>`
	// 	html += `<img src='${activity.img}'>`;
	// 	const rollTitle = `${activity.name} roll (DC ${activity.system.dc}, ${stat} --- ${skill}) `
	// 	const socialRoll = await this.rollSocialStat(actor, skill, modifiers, rollTitle,situation);
	// 	html += await socialRoll.getHTML();
	// 	// await socialRoll.toModifiedMessage();
	// 	switch (avail) {
	// 		case "++":
	// 			html += `<div><b> Perk: </b> ${activity.system.perk}</div>`;
	// 			break;
	// 		case "+":
	// 			html += `<div><b> Perk: </b> ${activity.system.perk}</div>`;
	// 			break;
	// 		case "-":
	// 			break;
	// 		case "--":
	// 			break;
	// 		default:
	// 	}
	// 	let pay = 0;
	// 	if (socialRoll.total >= activity.system.dc) {
	// 		pay = activity.system.pay.high;
	// 	} else {
	// 		pay = activity.system.pay.low;
	// 	}
	// 	const payBonus = actor.getBonuses("pay").total(situation);
	// 	if (pay + payBonus > 0) {
	// 		html += `<div> <b>Pay (auto-added):</b> ${pay} ${payBonus ? `+ ${payBonus}` : ""}`;
	// 		await actor.gainMoney(pay + payBonus);
	// 		await PersonaSounds.ching();
	// 	}
	// 	if (socialRoll.total >= activity.system.dc + 10 && activity.system.critical) {
	// 		html += `<div> <b>Critical:</b> ${activity.system.critical}</div>`;
	// 	}
	// 	if (activity.system.bane) {
	// 		html += `<div> <b>Bane:</b> ${activity.system.bane}</div>`;

	// 	}
	// 	const speaker = ChatMessage.getSpeaker();
	// 	if (!options.noDegrade) {
	// 		await this.degradeActivity(activity);
	// 	}
	// 	return await ChatMessage.create( {
	// 		speaker,
	// 		content: html,
	// 		type: CONST.CHAT_MESSAGE_TYPES.ROLL,
	// 		rolls: [roll, socialRoll.roll]
	// 	}, {});


	// }

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
				if (ModifierList.testPreconditions(eff.conditions, situation, trig)) { continue;}
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

	static getBaseSkillThreshold (cardData: CardData) : number {
		return this.getBaseSkillDC(cardData) - 5;
	}

	static getBaseSkillDC (cardData: CardData) : number {
		const ctype = cardData.card.system.cardType;
		switch (ctype) {
			case "job":
				const activity = this.lookupActivity(cardData.actor, cardData.linkId);
				return activity.activity.system.dc;
			case "social":
				const link = this.lookupSocialLink(cardData.actor, cardData.linkId);
				return 10 + link.linkLevel * 2;
			case "training":
			case "other":
				return 10 + cardData.actor.system.combat.classData.level * 2;
			case "recovery":
				return 20;
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
				}
			default: return 0;
		}
	}

	static async handleCardRoll(cardData: CardData, cardRoll:CardRoll) {
		switch (cardRoll.rollType) {
			case "none":
			case "gmspecial":
				break;
			case "studentSkillCheck": {
				const modifiers = this.getCardModifiers(cardData);
				modifiers.add("Roll Modifier", cardRoll.modifier);
				const DC = this.getCardRollDC(cardData, cardRoll);
				const link = this.lookupLink(cardData);
				const activityOrActor = "actor" in link ? link.actor: link.activity;
				const skill = this.resolvePrimarySecondarySocialStat(cardRoll.studentSkill, activityOrActor);
				const roll = await this.rollSocialStat(cardData.actor, skill, modifiers, `Card Roll (${skill} ${cardRoll.modifier} vs DC ${DC})`,  cardData.situation);
				await roll.toModifiedMessage();
				const situation : Situation = {
					...cardData.situation,
					hit: roll.total >= DC,
					criticalHit: roll.total >= DC + 10,
					naturalSkillRoll: roll.natural,
					rollTotal: roll.total
				};
				this.applyEffects(cardRoll.effects,situation, cardData.actor);
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
					rollTotal: saveResult.total
				};
				this.applyEffects(cardRoll.effects,situation, cardData.actor);
				break;
			}
			default:
				cardRoll satisfies never;
		}
	}

	static async applyEffects(effects: ConditionalEffect[], situation: Situation, actor: PC) {
				const results = ArrayCorrector(effects ?? []).flatMap( eff=> getActiveConsequences(eff, situation, null));
				const processed= PersonaCombat.ProcessConsequences_simple(results);
				const result = new CombatResult();
				for (const c of processed.consequences) {
					result.addEffect(null, actor, c.cons);
				}
				await result.emptyCheck()?.toMessage("Social Roll Effects", actor);

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
		const cardEvent = card.system.events[eventIndex];
		const choice= cardEvent.choices[choiceIndex];
		await this.handleCardRoll(this.rollState.cardData, choice.roll);
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
		// html.find("button.social-roll").on ("click", PersonaSocial.execSocialCard.bind(PersonaSocial));
		html.find(".social-card-roll .make-roll").on("click", PersonaSocial.makeCardRoll.bind(PersonaSocial));
		html.find(".social-card-roll .next").on("click", PersonaSocial.makeCardRoll.bind(PersonaSocial));
	}
});


export type CardData = {
	card: SocialCard,
	actor: PC,
	linkId: string,
	activity: Job | SocialLink,
	cameos: SocialLink[],
	perk: string,
	eventsChosen: number[],
	eventsRemaining: number,
	situation: Situation
};


