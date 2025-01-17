import { Logger } from "../../utility/logger.js";
import { Helpers } from "../../utility/helpers.js";
import { PersonaError } from "../../persona-error.js";
import { PersonaCombat } from "../../combat/persona-combat.js";
import { PToken } from "../../combat/persona-combat.js";
import { Usable } from "../../item/persona-item.js";

import { HTMLTools } from "../../utility/HTMLTools.js";
import { CClass } from "../../item/persona-item.js";

import { PersonaItem } from "../../item/persona-item.js";
import { PersonaActorSheetBase } from "./actor-sheet.base.js";
import { PC } from "../persona-actor.js";
import { Shadow } from "../persona-actor.js";
import { Talent } from "../../item/persona-item.js";
import { Power } from "../../item/persona-item.js";
import { Focus } from "../../item/persona-item.js";

export abstract class CombatantSheetBase extends PersonaActorSheetBase {
	declare actor: PC | Shadow;

	override async getData () {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".delPower").on("click", this.deletePower.bind(this));
		html.find(".delFocus").on("click", this.deleteFocus.bind(this));
		html.find(".delTalent").on("click", this.deleteTalent.bind(this));
		html.find(".rollPower").on("click", this.usePower.bind(this));
		html.find(".rollItem").on("click", this.useItem.bind(this));
		html.find(".powerName").on("click", this.openPower.bind(this));
		html.find(".talentName").on("click", this.openTalent.bind(this));
		html.find(".focusName").on("click", this.openFocus.bind(this));
		html.find(".itemName").on("click", this.openItem.bind(this));
		html.find(".rollSave").on("click", this.rollSave.bind(this));
		html.find(".incremental-advance-block .hp .add").on("click", this.addIncremental_HP.bind(this));
		html.find(".incremental-advance-block .mp .add").on("click", this.addIncremental_MP.bind(this));
		html.find(".incremental-advance-block .wpnDamage .add").on("click", this.addIncremental_wpnDamage.bind(this));
	}

	override async _onDropItem(_event: Event, itemD: unknown, ..._rest:any[]) {
		//@ts-ignore
		const item: PersonaItem = await Item.implementation.fromDropData(itemD);
		switch (item.system.type) {
			case "talent":
				this.actor.addTalent(item as Talent);
				return undefined;
			case "consumable":
				return super._onDropItem(_event, itemD);
			case "power": {
				const actorType = this.actor.system.type;
				switch (actorType) {
					case "shadow":
						return super._onDropItem(_event, itemD);
					case "pc":
						if ((item as Power).isTeamwork()) {
							await (this.actor as PC).setTeamworkMove(item as Power);
							return item;
						}
						await (this.actor as PC).addPower(item as Power);
						return item ;
					default:
						actorType satisfies never;
						throw new PersonaError(`Unsupported Type ${actorType}`);
				}
			}
			case "focus":
				if (this.actor.system.type != "pc") {
					return super._onDropItem(_event, itemD);
				} else {
					(this.actor as PC).addFocus(item as Focus);
					return item;
				}
			case "item":
				return super._onDropItem(_event, itemD);
			case "weapon":
				return super._onDropItem(_event, itemD);
			case "characterClass":
				this.actor.setClass(item as CClass);
				return item;
			case "universalModifier":
				throw new PersonaError("Universal Modifiers can't be added to sheets");
			case "socialCard":
				return undefined;
			default:
				item.system satisfies never;
				throw new Error(`Unknown supported type ${item.type}`);
		}
	}

	async usePower(event: Event) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		const power = this.actor.powers.find(power => power.id == powerId);
		if (!power) {
			throw new PersonaError(`Can't find Power Id:${powerId}`);
		}
		const ptype = power.system.type;
		if (ptype != "power" && ptype != "consumable")
			throw new PersonaError(`powerId pointed to unsualbe power ${powerId}`);
		this.#useItemOrPower(power);
	}

	async #useItemOrPower(power : Usable) {
		Helpers.pauseCheck();
		const actor = this.actor;
		let token : PToken | undefined;
		if (actor.token) {
			token = actor.token as PToken;
		} else {
			const tokens = this.actor._dependentTokens.get(game.scenes.current)!;
			//@ts-ignore
			token = Array.from(tokens)[0].object;
		}
		if (!token) {
			token = game.scenes.current.tokens.find(tok => tok.actorId == actor.id) as PToken;
		}

		if (!token) {
			throw new PersonaError(`Can't find token for ${this.actor.name}: ${this.actor.id}` )
		}
		try {
			await PersonaCombat.usePower(token, power as Usable);
		} catch (e) {
			console.error(e);
			throw e;
		}

	}

	async useItem(event: Event) {
		const itemId = HTMLTools.getClosestData(event, "itemId");
		const item = this.actor.inventory.find(item => item.id ==itemId);
		if (!item) {
			throw new PersonaError(`Can't find Item Id:${itemId}`);
		}
		const itype = item.system.type;
		if (itype != "consumable") {
			throw new PersonaError(`itemId pointed to unsualbe power ${itemId}`);
		}
		this.#useItemOrPower(item as Usable);
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

	async openItem(event: Event) {
		const itemType = "Inventory Item";
		const itemId = HTMLTools.getClosestData(event, "itemId");
		const item = this.actor.inventory.find(x=> x.id == itemId);
		if (!item) {
			throw new PersonaError(`Can't find ${itemType} id ${itemId}`);
		}
		await item.sheet.render(true);
	}

	async rollSave(_event: Event) {
		await PersonaCombat.rollSave(this.actor, {
			DC:11, label:"Manual Save", askForModifier:true});
	}

	async addIncremental_HP(_ev: JQuery.ClickEvent) {
		const target = "hp";
		const current = this.actor.system.combat.classData.incremental[target];
		if (current <3) {
			await this.actor.update({
				"system.combat.classData.incremental.hp" : current +1});
			if (this.actor.system.type == "pc") {
				Logger.sendToChat(`${this.actor.name} took incremental for ${target} and raised it to ${current+1} from ${current}`, this.actor);
			}
		}
	}

	async addIncremental_MP(_ev: JQuery.ClickEvent) {
		const target = "mp";
		const current = this.actor.system.combat.classData.incremental[target];
		if (current <3) {
			await this.actor.update({
				"system.combat.classData.incremental.mp" : current +1});
			if (this.actor.system.type == "pc") {
				Logger.sendToChat(`${this.actor.name} took incremental for ${target} and raised it to ${current+1} from ${current}`, this.actor);
			}
		}
	}


	async addIncremental_wpnDamage(_ev: JQuery.ClickEvent) {
		const target = "wpnDamage";
		const current = this.actor.system.combat.classData.incremental[target];
		if (current <3) {
			await this.actor.update({
				"system.combat.classData.incremental.wpnDamage" : current +1});
			if (this.actor.system.type == "pc") {
				Logger.sendToChat(`${this.actor.name} took incremental for ${target} and raised it to ${current+1} from ${current}`, this.actor);
			}
		}
	}

}
