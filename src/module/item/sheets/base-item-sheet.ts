/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { HTMLTools } from "../../utility/HTMLTools.js";
import { Consumable } from "../persona-item.js";
import { PersonaItem } from "../persona-item.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { ConditionalEffectManager } from "../../conditional-effect-manager.js";

export class PersonaItemSheetBase extends ItemSheet<PersonaItem> {

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/item-sheet-base.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		ConditionalEffectManager.applyHandlers(html, this.item);
		html.find(".itemTags .addItemTag").on("click", this.addItemTag.bind(this));
		html.find(".itemTags .delTag").on("click", this.deleteItemTag.bind(this));
	}

	async addItemTag(_ev: JQuery.ClickEvent) {
		await (this.item as Consumable).addItemTag();
	}

	async deleteItemTag(ev: JQuery.ClickEvent) {
		const index = HTMLTools.getClosestData(ev, "tagIndex");
		await (this.item as Consumable).deleteItemTag(Number(index));

	}

	defaultConditionalEffect(_ev: JQuery.ClickEvent): ConditionalEffect {
		const effect : ConditionalEffect = {
			isDefensive: false,
			conditions: [{
				type: "always",
			}],
			consequences: [ {
				type: "none"
			}]
		};
		return effect;
	}

}
