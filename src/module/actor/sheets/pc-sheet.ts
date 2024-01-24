import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { CombatantSheetBase } from "./combatant-sheet.js";
import { PersonaActor } from "../persona-actor.js";
import { PersonaSocial } from "../../social/persona-social.js";
import { SocialStat } from "../../../config/student-skills.js";
import { STUDENT_SKILLS_LIST } from "../../../config/student-skills.js";
import { HTMLTools } from "../../utility/HTMLTools.js";

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

	override async getData() {
		const data = await super.getData();
		console.log(this.actor.items);
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

}
