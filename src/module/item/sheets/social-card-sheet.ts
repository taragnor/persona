/* eslint-disable @typescript-eslint/no-unsafe-argument */ import { ROLL_TAGS } from "../../../config/roll-tags.js";
import { CARD_TAGS } from "../../../config/card-tags.js";
import { SIMPLE_SOCIAL_CARD_ROLL_TYPES } from "../../../config/social-card-config.js";
import { CARD_DC_TYPES } from "../../../config/social-card-config.js";
import { FREQUENCY } from "../../../config/frequency.js";
import { THRESHOLD_TYPE } from "../../../config/social-card-config.js";
import { PersonaSocialSheetBase } from "./social-sheet-base.js";
import { Opportunity } from "../../../config/social-card-config.js";
import { PersonaError } from "../../persona-error.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaDB } from "../../persona-db.js";
import { ArrayCorrector } from "../persona-item.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PERK_TYPES } from "../../../config/perk-types.js";
import { CAMEO_TYPES } from "../../../config/cameo-types.js";
import { SOCIAL_CARD_TYPES } from "../../../config/social-card-config.js";
import { SOCIAL_CARD_ROLL_TYPES } from "../../../config/social-card-config.js";
import { STUDENT_SKILLS } from "../../../config/student-skills.js";
import { DAYS } from "../../../config/days.js";
import { SAVE_TYPES_LOCALIZED } from "../../../config/save-types.js";

import { STUDENT_SKILLS_EXT } from "../../../config/student-skills.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

const PRIMARY_SECONDARY = {
	"primary": "persona.term.primary",
	"secondary": "persona.term.secondary",
};

export class PersonaSocialCardSheet extends PersonaSocialSheetBase {
	declare item: SocialCard;
	focusedEvent: number | undefined = undefined;
	static _socialData: Record<string, unknown>;
	static clipboard: {
		event ?: SocialCard["system"]["events"][number];
		choice ?: SocialCard["system"]["events"][number]["choices"][number];
	} = {};

	override async getData() {
		const data = await super.getData();
		data.focusedEvent = this.focusedEvent;
		data.THRESHOLD_TYPE = THRESHOLD_TYPE;
		data.POWERSTUFF =  PersonaEffectContainerBaseSheet.powerStuff;
		data.CONST = {
			DAYS
		};
		data.SOCIAL_DATA = PersonaSocialCardSheet.socialData();
		data.FREQUENCY = FREQUENCY;
		data.SOCIAL_CARD_TYPES = SOCIAL_CARD_TYPES;
		data.CAMEO_TYPES = CAMEO_TYPES;
		data.PERK_TYPES = PERK_TYPES;
		data.PRIMARY_SECONDARY = PRIMARY_SECONDARY;
		data.QUALIFIERS_NAME_LIST = PersonaDB.allSocialCards()
			.flatMap(card => card.system.qualifiers)
			.map(qual=> qual.relationshipName)
			.filter( (val, i, arr) => arr.indexOf(val) == i);
		return data;
	}

	static socialData() {
		if (this._socialData) {
			return this._socialData;
		}
		this._socialData = {
			ROLLTYPES : SOCIAL_CARD_ROLL_TYPES,
			SIMPLE_ROLL_TYPES : SIMPLE_SOCIAL_CARD_ROLL_TYPES,
			STUDENT_SKILLS,
			STUDENT_SKILLS_EXT,
			SAVE_DIFFICULTY: SAVE_TYPES_LOCALIZED,
			ROLL_DC_TYPES: CARD_DC_TYPES,
			FREQUENCY: FREQUENCY,
			CARD_TAGS,
			ROLL_TAGS,
		} as const;
		return this._socialData;
	}

	get powerStuff() {
		const data = PersonaEffectContainerBaseSheet.powerStuff;
		return data;
	}

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/social-card-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "events"}]
		});
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".addCardTag").on("click", this.addCardTag.bind(this));
		html.find(".eventTags .addTag").on("click", this.addEventTag.bind(this));
		html.find(".cardTags .delTag").on("click", this.deleteCardTag.bind(this));
		html.find(".eventTags .delTag").on("click", this.deleteEventTag.bind(this));
		html.find(".add-qualifier").on("click", this.addQualifier.bind(this));
		html.find(".delete-qualifier").on("click", this.deleteQualifier.bind(this));
		html.find(".add-opportunity").on("click", this.addOpportunity.bind(this));
		html.find(".del-opportunity").on("click", this.deleteOpportunity.bind(this));
		html.find(".add-event").on("click", this.addCardEvent.bind(this));
		html.find(".del-event").on("click", this.deleteCardEvent.bind(this));
		html.find(".copy-event").on("click", this.copyEvent.bind(this));
		html.find(".paste-event").on("click", this.pasteEvent.bind(this));
		html.find(".add-choice").on("click", this.addChoice.bind(this));
		html.find(".del-choice").on("click", this.deleteChoice.bind(this));
		html.find(".paste-choice").on("click", this.pasteChoice.bind(this));
		html.find(".copy-choice").on("click", this.copyChoice.bind(this));
		html.find(".event-index li .name").on("click", this.loadCardEvent.bind(this));
		html.find(".card-event .go-back").on("click", this.goBackEventList.bind(this));
	}

	async addCardTag(_ev: JQuery.ClickEvent) {
		await this.item.addCardTag();
		await this.render(false);
	}

	async addEventTag(ev: JQuery.ClickEvent) {
		const eventIndex = HTMLTools.getClosestDataNumber(ev, "eventIndex");
		await this.item.addEventTag(eventIndex);
	}

	async deleteCardTag(ev: JQuery.ClickEvent) {
		const index = HTMLTools.getClosestData(ev, "tagIndex");
		await this.item.deleteCardTag(Number(index));
		await this.render(false);
	}

	async deleteEventTag(ev: JQuery.ClickEvent) {
		const eventIndex = HTMLTools.getClosestDataNumber(ev, "eventIndex");
		const tagIndex = HTMLTools.getClosestDataNumber(ev, "tagIndex");
		await this.item.deleteEventTag(eventIndex, tagIndex);
		await this.render(false);
	}

	async addOpportunity(_ev: JQuery.ClickEvent) {
		const card = this.item;
		const opList = card.system.opportunity_list;
		const newOpportunity : Opportunity = {
			name: "Unnamed Choice",
			choices: 1,
			//TODO: Add this to the actual opportunity sheet, right now doesn't have a conditions entry section
			conditions: [],
			text: "",
			postEffects: { effects: []},
			resourceCost: 0,
			roll: {
				rollType: "none",
				progressCrit: 0,
				progressSuccess: 0,
				progressFail: 0,
				rollTag1: "",
				rollTag2: "",
				rollTag3: "",
			},
		};
		opList.push( newOpportunity);
		await card.update({"system.opportunity_list": opList});
	}

	async deleteOpportunity(ev: JQuery.ClickEvent) {
		const indexStr = HTMLTools.getClosestData(ev, "opportunityIndex");
		const index = Number(indexStr);
		if (Number.isNaN(index)) {
			throw new PersonaError("Bad index on Delete opportunity");
		}
		const card = this.item;
		const opList =card.system.opportunity_list;
		opList.splice(index,1);
		await card.update({"system.opportunity_list": opList});
	}

	async addCardEvent( _ev: JQuery.ClickEvent) {
		await this.item.addCardEvent();
		await this.render(false);
	}


	async deleteCardEvent( ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		if (!await HTMLTools.confirmBox(`Delete Event ${eventIndex}`, "Really delete event?")) {
			return;
		}
		this.focusedEvent = undefined;
		this.element.find(".event-index").show().addClass("hidden");
		this.element.find(".card-event").hide().removeClass("hidden");
		await this.item.deleteCardEvent(eventIndex);
	}

	async addChoice(ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		await this.item.addEventChoice(eventIndex);

	}



	async deleteChoice(ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		const choiceIndex = Number(HTMLTools.getClosestData(ev, "choiceIndex"));
		if (!await HTMLTools.confirmBox(`Delete Choice ${choiceIndex}`, `Really Delete this choice`)) {
			return;
		}
		await this.item.deleteEventChoice(eventIndex,choiceIndex);
	}

	async pasteChoice(ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		const choice = PersonaSocialCardSheet.clipboard.choice;
		if (!choice) {
			ui.notifications.warn("No choice stored in clipboard, nothing to paste");
			return;
		}
		await this.item.addEventChoice(eventIndex, choice);
	}

	copyChoice( ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		const choiceIndex = Number(HTMLTools.getClosestData(ev, "choiceIndex"));
		const choice = this.item.system.events[eventIndex].choices[choiceIndex];
		if (!choice) {
			return;
		}
		ui.notifications.notify("Choice copied to clipboard");
		PersonaSocialCardSheet.clipboard.choice = JSON.parse(JSON.stringify(choice)) as typeof choice;
	}

	async addQualifier(_ev: JQuery.ClickEvent) {
		const qual = ArrayCorrector(this.item.system.qualifiers);
		qual.push({
			relationshipName: "",
			min: 0,
			max: 0
		});
		await this.item.update({"system.qualifiers": qual});
	}

	async deleteQualifier(ev: JQuery.ClickEvent) {
		const index : number = Number(HTMLTools.getClosestData(ev, "qualifierIndex"));
		console.log(`Deleting qualifier - ${index}`);
		if (Number.isNaN(index))  {
			throw new PersonaError("NaN index");
		}
		const qual = ArrayCorrector(this.item.system.qualifiers);
		qual.splice(index, 1);
		await this.item.update({"system.qualifiers": qual});
	}

	loadCardEvent(ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		this.focusedEvent = eventIndex;
		this.element.find(".event-index").hide().addClass("hidden");
		this.element.find(".card-event").each( function () {
			const elem = $(this);
			const index = Number(HTMLTools.getClosestData(elem, "eventIndex"));
			if (index != eventIndex) {elem.hide().addClass("hidden");} else {elem.show().removeClass("hidden");}
		});
	}

	goBackEventList(_ev: JQuery.ClickEvent) {
		this.focusedEvent = undefined;
		this.element.find(".event-index").show().removeClass("hidden");
		this.element.find(".card-event").hide().addClass("hidden");
	}

	copyEvent (ev: JQuery.ClickEvent) {
		const eventIndex = HTMLTools.getClosestDataNumber(ev, "eventIndex");
		const event = this.item.system.events.at(eventIndex);
		if (event) {
			PersonaSocialCardSheet.clipboard.event = JSON.parse(JSON.stringify(event)) as typeof event;
			ui.notifications.notify(`Event ${event.name} copied to Clipboard`);
		}
	}

	async pasteEvent( _ev: JQuery.ClickEvent) {
		const event= PersonaSocialCardSheet.clipboard.event;
		if (!event) {
			ui.notifications.warn("No data to paste");
			return;
		}
		event.name = `${event.name} (copy)`;
		await this.item.addCardEvent(event);
	}

} // end of class
