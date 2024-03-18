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

	static async rollSocialStat( pc: PC, socialStat: SocialStat, extraModifiers?: ModifierList, altName ?: string) : Promise<ChatMessage> {
		let mods = pc.getSocialStat(socialStat);
		const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
		mods.add("Custom Modifier", customMod);
		if (extraModifiers) {
			mods = mods.concat(extraModifiers);
		}
		const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
		const rollName = (altName) ? altName : skillName;
		const sit: Situation = {
			user: PersonaDB.getUniversalActorAccessor(pc),
		};
		const dice = new PersonaRoll("1d20", mods, sit, rollName);
		await dice.roll();
		return await dice.toModifiedMessage();
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
		const progressTokens = link.currentProgress;
		const mods = new ModifierList();
		const DC = 10 + 3 * link.linkLevel;
		mods.add("Progress Tokens", 3 * progressTokens)
		const rollName= `${link.actor.name} --> Social Roll (${socialStat}) vs DC ${DC}`;
		await this.rollSocialStat(actor, socialStat, mods, rollName);
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

}
