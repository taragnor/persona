import { PersonaError } from "../../persona-error.js";
import { PersonaCombat } from "../../combat/persona-combat.js"
import { PToken } from "../../combat/persona-combat.js";
import { Usable } from "../../item/persona-item.js";

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
		html.find(".delFocus").on("click", this.deleteFocus.bind(this));
		html.find(".delTalent").on("click", this.deleteTalent.bind(this));
		html.find(".rollPower").on("click", this.usePower.bind(this));
		html.find(".powerName").on("click", this.openPower.bind(this));
		html.find(".talentName").on("click", this.openTalent.bind(this));
		html.find(".focusName").on("click", this.openFocus.bind(this));
		html.find(".rollSave").on("click", this.rollSave.bind(this));
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
				if (this.actor.system.type == "shadow") {
					super._onDropItem(_event, itemD);
					return;
				} else {
					this.actor.addPower(item as Power);
					return;
				}
				return;
			case "focus":
				if (this.actor.system.type == "shadow") {
					super._onDropItem(_event, itemD);
					return;
				} else {
					this.actor.addFocus(item as Focus);
					return;
				}
			case "item":
				super._onDropItem(_event, itemD);
				return;
			case "weapon":
				super._onDropItem(_event, itemD);
				return;
			case "characterClass":
				this.actor.setClass(item as CClass);
				return;
			case "universalModifier":
				throw new PersonaError("Universal Modifiers can't be added to sheets");
				return;
			default:
				item.system satisfies never;
				throw new Error(`Unknown supported type ${item.type}`);
		}
	}

	async usePower(event: Event) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		const power = this.actor.powers.find(power => power.id ==powerId);
		// const power = PersonaDB.getItemById(powerId);
		if (!power) {
			throw new PersonaError(`Can't find Power Id:${powerId}`);
		}
		const ptype = power.system.type;
		if (ptype!= "power" && ptype != "consumable")
			throw new PersonaError(`powerId pointed to unsualbe power ${powerId}`);
		if (!power) throw new Error(`Can't find power id: ${powerId}`);
		const actor = this.actor;
		let token : PToken;
		if (actor.token) {
			token = actor.token._object;
		} else {
			const tokens = this.actor._dependentTokens.get(game.scenes.current)!;
			//@ts-ignore
			token = Array.from(tokens)[0]._object;
		}
		if (!token) {
			throw new PersonaError(`Can't find token for ${this.actor.name}: ${this.actor.id}` )
		}
		try {
			const results  = await PersonaCombat.usePower(token, power as Usable);
		} catch (e) {
			throw e;
		}
	}

	async deleteTalent(event: Event) {
		const talentId = HTMLTools.getClosestData(event, "talentId");
		if (talentId == undefined) {
			const err = `Can't find talent at index ${talentId}`;
			console.error(err);
			ui.notifications.error(err);
			throw new Error(err);
		}
		if (await HTMLTools.confirmBox("Confirm Delete", "Are you sure you want to delete this talent?")) {
			this.actor.deleteTalent(talentId);
		}

	}

	async deleteFocus(event: Event) {
		const focusId = HTMLTools.getClosestData(event, "focusId");
		if (focusId == undefined) {
			const err = `Can't find talent at index $focusId}`;
			console.error(err);
			ui.notifications.error(err);
			throw new Error(err);
		}
		if (await HTMLTools.confirmBox("Confirm Delete", "Are you sure you want to delete this Focus?")) {
			this.actor.deleteFocus(focusId);
		}
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

	async openPower(event: Event) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		if (powerId == undefined) {
			throw new PersonaError(`Can't find power`);
		}
		const power = this.actor.powers.find(x=> x.id == powerId);
		if (!power) {
			throw new PersonaError(`Can't find power id ${powerId}`);
		}
		await power.sheet.render(true);
	}

	async openTalent(event: Event) {
		const itemType = "Talent";
		const talentId = HTMLTools.getClosestData(event, "talentId");
		if (talentId == undefined) {
			throw new PersonaError(`Can't find ${itemType}`);
		}
		const talent = this.actor.talents.find(x=> x.id == talentId);
		if (!talent) {
			throw new PersonaError(`Can't find ${itemType} id ${talentId}`);
		}
		await talent.sheet.render(true);
		this.actor.system.combat.defenses.fort
	}

	async openFocus(event: Event) {
		const itemType = "Focus";
		const focusId = HTMLTools.getClosestData(event, "focusId");
		if (focusId == undefined) {
			throw new PersonaError(`Can't find ${itemType}`);
		}
		const focus = this.actor.focii.find(x=> x.id == focusId);
		if (!focus) {
			throw new PersonaError(`Can't find ${itemType} id ${focusId}`);
		}
		await focus.sheet.render(true);
	}

	async rollSave(event: Event) {
		await PersonaCombat.rollSave(this.actor, 11);
	}

}
