/* eslint-disable @typescript-eslint/no-unsafe-argument */ import { PERSONA_STATS } from "../../../config/persona-stats.js";
import { PersonaError } from "../../persona-error.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { ConditionalEffectManager } from "../../conditional-effect-manager.js";
import { DEFENSE_CATEGORY } from "../../../config/defense-categories.js";
import { RESIST_STRENGTHS } from "../../../config/damage-types.js";
import { PersonaActor } from "../persona-actor.js";
import { TAROT_DECK } from "../../../config/tarot.js";
import { DAMAGETYPES } from "../../../config/damage-types.js";
import { INCREMENTAL_ADVANCES } from "../../../config/incremental-advance-types.js";
import { INCREMENTAL_ADVANCE_TYPES } from "../../../config/incremental-advance-types.js";
import { STUDENT_SKILLS } from "../../../config/student-skills.js";
import { AVAILABILITY } from "../../../config/availability-types.js";
import { PersonaDB } from "../../persona-db.js";
import { DAYS } from "../../../config/days.js";
import {REAL_DEFENSE_TYPES} from "../../../config/defense-types.js";
import {PersonaEffectContainerBaseSheet} from "../../item/sheets/effect-container.js";
import {TarotPrinter} from "../../printers/tarot-list.js";
import {TalentPrinter} from "../../printers/talent-list.js";

export abstract class PersonaActorSheetBase extends foundry.appv1.sheets.ActorSheet<PersonaActor> {

	#activeQuestion = -1;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(...args: any[]) {
		super(...args);
		this.refreshQuestionFocus();
	}

	override async getData() {
		await PersonaDB.waitUntilLoaded();
		const data= await super.getData();
		data.RELATIONSHIP_TYPES_LIST = PersonaDB.allSocialCards()
			.flatMap(card => card.system.qualifiers)
			.map(qual=> qual.relationshipName)
			.filter( (val, i, arr) => arr.indexOf(val) == i);
		data.RELATIONSHIP_TYPES = Object.fromEntries(
			(data.RELATIONSHIP_TYPES_LIST as string[])
			.map(x=> ([x,x]))
		);
		data.POWERSTUFF = PersonaEffectContainerBaseSheet.powerStuff;

		data.CONST = {
			...this.CONST(),
			//checkbox types only
			INC: INCREMENTAL_ADVANCE_TYPES.map(x=> ({
				local: INCREMENTAL_ADVANCES[x],
				varname: x,
				val: this.getIncAdvanceValue(x),
			}))
		};
		return data;
	}

	CONST() {
		return PersonaActorSheetBase.CONST();
	}

	static CONST() {
		let USERS = Object.fromEntries(
			game.users.contents
			.map(user=> [user.id, user.name])
		);
		USERS = foundry.utils.mergeObject( {"" : ""}, USERS);
		const PERSONA_STATS_PLUS_EMPTY = {
			"": "",
			...PERSONA_STATS
		};
		return {
			DAYS,
			STUDENT_SKILLS,
			AVAILABILITY,
			DEFENSE_CATEGORY,
			TAROT  : TAROT_DECK,
			RESIST_STRENGTHS : RESIST_STRENGTHS,
			DAMAGETYPES : DAMAGETYPES,
			PERSONA_STATS,
			PERSONA_STATS_PLUS_EMPTY,
			USERS,
			REAL_DEFENSE_TYPES,
		} as const;
	}

	override _onChangeTab(event:unknown, x: unknown, y: unknown) {
		super._onChangeTab(event, x, y);
		this.element.find("textarea").each(function () {
			PersonaActorSheetBase.autoResize(this);
		});
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		ConditionalEffectManager.applyHandlers(html, this.actor);
		html.find(".creatureTags .delTag").on("click", this.deleteCreatureTag.bind(this));
		html.find('.addCreatureTag').on("click", this.onAddCreatureTag.bind(this));
		html.find(".delFocus").on("click", this.deleteFocus.bind(this));
		html.find(".addFocus").on("click", this.onAddFocus.bind(this));
		html.find(".focusName").on("click", this.openFocus.bind(this));
		html.find("textarea").on("input", this.autoResize.bind(this));
		html.find(".add-question").on("click", this.addQuestion.bind(this));
		html.find(".del-question").on("click", this.deleteQuestion.bind(this));
		html.find(".question-list .question-name").on("click", this.selectQuestion.bind(this));
		html.find(".questions-breakdown .back-button").on("click", this.goBackToIndex.bind(this));
		html.find(".showTarotList").on("click", (ev) => this.showTarotTable(ev));
		html.find(".showTalentsTable").on("click", (ev) => this.showTalentTable(ev));
		this.refreshQuestionFocus();
	}

	refreshQuestionFocus() {
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

	set activeQuestion (index: number) {
		this.#activeQuestion = index;
		this.refreshQuestionFocus();
	}

	goBackToIndex() {
		this.activeQuestion = -1;
	}

	async addQuestion(_ev: JQuery.ClickEvent) {
		if (!this.actor.isPC() && !this.actor.isNPC()) {return;}
		await this.actor.addQuestion();
	}

	async deleteQuestion(ev: JQuery.ClickEvent) {
		if (!this.actor.isPC() && !this.actor.isNPC()) {return;}
		if (!await HTMLTools.confirmBox("Delete?", "Delete This question?")) {return;}
		const index= Number(HTMLTools.getClosestDataNumber(ev, "questionIndex"));
		await this.actor.deleteQuestion(index);
	}

	selectQuestion(ev: JQuery.ClickEvent) {
		if (!this.actor.isPC() && !this.actor.isNPC()) {return;}
		const index= Number(HTMLTools.getClosestDataNumber(ev, "questionIndex"));
		this.activeQuestion = index;
	}

	static autoResize(el: HTMLElement) {
		if (el.scrollHeight == 0) {return;}
		el.style.height = 'auto'; // Reset to shrink if needed
		el.style.height = el.scrollHeight + 'px'; // Set to actual content height
		el.style.minHeight = el.scrollHeight + 'px'; // Set to actual content height
	}

	autoResize( ev: JQuery.ClickEvent) {
		console.log("Resizing Text area?!");
		PersonaActorSheetBase.autoResize(ev.target);
	}

	async onAddCreatureTag( _ev: JQuery.ClickEvent) {
		await this.actor.addCreatureTag();
	}

	async deleteCreatureTag(ev: JQuery.ClickEvent) {
		const index = HTMLTools.getClosestData(ev, "tagIndex");
		await this.actor.deleteCreatureTag(Number(index));
	}

	async deleteFocus(event: Event) {
		const focusId = HTMLTools.getClosestData(event, "focusId");
		if (focusId == undefined) {
			const err = `Can't find talent at index $focusId}`;
			throw new PersonaError(err);
		}
		if (await HTMLTools.confirmBox("Confirm Delete", "Are you sure you want to delete this Focus?")) {
			await this.actor.deleteFocus(focusId);
		}
	}


	async onAddFocus(_ev: Event) {
		await this.actor.createEmbeddedDocuments( "Item", [{
			name: "New Social Link Benefit",
			type: "focus",
		}]);
	}

	async openFocus(event: Event) {
		const itemType = "Focus";
		const focusId = HTMLTools.getClosestData(event, "focusId");
		if (focusId == undefined) {
			throw new PersonaError(`Can't find ${itemType}`);
		}
		const focus = this.actor.focii()
			.find(x=> x.id == focusId)
			?? PersonaDB.tarotCards().find(x=> x.items.find(x=> x.id == focusId))
			?.items.find(x=> x.id == focusId) ;
		if (!focus) {
			throw new PersonaError(`Can't find ${itemType} id ${focusId}`);
		}
		await focus.sheet.render(true);
	}

	defaultConditionalEffect(_ev: JQuery.ClickEvent): ConditionalEffect {
		const effect : ConditionalEffect = {
			isEmbedded: false,
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


	getIncAdvanceValue(val: keyof PC["system"]["combat"]["classData"]["incremental"]) {
		const actor = this.actor;
		switch (actor.system.type) {
			case "npc":
			case "tarot":
				return false;
			default:
				return actor.system.combat.classData.incremental[val];
		}
	}

	showTarotTable(_ev: JQuery.ClickEvent) {
		void TarotPrinter.open();
	}

	showTalentTable(_ev : JQuery.ClickEvent) {
		void TalentPrinter.open();
	}
}

Hooks.on("renderActorSheet", (sheet: PersonaActorSheetBase) => {
	sheet.element.find("textarea").each(function () {
		PersonaActorSheetBase.autoResize(this);
	});
});
