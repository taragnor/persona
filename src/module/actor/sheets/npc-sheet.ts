import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaSocial } from "../../social/persona-social.js";
import { PersonaActor } from "../persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { NoncombatantSheet } from "./noncombatant-sheet.js";

export class NPCSheet extends NoncombatantSheet  {
	declare actor: Subtype<PersonaActor, "npc">;
	#activeQuestion = -1;

	constructor(...args: any[]) {
		super(...args)
		this.refreshFocus();
	}

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
		html.find(".add-question").on("click", this.addQuestion.bind(this));
		html.find(".del-question").on("click", this.deleteQuestion.bind(this));
		html.find(".question-list .question-name").on("click", this.selectQuestion.bind(this));
		html.find(".questions-breakdown .back-button").on("click", this.goBackToIndex.bind(this));
		this.refreshFocus();
		super.activateListeners(html);
	}

	selectQuestion(ev: JQuery.ClickEvent) {
	const index= Number(HTMLTools.getClosestDataNumber(ev, "questionIndex"));
		this.activeQuestion = index;
	}

	set activeQuestion (index: number) {
		this.#activeQuestion = index;
		this.refreshFocus();
	}

	refreshFocus() {
		const index = this.#activeQuestion;
		if (index == -1) {
			this.element.find(".question-list").show();
			this.element.find(".questions-breakdown").hide();
			return;
		}
		this.element.find(".question-list").hide();
		this.element.find(".questions-breakdown").show();
		this.element.find(".questions-breakdown .question").each( function () {
			const elem = $(this);
			const questionIndex = HTMLTools.getClosestDataNumber(elem, "questionIndex");
			if (index != questionIndex) {elem.hide();} else {elem.show();}
		});
	}

	goBackToIndex() {
		this.activeQuestion = -1;
	}

	activatePerk(ev: JQuery.ClickEvent) {
		const target = Array.from(game.user.targets)
			.find( (x: Token<PersonaActor>) => x.actor.system.type == "pc");
		if (target) {
			console.log(`Awarding Perk to ${target?.name}`)
			PersonaSocial.awardPerk(target.actor, this.actor);
		}
	}

	async addQuestion(_ev: JQuery.ClickEvent) {
		await this.actor.addQuestion();
	}

	async deleteQuestion(ev: JQuery.ClickEvent) {
	const index= Number(HTMLTools.getClosestDataNumber(ev, "questionIndex"));
		await this.actor.deleteQuestion(index);
	}

	async addTokenSpend(_ev: JQuery.ClickEvent) {
		await this.actor.createNewTokenSpend();
	}

async deleteTokenSpend(ev: JQuery.ClickEvent) {
	const spendIndex= Number(HTMLTools.getClosestData(ev, "spendIndex"));
	await this.actor.deleteTokenSpend(spendIndex);
}


}

