/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { HTMLTools } from "../../utility/HTMLTools.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

export abstract class PersonaPowerLikeBaseSheet extends PersonaEffectContainerBaseSheet {
	declare item: Usable;

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".power-tags .addTag").on("click", this.addTag.bind(this));
		html.find(".power-tags .delTag").on("click", this.deleteTag.bind(this));

	}

	async addTag(_event: Event) {
		const item = this.item;
		const x = item.system.tags;
		x.push("weapon");
		await this.item.update({ "system.tags": x});
	}

	async deleteTag(ev: Event) {
		const index = Number(HTMLTools.getClosestData(ev, "tagIndex"));
		const item = this.item;
		const x = item.system.tags;
		x.splice(index, 1);
		await this.item.update({ "system.tags": x});
	}


}


