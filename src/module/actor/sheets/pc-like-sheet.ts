/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Logger } from "../../utility/logger.js";
import { localize } from "../../persona.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaDB } from "../../persona-db.js";
import { CombatantSheetBase } from "./combatant-sheet.js";

export class PCLikeSheet extends CombatantSheetBase {
	declare actor: PC | NPCAlly;

	override async getData() {
		const data = await super.getData();
		data.equips = {
			weapons: Object.fromEntries(Array.from(this.actor.items).flatMap( x=> {
				if (x.system.type == "weapon")
					{return [[ x.id, x.name]];}
				else {return [];}
			})),
			body: Object.fromEntries(Array.from(this.actor.items).flatMap( x=> {
				if (x.system.type == "item" && x.system.slot =="body")
					{return [[ x.id, x.name]];}
				else {return [];}
			})),
			accessory: Object.fromEntries(Array.from(this.actor.items).flatMap( x=> {
				if (x.system.type == "item" && x.system.slot =="accessory")
					{return [[ x.id, x.name]];}
				else {return [];}
			})),
			attachment: Object.fromEntries(Array.from(this.actor.items).flatMap( x=> {
				if (x.system.type == "item" && x.system.slot =="weapon_crystal")
					{return [[ x.id, x.name]];}
				else {return [];}
			})),
		};

		data.jobs = PersonaDB.allActivities().filter( activity=> Object.values(activity.system.weeklyAvailability).some (val => val));
		return data;
	}

	override activateListeners(html: JQuery) {
		super.activateListeners(html);
		html.find(".delItem").on("click", this.delItem.bind(this));
		html.find(".addItem").on("click", this.#addItem.bind(this));
		html.find(".equips select").on("change", this.equipmentChange.bind(this));
		html.find(".sort-up").on("click", this.reorderPowerUp.bind(this));
		html.find(".sort-down").on("click", this.reorderPowerDown.bind(this));

	}

	async delItem (event : Event) {
		const item_id= String(HTMLTools.getClosestData(event, "itemId"));
		const item = this.actor.items.find(x=> x.id == item_id);
		if (item && await HTMLTools.confirmBox("Confirm", `Really delete <b>${item?.name ?? "Unknown item"}</b>?`)) {
			await item.delete();
		}
	}

	async #addItem(_ev: JQuery<Event>) {
		await this.actor.createNewItem();
	}


	async equipmentChange(event: JQuery.ChangeEvent) {
		const div = $(event.currentTarget).parent();
		let itemType = "unknown";
		const itemId = $(event.currentTarget).find(":selected").val();
		if (!itemId) {return false;}
		const item = this.actor.items.find(x=> x.id == itemId);
		const typeTable = {
			"weapon": "persona.equipslots.weapon",
			"armor": "persona.equipslots.body",
			"accessory":	"persona.equipslots.accessory",
			"weapon-crystal":		"persona.equipslots.weapon_crystal",
		} as const;
		for (const [k,v] of Object.entries(typeTable)) {
			if (div.hasClass(k)) {
				itemType = localize(v);
			}
		}
		await Logger.sendToChat(`${this.actor.name} changed ${itemType} ${item?.name ?? "ERROR"}` , this.actor);
	}

	async reorderPowerUp (event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		const powers = this.actor.system.combat.powers;
		const index = powers.indexOf(powerId as Power["id"]);
		if (index == -1) {return;}
		if (index == 0) {return;}
		powers[index] = powers[index-1];
		powers[index-1] = powerId as Power["id"];
		await this.actor.update({"system.combat.powers": powers});
	}

	async reorderPowerDown (event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		const powers = this.actor.system.combat.powers;
		const index = powers.indexOf(powerId as Power["id"]);
		if (index == -1) {return;}
		if (index >= powers.length-1)
			{return;}
		powers[index] = powers[index+1];
		powers[index+1] = powerId as Power["id"];
		await this.actor.update({"system.combat.powers": powers});
	}

}

