import { PersonaRoller } from "../../persona-roll.js";
import { PersonaDB } from "../../persona-db.js";
import { UsableAndCard } from "../../item/persona-item.js";
import { NPCAlly } from "../persona-actor.js";
import { Consumable } from "../../item/persona-item.js";
import { Logger } from "../../utility/logger.js";
import { Helpers } from "../../utility/helpers.js";
import { PersonaError } from "../../persona-error.js";
import { PersonaCombat } from "../../combat/persona-combat.js";
import { PToken } from "../../combat/persona-combat.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { CClass } from "../../item/persona-item.js";
import { PersonaItem } from "../../item/persona-item.js";
import { PersonaActorSheetBase } from "./actor-sheet.base.js";
import { PC } from "../persona-actor.js";
import { ValidAttackers } from "../../combat/persona-combat.js";
import { Talent } from "../../item/persona-item.js";
import { Power } from "../../item/persona-item.js";
import { Focus } from "../../item/persona-item.js";

export abstract class CombatantSheetBase extends PersonaActorSheetBase {
	declare actor: ValidAttackers;

	override async getData () {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".levelUp").on("click", this.levelUp.bind(this));
		html.find(".delPower").on("click", this.deletePower.bind(this));
		html.find(".delFocus").on("click", this.deleteFocus.bind(this));
		html.find(".delTalent").on("click", this.deleteTalent.bind(this));
		html.find(".rollPower").on("click", this.usePower.bind(this));
		html.find(".rollPower").rightclick(this.displayDamageStack.bind(this));
		html.find(".rollItem").on("click", this.useItem.bind(this));
		html.find(".powerName").on("click", this.openPower.bind(this));
		html.find(".talentName").on("click", this.openTalent.bind(this));
		html.find(".focusName").on("click", this.openFocus.bind(this));
		html.find(".itemName").on("click", this.openItem.bind(this));
		html.find(".rollSave").on("click", this.rollSave.bind(this));
		html.find(".incremental-advance-block .hp .add").on("click", this.addIncremental_HP.bind(this));
		html.find(".incremental-advance-block .mp .add").on("click", this.addIncremental_MP.bind(this));
		html.find(".incremental-advance-block .wpnDamage .add").on("click", this.addIncremental_wpnDamage.bind(this));
		html.find(".incremental-advance-block .attack .add").on("click", this.addIncremental_attack.bind(this));
		html.find(".incremental-advance-block .defense .add").on("click", this.addIncremental_defense.bind(this));
		html.find(".incremental-advance-block .initiative .add").on("click", this.addIncremental_initiative.bind(this));
		html.find("button.random-incremental").on("click", this.randomIncremental.bind(this));
		html.find(".powerName").on("mouseover", this.createDamageEstimate.bind(this));
		html.find(".power-img").on("mouseover", this.createDamageEstimate.bind(this));
	}

	override async _onDropItem(_event: Event, itemD: unknown, ..._rest:any[]) {
		Helpers.ownerCheck(this.actor);
		//@ts-ignore
		const item: PersonaItem = await Item.implementation.fromDropData(itemD);
		console.debug(`${item.system.type} dropped on sheet of ${this.actor}`);
		switch (item.system.type) {
			case "talent":
				this.actor.addTalent(item as Talent);
				return undefined;
			case "power": {
				const actorType = this.actor.system.type;
				const power = item as Power;
				switch (actorType) {
					case "shadow":
						await this.actor.addPower(power);
						return power;
					case "pc":
					case "npcAlly":
						const actor = this.actor as PC | NPCAlly;
						if (power.isTeamwork()) {
							await actor.setTeamworkMove(power);
							if (power.isNavigator()) {
								ui.notifications.warn("This cahracter can't use a navigator skill");
								return undefined;
							}
							return power;
						}
						if (power.hasTag("shadow-only")) {
							ui.notifications.warn(`Can't take Shadow only power ${item.name}`);
							return;
						}
						if (power.system.slot > this.actor.maxSlot()) {
							ui.notifications.warn(`Power is too strong for you`);
							return;
						}
						if (!game.user.isGM && power.hasTag("exotic")) {
							ui.notifications.warn(`Can't directly take exotic power : ${item.name}`);
							return;
						}
						await actor.addPower(item as Power);
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
			case "skillCard":
			case "consumable":
				if (!game.user.isGM) {
					ui.notifications.warn("Use Item Piles functionality to move items.");
					return undefined;
				}
				const existing = this.actor.items.find( x=> x.system.type == item.system.type && ("amount" in x.system) && x.name == item.name);
				if (existing != undefined && existing.system.type == 'consumable') {
					console.log("Adding to existing amount");
					await (existing as Consumable).addItem(item.system.amount ?? 1);
					return existing;
				}
				return super._onDropItem(_event, itemD);
			case "item":
			case "weapon":
				if (!game.user.isGM) {
					ui.notifications.warn("Use Item Piles functionality to move items.");
					return undefined;
				}
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
				throw new Error(`Unknown supported type ${item["system"]["type"]}`);
		}
	}

	async usePower(event: Event) {
		Helpers.ownerCheck(this.actor);
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

	async #useItemOrPower(power : UsableAndCard) {
		Helpers.pauseCheck();
		Helpers.ownerCheck(this.actor);
		const actor = this.actor;
		let token : PToken | undefined;
		if (actor.token) {
			token = actor.token as PToken;
		} else {
			const tokens = this.actor._dependentTokens.get(game.scenes.current)!;
			//THIS IS PROBABLY A bad idea to iterate over weakset
			//@ts-ignore
			token = Array.from(tokens)[0];
		}
		if (!token) {
			token = game.scenes.current.tokens.find(tok => tok.actorId == actor.id) as PToken;
		}

		if (!token) {
			throw new PersonaError(`Can't find token for ${this.actor.name}: ${this.actor.id}` )
		}
		try {
			await PersonaCombat.usePower(token, power );
		} catch (e) {
			if (e instanceof Error) {
				console.error(e);
				console.error(e.stack);
				PersonaError.softFail("Problem with Using Item or Power", e, e.stack);
			}
			return;
		}

	}

	async useItem(event: Event) {
		const itemId = HTMLTools.getClosestData(event, "itemId");
		const item = this.actor.inventory.find(item => item.id ==itemId);
		if (!item) {
			throw new PersonaError(`Can't find Item Id:${itemId}`);
		}
		if (item.isUsable() == false) {
			throw new PersonaError(`item ${item.name} isn't usable`);
		}
		this.#useItemOrPower(item);
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
		const power = this.actor.powers.find(x=> x.id == powerId) ?? PersonaDB.allPowers().find(pwr => pwr.id == powerId);
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
		const roll = await PersonaRoller.rollSave(this.actor, {
			DC:11, label:"Manual Save", askForModifier:true,
			rollTags: []
		});
		await roll.toModifiedMessage(false);
	}

	async addIncremental_HP(_ev: JQuery.ClickEvent) {
		const target = "hp";
		const current = this.actor.system.combat.classData.incremental[target];
		const max = this.actor.maxIncrementalAdvancesInCategory(target);
		if (current < max) {
			await this.actor.update({
				"system.combat.classData.incremental.hp" : current +1});
			if (this.actor.isPC() || this.actor.isNPCAlly()) {
				Logger.sendToChat(`${this.actor.name} took incremental for ${target} and raised it to ${current+1} from ${current}`, this.actor);
			}
		}
	}

	async addIncremental_MP(_ev: JQuery.ClickEvent) {
		const target = "mp";
		const current = this.actor.system.combat.classData.incremental[target];
		const max = this.actor.maxIncrementalAdvancesInCategory(target);
		if (current < max) {
			await this.actor.update({
				"system.combat.classData.incremental.mp" : current +1});
			if (this.actor.isPC() || this.actor.isNPCAlly()) {
				Logger.sendToChat(`${this.actor.name} took incremental for ${target} and raised it to ${current+1} from ${current}`, this.actor);
			}
		}
	}

	async addIncremental_wpnDamage(_ev: JQuery.ClickEvent) {
		const target = "wpnDamage";
		const current = this.actor.system.combat.classData.incremental[target];
		const max = this.actor.maxIncrementalAdvancesInCategory(target);
		if (current < max) {
			await this.actor.update({
				"system.combat.classData.incremental.wpnDamage" : current +1});
			if (this.actor.isPC() || this.actor.isNPCAlly()) {
				Logger.sendToChat(`${this.actor.name} took incremental for ${target} and raised it to ${current+1} from ${current}`, this.actor);
			}
		}
	}

	async addIncremental_attack(_ev: JQuery.ClickEvent) {
		const target = "attack";
		const current = this.actor.system.combat.classData.incremental[target];
		const max = this.actor.maxIncrementalAdvancesInCategory(target);
		if (current < max) {
			await this.actor.update({
				"system.combat.classData.incremental.attack" : current +1});
			if (this.actor.isPC() || this.actor.isNPCAlly()) {
				Logger.sendToChat(`${this.actor.name} took incremental for ${target} and raised it to ${current+1} from ${current}`, this.actor);
			}
		}
	}
	async addIncremental_defense(_ev: JQuery.ClickEvent) {
		const target = "defense";
		const current = this.actor.system.combat.classData.incremental[target];
		const max = this.actor.maxIncrementalAdvancesInCategory(target);
		if (current <max) {
			await this.actor.update({
				"system.combat.classData.incremental.defense" : current +1});
			if (this.actor.isPC() || this.actor.isNPCAlly()) {
				Logger.sendToChat(`${this.actor.name} took incremental for ${target} and raised it to ${current+1} from ${current}`, this.actor);
			}
		}
	}
	async addIncremental_initiative(_ev: JQuery.ClickEvent) {
		const target = "initiative";
		const current = this.actor.system.combat.classData.incremental[target];
		const max = this.actor.maxIncrementalAdvancesInCategory(target);
		if (current < max) {
			await this.actor.update({
				"system.combat.classData.incremental.initiative" : current +1});
			if (this.actor.isPC() || this.actor.isNPCAlly()) {
				Logger.sendToChat(`${this.actor.name} took incremental for ${target} and raised it to ${current+1} from ${current}`, this.actor);
			}
		}
	}

	async randomIncremental(_ev: JQuery.ClickEvent) {
		await this.actor.levelUp_Incremental();

	}

	async levelUp(_event: Event) {
		if (!game.user.isGM) return;
		if (await HTMLTools.confirmBox("Level Up", "Level Up Character")) {
			await this.actor.levelUp_full();
		}

	}

	async displayDamageStack(event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		if (powerId == undefined) {
			throw new PersonaError(`Can't find power`);
		}
		const power = this.actor.powers.find(x=> x.id == powerId) ?? (PersonaDB.getItemById(powerId) as Power);
		if (!power) {
			throw new PersonaError(`Can't find power id ${powerId}`);
		}
		power.displayDamageStack(this.actor);
	}

	async createDamageEstimate( ev: JQuery.MouseOverEvent) {
		const powerId = HTMLTools.getClosestData(ev, "powerId");
		const power = this.actor.powers.find(x=> x.id == powerId) ?? PersonaDB.getItemById(powerId);
		const CONST = PersonaActorSheetBase.CONST();

		const html = await renderTemplate("systems/persona/parts/power-tooltip.hbs", {actor :this.actor, power, CONST});
		$(ev.currentTarget).prop('title', html);
	}

}
