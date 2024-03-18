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
		return mergeObject(super.defaultOptions, {
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
					return;
				}
				case "shadow": return;
				case "npc":
					//create a social link
					await this.actor.createSocialLink(actor as NPC)
					return;
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
		html.find(".addSocialBoost").on("click", this.addSocialBoost.bind(this));
		html.find(".addItem").on("click", this.#addItem.bind(this));
		html.find(".levelUp").on("click", this.levelUp.bind(this));
		html.find(".social-link .name").on("click", this.openSL.bind(this));
		html.find(".clearSocialBoosts").on("click", this.clearSLBoosts.bind(this));
		html.find(".roll-icon img").on("click", this.rollSL.bind(this));
		for (const stat of STUDENT_SKILLS_LIST) {
			html.find(`.${stat} .roll-icon`).on("click", this.rollSocial.bind(this, stat));
		}
		super.activateListeners(html);
	}

	async rollSocial (socialStat: SocialStat) {
		PersonaSocial.rollSocialStat(this.actor, socialStat);
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
		await Logger.sendToChat(`Refreshed inpiration for ${npc.name} (was ${link.inspiration})`, this.actor);
		await this.actor.refreshSocialLink(npc);
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
		this.actor.increaseSocialLink(linkId)
	}

	async addSocialBoost(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		this.actor.socialLinkProgress(linkId, 1);
	}

async clearSLBoosts (event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
		this.actor.socialLinkProgress(linkId, -100);

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

async rollSL(event: Event) {
		const linkId= String(HTMLTools.getClosestData(event, "linkId"));
	await PersonaSocial.makeUpgradeLinkRoll(this.actor, linkId)
}

}
