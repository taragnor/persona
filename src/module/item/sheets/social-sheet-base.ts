import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { SocialCard } from "../persona-item.js";

export class PersonaSocialSheetBase extends PersonaItemSheetBase {
	override item: SocialCard;


	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".add-token-spend").on("click", this.addTokenSpend.bind(this));
		html.find(".del-token-spend").on("click", this.deleteTokenSpend.bind(this));

	}

	async addTokenSpend(_ev: JQuery.ClickEvent) {
		await this.item.createNewTokenSpend();
	}

	async deleteTokenSpend(ev: JQuery.ClickEvent) {
		const spendIndex= Number(HTMLTools.getClosestData(ev, "spendIndex"));
		await this.item.deleteTokenSpend(spendIndex);
	}

}
