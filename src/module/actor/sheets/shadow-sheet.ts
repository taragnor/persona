import { CREATURE_TAGS } from "../../../config/creature-tags.js";
import { SHADOW_CREATURE_TYPE } from "../../../config/shadow-types.js";
import { PersonaDB } from "../../persona-db.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { SHADOW_ROLE } from "../../../config/shadow-types.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaActor } from "../persona-actor.js";
import { CombatantSheetBase } from "./combatant-sheet.js";

export class ShadowSheet extends CombatantSheetBase {
	declare actor: Subtype<PersonaActor, "shadow">;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/shadow-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override async getData() {
		const data = await super.getData();
		data.CREATURE_TAGS = CREATURE_TAGS;
		data.SHADOW_CREATURE_TYPE= SHADOW_CREATURE_TYPE;
		data.SHADOW_ROLE = SHADOW_ROLE;
		data.TREASURE_LIST = Object.fromEntries(
			PersonaDB.treasureItems()
			.sort( (a, b) => a.name.localeCompare(b.name))
			.map( x=> [x.id, x.name])
		);
		data.SCENE_LIST = Object.fromEntries(
			PersonaDB.dungeonScenes()
			.sort( (a, b) => a.name.localeCompare(b.name))
			.map(x=> [x.id, x.name])
		);

		return data;
	}

	override get template() {
		if ( !game.user.isGM && this.actor.limited) {
			return `${HBS_TEMPLATES_DIR}/shadow-limited.hbs`;
		}
		if (!game.user.isGM) return "";
		return this.options.template;
	}


	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".creatureTags .delTag").on("click", this.deleteCreatureTag.bind(this));
		html.find('.addCreatureTag').on("click", this.onAddCreatureTag.bind(this));
		html.find('.addShadowPower').on("click", this.onAddPower.bind(this));
		html.find('.addShadowFocus').on("click", this.onAddFocus.bind(this));
		html.find(".recost-power").on("click", this.onRecostPower.bind(this));
		html.find(".add-dungeon").on("click", this.addDungeon.bind(this));
		html.find(".del-dungeon").on("click", this.deleteDungeon.bind(this));
	}

	async onAddCreatureTag( _ev: JQuery.ClickEvent) {
		await this.actor.addCreatureTag();
	}

	async deleteCreatureTag(ev: JQuery.ClickEvent) {
		const index = HTMLTools.getClosestData(ev, "tagIndex");
		await this.actor.deleteCreatureTag(Number(index));

	}

	async onAddPower( _ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Power",
			type: "power",
		}]);
	}

	async onAddFocus(_ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Focus",
			type: "focus",
		}]);
	}

	async onRecostPower(event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		const power = this.actor.powers.find(power => power.id == powerId);
		if (!power) return;
		this.actor.setDefaultShadowCosts(power);
	}

	async addDungeon(_event: JQuery.ClickEvent) {
		const arr= this.actor.system.encounter.dungeons;
		arr.push("");
		await this.actor.update({"system.encounter.dungeons": arr});
	}

	async deleteDungeon(event: JQuery.ClickEvent) {
		const index = Number(HTMLTools.getClosestData(event,"dungeonIndex"));
		const arr= this.actor.system.encounter.dungeons;
		arr.splice(index, 1);
		await this.actor.update({"system.encounter.dungeons": arr});
	}

}

