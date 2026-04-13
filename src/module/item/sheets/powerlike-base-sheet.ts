import { HTMLTools } from "../../utility/HTMLTools.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

export abstract class PersonaPowerLikeBaseSheet extends PersonaEffectContainerBaseSheet {
	declare item: Usable;

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
    PersonaPowerLikeBaseSheet.powerTagListeners(html, this.item);

	}

  static powerTagListeners(html: JQuery, item: Usable) {
		html.find(".power-tags .addTag").on("click", ev => void this.addTag(ev, item));
		html.find(".power-tags .delTag").on("click", ev => void this.deleteTag(ev, item));

  }

	static async addTag(_event: JQuery.Event, item: Usable) {
		const x = item.system.tags;
		x.push("weapon");
		await item.update({ "system.tags": x});
	}

	static async deleteTag(ev: JQuery.Event, item: Usable) {
		const index = Number(HTMLTools.getClosestData(ev, "tagIndex"));
		const x = item.system.tags;
		x.splice(index, 1);
		await item.update({ "system.tags": x});
	}


}


