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
		const link = actor.socialLinks.find(link => link.actor.id == linkId);
		if (!link) throw new PersonaError(`Can't find link ${linkId}`);
		const relationshipName : string = link.relationshipType;
		const cards = PersonaDB.allSocialCards()
			.filter( item => item.system.qualifiers
				.some(x=> x.relationshipName == relationshipName
					&& link.linkLevel >= x.min
					&& link.linkLevel <= x.max
				)
			);

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

	static async drawSocialCard(actor: PC, linkId: string) : Promise<ChatMessage> {
		const card = this.#drawSocialCard(actor, linkId);
		return await this.#printSocialCard(card, actor, linkId);
	}

	static async #printSocialCard(card: SocialCard, actor: PC, linkId: string ) : Promise<ChatMessage> {
		// const link = actor.socialLinks.find(link => link.actor.id == linkId);
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

	static async rerollAvailability() {
		let rolls : Roll[] = [];
		let html = "";
		const links = (game.actors.contents as PersonaActor[])
			.filter( x=> (x.system.type == "pc" || x.system.type == "npc") && x.system.availability != "N/A");
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

	static async chooseActivity(actor: PC, activity: SocialLink | Job, options: ActivityOptions) {
		if (activity instanceof PersonaItem) {
			await this.#doJob(actor, activity);
		} else {
			await this.#socialEncounter(actor, activity);
		}
		const availability = activity.system.availability;
		if (!options.noDegrade) {
			await activity.update(
				{"system.availability": this.#degradedAvailability(availability) }
			);
		}
	}


	static async #socialEncounter(actor: PC, activity: SocialLink) {
		await this.drawSocialCard(actor, activity.id);
	}


	static async #doJob(actor: PC,  activity :Job) {
		const roll = new Roll("1d6");
		await roll.roll();
		const stat =  (roll.total > 2) ? "primary": "secondary";
		const skill = activity.system.keyskill[stat];
		const situation : Situation = {
			user: actor.accessor,
			isSocial: true,
			socialId: activity.id
		};
		let html = "";
		const avail = activity.system.availability;
		const modifiers = new ModifierList();
		switch (avail) {
			case "++":
				modifiers.add("Favorable", 5);
				html += `<div><b> Perk: </b> ${activity.system.perk}</div>`;
				break;
			case "+":
				html += `<div><b> Perk: </b> ${activity.system.perk}</div>`;
				break;
			case "-":
				break;
			case "--":
				modifiers.add("Negative Availabilty", -5);
				break;
			default:
		}

		const rollTitle = `${activity.name} roll (DC ${activity.system.dc}, ${stat} --- ${skill}) `
		const socialRoll = await this.rollSocialStat(actor, skill, modifiers, rollTitle,situation);
		await socialRoll.toModifiedMessage();
		let pay = 0;
		if (socialRoll.total >= activity.system.dc) {
			pay = activity.system.pay.high;
		} else {
			pay = activity.system.pay.low;
		}
		const payBonus = actor.getBonuses("pay").total(situation);
		if (pay > 0) {
			html += `<div> <b>Pay (auto-added):</b> ${pay} ${payBonus ? `+ ${payBonus}` : ""}`;
		}
		await actor.gainMoney(pay + payBonus);
		await PersonaSounds.ching();
		if (socialRoll.total >= activity.system.dc + 10 && activity.system.critical) {
			html += `<div> <b>Critical:</b> ${activity.system.critical}</div>`;
		}
		const speaker = ChatMessage.getSpeaker();
		return await ChatMessage.create( {
			speaker,
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.ROLL,
			rolls: [roll]
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

	static async execTrigger( trigger: NonCombatTrigger, actor: PC, situation ?: Situation) {
		await this.onTrigger(trigger, actor, situation)
			.emptyCheck()
			?.toMessage("Triggered Effect", actor);

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

} //end of class

type ActivityOptions = {
	noDegrade ?: boolean;

}

//@ts-ignore
window.PersonaSocial = PersonaSocial
