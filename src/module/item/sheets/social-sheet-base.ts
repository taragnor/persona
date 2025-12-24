import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";

export class PersonaSocialSheetBase extends PersonaItemSheetBase {
	declare item: SocialCard;


	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".add-token-spend").on("click", ev => void this.addTokenSpend(ev));
		html.find(".del-token-spend").on("click", ev => void this.deleteTokenSpend(ev));

	}

	async addTokenSpend(_ev: JQuery.ClickEvent) {
		await this.item.createNewTokenSpend();
	}

	async deleteTokenSpend(ev: JQuery.ClickEvent) {
		const spendIndex= Number(HTMLTools.getClosestData(ev, "spendIndex"));
		await this.item.deleteTokenSpend(spendIndex);
	}

}
