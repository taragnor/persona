import { PersonaSounds } from "../../persona-sounds.js";
import { Logger } from "../../utility/logger.js";
import { PersonaError } from "../../persona-error.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { CombatantSheetBase } from "./combatant-sheet.js";
import { PersonaActor } from "../persona-actor.js";
import { PersonaSocial } from "../../social/persona-social.js";
import { SocialStat } from "../../../config/student-skills.js";
import { STUDENT_SKILLS_LIST } from "../../../config/student-skills.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaDB } from "../../persona-db.js"
import { NPC } from "../persona-actor.js";
import { PC } from "../persona-actor.js";


export class PCSheet extends CombatantSheetBase {
	override actor: Subtype<PersonaActor, "pc">;
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
			case "npc":
				//create a social link
				await this.actor.createSocialLink(actor as NPC)
				return undefined;
			default: 
				actor.system satisfies never;
				throw new Error(`Unknown unsupported type ${actor.type}`);
		}
	}

	override async getData() {
		const data = await super.getData();
		data.equips = {
			weapons: Object.fromEntries(Array.from(this.actor.items).flatMap( x=> {
				if (x.system.type == "weapon")
					return [[ x.id, x.name]];
				else return [];
			})),
			body: Object.fromEntries(Array.from(this.actor.items).flatMap( x=> {
				if (x.system.type == "item" && x.system.slot =="body")
					return [[ x.id, x.name]];
				else return [];
			})),
			accessory: Object.fromEntries(Array.from(this.actor.items).flatMap( x=> {
				if (x.system.type == "item" && x.system.slot =="accessory")
					return [[ x.id, x.name]];
				else return [];
			})),
			attachment: Object.fromEntries(Array.from(this.actor.items).flatMap( x=> {
				if (x.system.type == "item" && x.system.slot =="weapon_crystal")
					return [[ x.id, x.name]];
				else return [];
			})),
		};
		data.jobs = PersonaDB.allJobs()
		.filter( job => job.system.availability != "N/A" && job.system.active);
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		html.find(".delItem").on("click", this.delItem.bind(this));
		html.find(".refreshLink").on("click", this.refreshLink.bind(this));
		html.find(".useInspiration").on("click", this.useInspiration.bind(this));
		html.find(".useRecovery").on("click", this.useRecovery.bind(this));
		html.find(".incTalent").on("click", this.incTalent.bind(this));
		html.find(".decTalent").on("click", this.decTalent.bind(this));
		html.find(".addSocialRank").on("click", this.addSocialRank.bind(this));
		html.find(".removeSocialRank").on("click", this.reduceSocialRank.bind(this));
		html.find(".addSocialBoost").on("click", this.addSocialBoost.bind(this));
		html.find(".addItem").on("click", this.#addItem.bind(this));
		html.find(".levelUp").on("click", this.levelUp.bind(this));
		html.find(".social-link .name").on("click", this.openSL.bind(this));
		html.find(".job .name").on("click", this.openJob.bind(this));
		html.find(".removeSocialBoosts").on("click", this.removeSLBoosts.bind(this));
		// html.find(".clearSocialBoosts").on("click", this.clearSLBoosts.bind(this));
		html.find(".social-links .roll-icon img").on("click", this.rollSL.bind(this));
		html.find(".job .roll-icon img").on("click", this.rollJob.bind(this));
		html.find(`.social-stat .roll-icon`).on("click", this.rollSocial.bind(this));
		html.find(`.social-stat .social-boost`).on("click", this.socialBoost.bind(this));
		html.find(`.spend-money`).on('click', this.spendMoney.bind(this));
		html.find(`.gain-money`).on('click', this.gainMoney.bind(this));
		html.find(".draw-social-card").on("click", this.drawSocialCard.bind(this))
		html.find(".relationship-type").on("change", this.relationshipTypeChange.bind(this))
		super.activateListeners(html);
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

	async delItem (event : Event) {
		const item_id= String(HTMLTools.getClosestData(event, "itemId"));
		const item = this.actor.items.find(x=> x.id == item_id);
		if (item && await HTMLTools.confirmBox("Confirm", "Really delete?")) {
			item.delete();
		}
	}

	async refreshLink(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = this.actor.socialLinks.find(x=> x.actor.id == linkId);
		const npc = link?.actor;
		if (!npc) {
			throw new PersonaError(`COuldn't find NPC with Id ${linkId}`);
		}
		const amount = await HTMLTools.singleChoiceBox({
			1: "1",
			2: "2",
			3: "3",
			9999: "All",
		}, {default: 1, title: "Remove Social Boosts"});

		if (!amount) return;
		await Logger.sendToChat(`Added ${Number(amount)} inpiration for ${npc.name} (was ${link.inspiration})`, this.actor);
		await this.actor.addInspiration(npc.id, Number(amount));
	}

	async useInspiration(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const npc = this.actor.socialLinks.find(x=> x.actor.id == linkId)?.actor;
		if (!npc || npc.system.type != "npc") {
			throw new PersonaError(`COuldn't find NPC with Id ${linkId}`);
		}
		await this.actor.spendInspiration(npc, 1);
		await Logger.sendToChat(`Spent an inpiration for ${npc.name}`, this.actor);
	}

	async useRecovery(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		await this.actor.spendRecovery(linkId);
	}

	async incTalent(event: Event) {
		const talentId= String(HTMLTools.getClosestData(event, "talentId"));
		await this.actor.incrementTalent(talentId);
	}

	async decTalent(event: Event) {
		const talentId= String(HTMLTools.getClosestData(event, "talentId"));
		await this.actor.decrementTalent(talentId);
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

	async addSocialBoost(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const choice = await HTMLTools.singleChoiceBox({
			1: "1",
			2: "2",
			3: "3",
		}, {default: 1, title: "Add Social Boost"});
		if (choice == null) return;
		await this.actor.socialLinkProgress(linkId, Number(choice));
	}


	async removeSLBoosts(event: JQuery.ClickEvent) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const choice = await HTMLTools.singleChoiceBox({
			1: "1",
			2: "2",
			3: "3",
			9999: "All",
		}, {default: 1, title: "Remove Social Boosts"});
		if (choice == null) return;
		await this.actor.socialLinkProgress(linkId, -Number(choice));
	}

	async relationshipTypeChange(event: JQuery.ChangeEvent) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const newval = $(event.currentTarget).find(":selected").val();
		if (!newval) return;
		this.actor.setRelationshipType(linkId, String(newval));
}

	#addItem(_ev: JQuery<Event>) {
		this.actor.createNewItem();
	}

	async levelUp(_event: Event) {
		if (await HTMLTools.confirmBox("Level Up", "Level Up Character")) {
			await this.actor.levelUp();
		}

	}

	async openSL(ev: Event) {
		const linkId= String(HTMLTools.getClosestData(ev, "linkId"));
		const link = this.actor.socialLinks.find( link=> link.actor.id == linkId);
		if (link && link.actor != this.actor) {
			link.actor.sheet.render(true);
		}
	}

	async openJob(ev: Event) {
		const jobId= String(HTMLTools.getClosestData(ev, "jobId"));
		const job = PersonaDB.allJobs().find(x=> x.id == jobId);
		if (job){
			job.sheet.render(true);
		}
	}


	async rollSL(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		await PersonaSocial.makeUpgradeLinkRoll(this.actor, linkId)
	}

	async rollJob(event: JQuery.ClickEvent) {
		const jobId= String(HTMLTools.getClosestData(event, "jobId"));
		const job= PersonaDB.allJobs().find(x=> x.id == jobId);
		if (!job) {
			throw new PersonaError(`Can't find Job : ${jobId}`);
		}
		if (await HTMLTools.confirmBox("Job", `Work at ${job.name}`)) {
			await PersonaSocial.chooseActivity(this.actor, job);
		}
	}

	async gainMoney(_ev: Event) {
		const x = await HTMLTools.getNumber("Amount to gain");
		if (x <= 0) return;
		await this.actor.gainMoney(x);
		await Logger.sendToChat(`${this.actor.name} Gained ${x} resource points`);
		await PersonaSounds.ching();
	}

	async spendMoney(_ev: Event) {
		const x = await HTMLTools.getNumber("Amount to spend");
		if (x <= 0) return;
		await this.actor.spendMoney(x);
		await Logger.sendToChat(`${this.actor.name} Spent ${x} resource points`);
	}

	async drawSocialCard(event: JQuery.ClickEvent) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		const link = PersonaSocial.lookupLinkId(this.actor, linkId);
		if (link &&
			await HTMLTools.confirmBox("Social Card", "Draw Social Card?")) {
			await PersonaSocial.chooseActivity(this.actor, link.actor, {noDegrade:true})
		}
	}


}
