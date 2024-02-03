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
				case "pc" : return;
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
		if (!npc || npc.system.type != "npc") {
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


}
