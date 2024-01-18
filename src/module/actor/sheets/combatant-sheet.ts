import { HTMLTools } from "../../utility/HTMLTools.js";
import { CClass } from "../../item/persona-item.js";

import { PersonaDB } from "../../persona-db.js";
import { PersonaItem } from "../../item/persona-item.js";
import { PersonaActor } from "../persona-actor.js";
import { PersonaActorSheetBase } from "./actor-sheet.base.js";
import { PC } from "../persona-actor.js";
import { Shadow } from "../persona-actor.js";
import { Talent } from "../../item/persona-item.js";
import { Power } from "../../item/persona-item.js";
import { Focus } from "../../item/persona-item.js";

export abstract class CombatantSheetBase extends PersonaActorSheetBase {
	override actor: PC | Shadow;

	override async getData () {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".delPower").on("click", this.deletePower.bind(this));
		html.find(".rollPower").on("click", this.usePower.bind(this));
	}

	override async _onDropItem(_event: Event, itemD: unknown, ...rest:any[]) : Promise<void> {
		//@ts-ignore
		const item: PersonaItem = await Item.implementation.fromDropData(itemD);
		switch (item.system.type) {
			case "talent":
				this.actor.addTalent(item as Talent);
				return;
			case "consumable":
				super._onDropItem(_event, itemD);
				return;
			case "power":
				this.actor.addPower(item as Power);
				return;
			case "focus":
				this.actor.addFocus(item as Focus);
				return;
			case "item":
				super._onDropItem(_event, itemD);
				return;
			case "weapon":
				super._onDropItem(_event, itemD);
				return;
			case "characterClass":
				this.actor.setClass(item as CClass);
				return;
			case "studentSkill":
				//DO nothing as this will probably get removed;
				return;
			default:
				item.system satisfies never;
				throw new Error(`Unknown supported type ${item.type}`);
		}
	}

	async usePower(event: Event) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		const power = PersonaDB.getItemById(powerId);
		if (!power) throw new Error(`Can't find power id: ${powerId}`);
		console.log(`Trying to use power: ${power.name}`);

	}

	async deletePower(event: Event) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		if (powerId == undefined) {
			const err = `Can't find power at index ${powerId}`;
			console.error(err);
			ui.notifications.error(err);
			throw new Error(err);
		}
		if (await HTMLTools.confirmBox("Confirm Delete", "Are you sure you want to delete this power?")) {
			this.actor.deletePower(powerId);
		}
	}

}
