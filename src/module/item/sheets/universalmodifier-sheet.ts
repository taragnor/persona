/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { HTMLTools } from "../../utility/HTMLTools.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

export class UniversalModifierSheet extends PersonaEffectContainerBaseSheet {
	declare item: UniversalModifier;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/universal-modifier-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override async getData() {
		const data = await super.getData();
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".add-scene").on("click", this.addScene.bind(this));
		html.find(".del-scene").on("click", this.delScene.bind(this));
	}

	async addScene(_event: JQuery.ClickEvent) {
		const arr= this.item.system.sceneList;
		arr.push(
			"" as Scene["id"]
		);
		await this.item.update({"system.sceneList": arr});
	}

	async delScene(event: JQuery.ClickEvent) {
		const index = Number(HTMLTools.getClosestData(event,"sceneIndex"));
		if (Number.isNaN(index)) {
			throw new Error("NaN fuckery");
		}
		const arr= this.item.system.sceneList;
		arr.splice(index, 1);
		await this.item.update({"system.sceneList": arr});
	}

}



