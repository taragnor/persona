import { CClass } from "../../item/persona-item.js";

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
				throw new Error(`Unknown type ${item.type}`);
		}
	}

}

