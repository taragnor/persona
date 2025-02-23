import { localize } from "../../persona.js";
import { Logger } from "../../utility/logger.js";
import { PersonaError } from "../../persona-error.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaActor } from "../persona-actor.js";
import { PersonaSocial } from "../../social/persona-social.js";
import { SocialStat } from "../../../config/student-skills.js";
import { STUDENT_SKILLS_LIST } from "../../../config/student-skills.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaDB } from "../../persona-db.js"
import { NPC } from "../persona-actor.js";
import { PC } from "../persona-actor.js";
import { PCLikeSheet } from "./pc-like-sheet.js";

export class PCSheet extends PCLikeSheet {
	declare actor: Subtype<PersonaActor, "pc">;
	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/pc-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"}]
		});
	}


	override async _onDropActor(_event: Event, actorD: unknown)
	{
		//@ts-ignore
		const actor : PersonaActor = await Actor.implementation.fromDropData(actorD);
		switch (actor.system.type) {
			case "pc" :{
				await this.actor.createSocialLink(actor as PC)
				return undefined;
			}
			case "shadow":
				return;
			case "tarot":
				return;
			case "npcAlly":
			case "npc":
				//create a social link
				await this.actor.createSocialLink(actor as NPC)
				return undefined;
			default:
				actor.system satisfies never;
				throw new Error(`Unknown unsupported type ${actor.type}`);
		}
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".refreshLink").on("click", this.refreshLink.bind(this));
		html.find(".useInspiration").on("click", this.useInspiration.bind(this));
		html.find(".useRecovery").on("click", this.useRecovery.bind(this));
		html.find(".addSocialRank").on("click", this.addSocialRank.bind(this));
		html.find(".removeSocialRank").on("click", this.reduceSocialRank.bind(this));
		html.find(".add-progress-token").on("click", this.addProgressTokens.bind(this));
		html.find(".social-link .name").on("click", this.openSL.bind(this));
		html.find(".job .name").on("click", this.openJob.bind(this));
		html.find(".rem-progress-token").on("click", this.removeProgressTokens.bind(this));
		html.find(`.social-stat .roll-icon`).on("click", this.rollSocial.bind(this));
		html.find(`.social-stat .social-boost`).on("click", this.socialBoost.bind(this));
		html.find(`.social-stat .social-minus`).on("click", this.socialMinus.bind(this));
		html.find(`.spend-money`).on('click', this.spendMoney.bind(this));
		html.find(`.gain-money`).on('click', this.gainMoney.bind(this));
		html.find(".draw-social-card").on("click", this.drawSocialCard.bind(this))
		html.find(".draw-activity-card").on("click", this.drawActivityCard.bind(this))
		html.find(".relationship-type").on("change", this.relationshipTypeChange.bind(this))
		html.find(".add-strike").on("click", this.addStrike.bind(this));
		html.find(".rem-strike").on("click", this.removeStrike.bind(this));
		html.find(".init-social-link").on("click", this.startSocialLink.bind(this));
		html.find(".move-to-sideboard").on("click", this.movePowerToSideboard.bind(this));
		html.find(".move-to-main").on("click", this.movePowerToMain.bind(this));
	}

	async rollSocial (ev: JQuery.Event) {
		const socialStat = HTMLTools.getClosestData(ev, "socialSkill") as SocialStat;
		if (!STUDENT_SKILLS_LIST.includes(socialStat)) {
			throw new PersonaError(`Invalid student skill: ${socialStat}.`);
		}
		const roll = await PersonaSocial.rollSocialStat(this.actor, socialStat);
		await roll.toModifiedMessage();
	}

	async socialBoost (ev: JQuery.Event) {
		const socialStat = HTMLTools.getClosestData(ev, "socialSkill") as SocialStat;
		if (!STUDENT_SKILLS_LIST.includes(socialStat)) {
			throw new PersonaError(`Invalid student skill: ${socialStat}.`);
		}
		PersonaSocial.boostSocialSkill(this.actor, socialStat)
	}

	async socialMinus (ev: JQuery.Event) {
		const socialStat = HTMLTools.getClosestData(ev, "socialSkill") as SocialStat;
		if (!STUDENT_SKILLS_LIST.includes(socialStat)) {
			throw new PersonaError(`Invalid student skill: ${socialStat}.`);
		}
		PersonaSocial.lowerSocialSkill(this.actor, socialStat)
	}

	async refreshLink(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = this.actor.socialLinks.find(x=> x.actor.id == linkId);
		const npc = link?.actor;
		if (!npc) {
			throw new PersonaError(`Couldn't find NPC with Id ${linkId}`);
		}
		const amount = await HTMLTools.singleChoiceBox({
			1: "1",
			2: "2",
			3: "3",
			9999: "All",
		}, {default: 1, title: "Refresh Inspiration from Link"});

		if (!amount) return;
		await Logger.sendToChat(`Added ${Number(amount)} inpiration for ${npc.name} (was ${link.inspiration})`, this.actor);
		await this.actor.addInspiration(npc.id, Number(amount));
	}

	async useInspiration(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const npc = this.actor.socialLinks.find(x=> x.actor.id == linkId)?.actor;
		if (!npc) {
			throw new PersonaError(`COuldn't find NPC with Id ${linkId}`);
		}
		await this.actor.spendInspiration(npc, 1);
		await Logger.sendToChat(`Spent an inpiration for ${npc.name}`, this.actor);
	}

	async useRecovery(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		await this.actor.spendRecovery(linkId);
	}


	async addSocialRank(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = this.actor.socialLinks.find( x=> x.actor.id == linkId);
		if (!link) {
			throw new PersonaError(`Can't find Actor for SL ${linkId}`);
		}
		if (await HTMLTools.confirmBox("Riase SL", `Raise SL for link ${link.actor.name}`)) {
			await this.actor.increaseSocialLink(linkId);
		}
	}

	async reduceSocialRank(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = this.actor.socialLinks.find( x=> x.actor.id == linkId);
		if (!link) {
			throw new PersonaError(`Can't find Actor for SL ${linkId}`);
		}
		if (await HTMLTools.confirmBox("Lower SL", `Lower SL for link ${link.actor.name}`)) {
			await this.actor.decreaseSocialLink(linkId);
		}
	}

	async addProgressTokens(event: JQuery.ClickEvent) {
		const choice = await HTMLTools.singleChoiceBox({
			1: "1",
			2: "2",
			3: "3",
			4: "4",
		}, {default: 1, title: "Add Social Boost"});
		if (choice == null) return;
		if ($(event.currentTarget).closest(".social-link").length > 0) {
			const linkId= String(HTMLTools.getClosestData(event, "linkId"));
			await this.actor.socialLinkProgress(linkId, Number(choice));
			return;
		}
		if ($(event.currentTarget).closest(".job").length > 0) {
			const activityId= String(HTMLTools.getClosestData(event, "activityId"));
			await this.actor.activityProgress(activityId, Number(choice));
		}
	}

	async removeProgressTokens(event: JQuery.ClickEvent) {
		const choice = await HTMLTools.singleChoiceBox({
			1: "1",
			2: "2",
			3: "3",
			4: "4",
			5: "5",
			9999: "All",
		}, {default: 1, title: "Remove Social Boosts"});
		if (choice == null) return;
		if ($(event.currentTarget).closest(".social-link").length > 0) {
			const linkId= String(HTMLTools.getClosestData(event, "linkId"));
			await this.actor.socialLinkProgress(linkId, -Number(choice));
		}
		if ($(event.currentTarget).closest(".job").length > 0) {
			const activityId= String(HTMLTools.getClosestData(event, "activityId"));
			await this.actor.activityProgress(activityId, -Number(choice));
		}
	}

	async #modStrike(event: JQuery.ClickEvent, amt: number) {
		if ($(event.currentTarget).closest(".social-link").length > 0) {
			const linkId= String(HTMLTools.getClosestData(event, "linkId"));
			await this.actor.activityStrikes(linkId, amt);
		}
		if ($(event.currentTarget).closest(".job").length > 0) {
			const activityId= String(HTMLTools.getClosestData(event, "activityId"));
			await this.actor.activityStrikes(activityId, amt);
		}

	}

	async addStrike(event: JQuery.ClickEvent) {
		await this.#modStrike(event, 1);
	}

	async removeStrike(event: JQuery.ClickEvent) {
		await this.#modStrike (event, -1);

	}

	async relationshipTypeChange(event: JQuery.ChangeEvent) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const newval = $(event.currentTarget).find(":selected").val();
		if (!newval) return;
		this.actor.setRelationshipType(linkId, String(newval));
	}



	async openSL(ev: Event) {
		const linkId= String(HTMLTools.getClosestData(ev, "linkId"));
		const link = this.actor.socialLinks.find( link=> link.actor.id == linkId);
		if (link && link.actor != this.actor) {
			link.actor.sheet.render(true);
		}
	}

	async openJob(ev: Event) {
		const jobId= String(HTMLTools.getClosestData(ev, "activityId"));
		const job = PersonaDB.allActivities().find(x=> x.id == jobId);
		if (job){
			job.sheet.render(true);
		}
	}

	async gainMoney(_ev: Event) {
		const x = await HTMLTools.getNumber("Amount to gain");
		if (x <= 0) return;
		await this.actor.gainMoney(x, true);
	}

	async spendMoney(_ev: Event) {
		const x = await HTMLTools.getNumber("Amount to spend");
		if (x <= 0) return;
		await this.actor.spendMoney(x);
		// await Logger.sendToChat(`${this.actor.name} Spent ${x} resource points`);
	}

	async drawActivityCard (event: JQuery.ClickEvent) {
		const activityId= String(HTMLTools.getClosestData(event, "activityId"));
		const activity = PersonaDB.allActivities().find(x => x.id == activityId);
		if (activity &&
			await HTMLTools.confirmBox("Social Card", "Draw Activity Card?")) {
			await PersonaSocial.chooseActivity(this.actor, activity, {noDegrade:true})
		}
	}
	async drawSocialCard(event: JQuery.ClickEvent) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = PersonaSocial.lookupSocialLink(this.actor, linkId);
		if (link &&
			await HTMLTools.confirmBox("Social Card", "Draw Social Card?")) {
			await PersonaSocial.chooseActivity(this.actor, link.actor, {noDegrade:true})
		}
	}


	async startSocialLink(event: JQuery.ClickEvent) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		await PersonaSocial.startSocialLink(this.actor, linkId);

	}

	async movePowerToSideboard( event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		await this.actor.movePowerToSideboard(powerId);
	}

	async movePowerToMain( event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		await this.actor.retrievePowerFromSideboard(powerId);
	}

}
