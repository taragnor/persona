import { HTMLTools } from "../../utility/HTMLTools.js";
import {PersonaItem} from "../persona-item.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

export abstract class PersonaPowerLikeBaseSheet extends PersonaEffectContainerBaseSheet {
	declare item: Usable;

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
    PersonaPowerLikeBaseSheet.powerTagListeners(html, this.item);

	}

  static powerTagListeners(html: JQuery, item: TagPossessor) {
		html.find(".power-tags .addTag").on("click", ev => void this.addTag(ev, item));
		html.find(".power-tags .delTag").on("click", ev => void this.deleteTag(ev, item));

  }

	static async addTag(_event: JQuery.Event, item: TagPossessor) {
		const x = item.system.tags;
		x.push("weapon");
		await item.update({ "system.tags": x});
	}

	static async deleteTag(ev: JQuery.Event, item: TagPossessor) {
		const index = Number(HTMLTools.getClosestData(ev, "tagIndex"));
		const x = item.system.tags;
		x.splice(index, 1);
		await item.update({ "system.tags": x});
	}

}

type TagPossessor = PersonaItem & {system: {tags: Power["system"]["tags"] } };
