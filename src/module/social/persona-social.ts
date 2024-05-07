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
import { PersonaRoll } from "../persona-roll.js";
import { PersonaDB } from "../persona-db.js";
import { HTMLTools } from "../utility/HTMLTools.js";

export class PersonaSocial {

	static #drawnCardIds: string[] = [];

	static async rollSocialStat( pc: PC, socialStat: SocialStat, extraModifiers?: ModifierList, altName ?: string, situation?: Situation) : Promise<PersonaRoll> {
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
		const dice = new PersonaRoll("1d20", mods, sit, rollName);
		await dice.roll();
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
		const priOrSec : "primary" | "secondary" = await this.getPrimarySecondary();
		const socialStat = link.actor.getSocialStatToRaiseLink(priOrSec);
		const situation: Situation  = {
			user: actor.accessor,
			usedSkill: socialStat,
			socialTarget: link.actor.accessor,
		};
		const progressTokens = link.currentProgress;
		const mods = new ModifierList();
		const DC = 10 + 3 * link.linkLevel;
		mods.add("Progress Tokens", 3 * progressTokens)
		const rollName= `${link.actor.name} --> Social Roll (${socialStat}) vs DC ${DC}`;
		const roll =await this.rollSocialStat(actor, socialStat, mods, rollName, situation);
		await roll.toModifiedMessage();
		situation.hit = roll.total >= DC ;
		situation.criticalHit = roll.total >= DC + 10;
	}

	static async getPrimarySecondary() :Promise<"primary" | "secondary"> {
		const html = `<div><u> Primary or Secondary</u></div>
		<div>
		<input name="PorS" type='radio' value='primary'>
		<label>Primary</label>
		</div>
		<div>
		<input name="PorS" type='radio' value='secondary'>
		<label>Secondary</label>
		</div>

		`;
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
							const value =$('input[name="PorS"]:checked').val() as "primary" | "secondary" | undefined;
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

	static #drawSocialCard(actor: PC, linkId : string) : SocialCard {
		const cards = PersonaDB.allItems().filter( item => item.system.type == "socialCard") as SocialCard[];
		let undrawn = cards.filter( card=> !this.#drawnCardIds.includes(card.id));
		if (undrawn.length < 4) {
			undrawn = cards;
			this.#drawnCardIds = [];
		}
		const draw  = Math.floor(Math.random() * undrawn.length) ;
		const chosenCard =  undrawn[draw];
		//TODO: check validit based on relationship
		if (!chosenCard) throw new PersonaError("Can't find valid card!");
		this.#drawnCardIds.push(chosenCard.id);
		return chosenCard;
	}

	static async socialCard(actor: PC, linkId: string) : Promise<ChatMessage> {
		const card = this.#drawSocialCard(actor, linkId);
		return await this.#printSocialCard(card, actor, linkId);
	}

	static async #printSocialCard(card: SocialCard, actor: PC, linkId: string ) : Promise<ChatMessage> {
		//TODO: print out chatmessage for card
		const link = actor.socialLinks.find(link => link.actor.id == linkId);
		const skill = STUDENT_SKILLS[actor.getSocialStatToRaiseLink(card.system.skill)];

		const html = await renderTemplate(`${HBS_TEMPLATES_DIR}/social-card.hbs`, {item: card,card,  skill} );

		const speaker = ChatMessage.getSpeaker();
		const msgData : MessageData = {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.OOC
		};
		return await ChatMessage.create(msgData,{} );
	}

} //end of class

//@ts-ignore
window.PersonaSocial = PersonaSocial
