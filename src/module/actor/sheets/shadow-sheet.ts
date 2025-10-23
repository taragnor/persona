/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PROBABILITIES } from "../../../config/probability.js";
import { FREQUENCY } from "../../../config/frequency.js";
import { CREATURE_TAGS } from "../../../config/creature-tags.js";
import { SHADOW_CREATURE_TYPE } from "../../../config/shadow-types.js";
import { PersonaDB } from "../../persona-db.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { SHADOW_ROLE } from "../../../config/shadow-types.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaActor } from "../persona-actor.js";
import { CombatantSheetBase } from "./combatant-sheet.js";
import { PersonaError } from "../../persona-error.js";
import { PersonaItem } from "../../item/persona-item.js";

export class ShadowSheet extends CombatantSheetBase {
	declare actor: Subtype<PersonaActor, "shadow">;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/shadow-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [
				{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"},
			]
		});
	}

	override async _onDropItem(_event: Event, itemD: unknown, ..._rest:unknown[]) {
		//@ts-expect-error not in foundrytypes
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		const item: PersonaItem = await Item.implementation.fromDropData(itemD);
		switch (item.system.type) {
			case "talent":
			case "consumable":
			case "power":
			case "focus":
			case "tag":
			case "characterClass":
				return super._onDropItem(_event, itemD);
			case "universalModifier":
				throw new PersonaError("Universal Modifiers can't be added to sheets");
			case "item":
			case "weapon":
			case "socialCard":
			case "skillCard":
				throw new PersonaError("Invalid Item Type to apply to Shadows");
			default:
				item.system satisfies never;
				throw new Error(`Unknown supported type ${item.type}`);
		}
	}

	override async getData() {
		const data = await super.getData();
		data.CREATURE_TAGS = CREATURE_TAGS;
		const TREASURE_LIST = Object.fromEntries(
			[["", "-"]].concat(
				PersonaDB.treasureItems().slice()
				.sort( (a, b) => a.name.localeCompare(b.name))
				.map( x=> [x.id, x.name])
			)
		);
		const SCENE_LIST = Object.fromEntries(
			PersonaDB.dungeonScenes().slice()
			.sort( (a, b) => a.name.localeCompare(b.name))
			.map(x=> [x.id, x.name])
		);
		// SCENE_LIST[""] = "-";
		const databasePowers = this.actor.mainPowers
			.filter (pwr => !pwr.hasTag("shadow-only"))
			.map( x=> PersonaDB.allPowersArr().find(pwr => pwr.name == x.name))
			.filter( x=> x != undefined);
		const CARD_CANDIDATES = Object.fromEntries(
			[["", "-"]].concat(
				databasePowers.map( pwr => [pwr.id, pwr.displayedName.toString()])
			));
		const COMMON_TREASURE_LIST = Object.fromEntries(
			[["", "-"]].concat(
				PersonaDB.treasureItems()
				.filter( item => item.hasTag("common-loot"))
				.sort( (a, b) => a.name.localeCompare(b.name))
				.map( x=> [x.id, x.name])
			)
		);
		data.SHADOW_STUFF =  {
			FREQUENCY_NEW: PROBABILITIES,
			CREATURE_TAGS : CREATURE_TAGS,
			SHADOW_CREATURE_TYPE: SHADOW_CREATURE_TYPE,
			SHADOW_ROLE,
			TREASURE_LIST,
			SCENE_LIST,
			CARD_CANDIDATES,
			COMMON_TREASURE_LIST,
			FREQUENCY,
		};

		data["persona"] = this.actor.persona();
		return data;
	}

	override get template() {
		if (this.actor.hasCreatureTag("d-mon"))
			{return this.options.template;}
		if (game.user.isOwner)
			{return this.options.template;}
		if ( !game.user.isGM && this.actor.limited) {
			return `${HBS_TEMPLATES_DIR}/shadow-limited.hbs`;
		}
		if (!game.user.isGM) {throw new PersonaError("Player trying to access invalid Shadow Sheet");}
		return this.options.template;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find('.addShadowPower').on("click", this.onAddPower.bind(this));
		html.find('.addShadowFocus').on("click", this.onAddFocus.bind(this));
		html.find(".recost-power").on("click", this.onRecostPower.bind(this));
		html.find(".add-dungeon").on("click", this.addDungeon.bind(this));
		html.find(".del-dungeon").on("click", this.deleteDungeon.bind(this));
		html.find(".dmon-convert").on("click", this.convertToDMon.bind(this));
		html.find(".persona-convert").on("click", this.convertToPersona.bind(this));
		html.find(".copy-to-compendium").on("click", this.copyToCompendium.bind(this));
	}

	async onAddPower( _ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Power",
			type: "power",
		}]);
	}

	override async onAddFocus(_ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Focus",
			type: "focus",
		}]);
	}

	async onRecostPower(event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		const power = this.actor.powers.find(power => power.id == powerId);
		if (!power) {return;}
		await this.actor.setDefaultShadowCosts(power);
	}

	async addDungeon(_event: JQuery.ClickEvent) {
		const arr= this.actor.system.encounter.dungeonEncounters;
		arr.push({
			dungeonId: game.scenes.current.id,
			frequency: 1,
			frequencyNew: "normal",
		});
		await this.actor.update({"system.encounter.dungeonEncounters": arr});
	}

	async deleteDungeon(event: JQuery.ClickEvent) {
		const index = Number(HTMLTools.getClosestData(event,"dungeonIndex"));
		const arr= this.actor.system.encounter.dungeonEncounters;
		arr.splice(index, 1);
		await this.actor.update({"system.encounter.dungeonEncounters": arr});
	}

	async convertToDMon() {
		await this.actor.toDMon();
	}

	async convertToPersona() {
		await this.actor.toPersona();
	}

	async copyToCompendium() {
		await this.actor.copyToCompendium();
	}
}


