/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaError } from "../../persona-error.js";
import { PersonaItem } from "../../item/persona-item.js";
import { PersonaActor } from "../persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PCLikeSheet } from "./pc-like-sheet.js";
import { Power } from "../../item/persona-item.js";
import { Logger } from "../../utility/logger.js";
import { NAVIGATOR_TRIGGERS } from "../../navigator/nav-voice-lines.js";
import {PersonaSounds} from "../../persona-sounds.js";


export class NPCAllySheet extends PCLikeSheet {

	declare actor: NPCAlly;
	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/npc-ally-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [
				{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"},
				{navSelector: ".inventory-tabs", contentSelector: ".inventory-body", initial: "consumables"}
			]
		});
	}

	override CONST() {
		return {
			...super.CONST(),
			NAVIGATOR_TRIGGERS,
		};
	}

	override activateListeners(html: JQuery) {
		super.activateListeners(html);
		html.find(".basic-powers .power-img").rightclick( this.deleteBasicSkill.bind(this));
		html.find(".add-voiceline").on("click", (ev) => void this.addNewVoiceline(ev));
		html.find(".del-voiceline").on("click", (ev) => void this.deleteVoiceline(ev));
		html.find(".play-voiceline").on("click", (ev) => void this.playVoiceLine(ev));
	}

	override async _onDropItem(_event: Event, itemD: unknown, ..._rest:unknown[]) {
		//@ts-expect-error not in foundrytypes
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		const item: PersonaItem = await Item.implementation.fromDropData(itemD);
		switch (item.system.type) {
			case "power": {
				const power = item as Power;
				const actor = this.actor;
				if (power.isNavigator() && !this.isOnLearningTab()) {
					await actor.addNavigatorSkill(power);
					return power;
				}
			}
		}
		return super._onDropItem(_event, itemD);
	}

	async deleteBasicSkill (ev: JQuery.ClickEvent) {
		const index= HTMLTools.getClosestDataNumber(ev, "basicPowerIndex");
		const power = this.actor.basicPowers.at(index);
		if (!power) {throw new PersonaError(`Can't get Power at this index ${index}`);};
		if (!await HTMLTools.confirmBox("Really Delete", `Really Delete ${power.name}`)) {return;}
		switch (true) {
			case power.isNavigator(): {
				return await this.actor.deleteNavigatorSkill(power.id);
			}
			default: {
				throw new PersonaError("Can't delete skill of this stype");
			}
		}
	}

	override async _onDropActor(_event: Event, actorD: unknown) {
		//@ts-expect-error no supported
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		const actor : PersonaActor = await Actor.implementation.fromDropData(actorD);
		switch (actor.system.type) {
			case "npc":
			case "pc" :{
				await this.actor.update({ "system.NPCSocialProxyId" : actor.id});
				await Logger.sendToChat(`${this.actor.name} designaties social Proxy ${actor.name}`, this.actor);
				return undefined;
			}
			case "shadow":
			case "tarot":
			case "npcAlly":
				return undefined;
			default:
				actor.system satisfies never;
				throw new Error(`Unknown unsupported type ${actor.type}`);
		}

	}

	async addNewVoiceline(ev: JQuery.ClickEvent) {
		await HTMLTools.ArrayAddEvent(ev, this.actor);

	}

	async deleteVoiceline(ev: JQuery.ClickEvent) {
		const index = HTMLTools.getClosestDataNumber(ev, "vlIndex");
		if (!await HTMLTools.confirmBox("Delete Sound", "Really Delete this sound?")) {return;}
		await HTMLTools.ArrayDeleteEvent(ev, this.actor, index);

	}

	async playVoiceLine(ev: JQuery.ClickEvent) {
		const file = HTMLTools.getClosestData(ev, "soundFile");
		await PersonaSounds.playFile(file);
	}

}


