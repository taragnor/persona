import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaSocial } from "../../social/persona-social.js";
import { PersonaActor } from "../persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { NoncombatantSheet } from "./noncombatant-sheet.js";

export class NPCSheet extends NoncombatantSheet  {
	declare actor: Subtype<PersonaActor, "npc">;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/npc-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		html.find(".award-perk").on("click", this.activatePerk.bind(this));
		html.find(".add-token-spend").on("click", this.addTokenSpend.bind(this));
		html.find(".del-token-spend").on("click", this.deleteTokenSpend.bind(this));
		super.activateListeners(html);
	}

	activatePerk(ev: JQuery.ClickEvent) {
		const target = Array.from(game.user.targets)
			.find( (x: Token<PersonaActor>) => x.actor.system.type == "pc");
		if (target) {
			console.log(`Awarding Perk to ${target?.name}`)
			PersonaSocial.awardPerk(target.actor, this.actor);
		}


	}

	async addTokenSpend(_ev: JQuery.ClickEvent) {
		await this.actor.createNewTokenSpend();
	}

async deleteTokenSpend(ev: JQuery.ClickEvent) {
	const spendIndex= Number(HTMLTools.getClosestData(ev, "spendIndex"));
	await this.actor.deleteTokenSpend(spendIndex);
}


}

