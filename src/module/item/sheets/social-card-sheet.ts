import { ConditionalEffectManager } from "../../conditional-effect-manager.js";
import { FREQUENCY } from "../../../config/frequency.js";
import { THRESHOLD_TYPE } from "../../../config/social-card-config.js";
import { PersonaSocialSheetBase } from "./social-sheet-base.js";
import { Opportunity } from "../../../config/social-card-config.js";
import { PersonaError } from "../../persona-error.js";
import { SocialCard } from "../persona-item.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaDB } from "../../persona-db.js";
import { ArrayCorrector } from "../persona-item.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PERK_TYPES } from "../../../config/perk-types.js";
import { CAMEO_TYPES } from "../../../config/cameo-types.js";
import { SOCIAL_CARD_TYPES } from "../../../config/social-card-config.js";
import { SOCIAL_CARD_ROLL_TYPES } from "../../../config/social-card-config.js";
import { STUDENT_SKILLS } from "../../../config/student-skills.js";
import { PersonaEffectContainerBaseSheet } from "./effect-container.js";
import { DAYS } from "../../../config/days.js";
import { SAVE_TYPES_LOCALIZED } from "../../../config/save-types.js";

type CardLocationTypes = [
	{
		name: "opportunity-roll",
		opportunityIndex: number,
	},
	{
		name: "card-modifiers"
	},
	{
		name: "opportunity-condition",
		opportunityIndex: number,
	},
	{
		name: "event-choice-effects",
		eventIndex: number,
		choiceIndex: number
	},
	{
		name: "event-choice-conditions",
		eventIndex: number,
		choiceIndex: number
	},
	{
		name: "card-conditions",
	},
	{
		name: "event-conditions",
		eventIndex: number
	},

];
import { STUDENT_SKILLS_EXT } from "../../../config/student-skills.js";

export type CardEffectLocation = CardLocationTypes[number];

const PRIMARY_SECONDARY = {
	"primary": "persona.term.primary",
	"secondary": "persona.term.secondary",
};

export class PersonaSocialCardSheet extends PersonaSocialSheetBase {
	override item: SocialCard;

	override async getData() {
		const data = await super.getData();
		data.THRESHOLD_TYPE = THRESHOLD_TYPE;
		data.POWERSTUFF =  PersonaEffectContainerBaseSheet.powerStuff;
		data.CONST = {
			DAYS
		};
		data.SOCIAL_DATA = {
			ROLLTYPES : SOCIAL_CARD_ROLL_TYPES,
			STUDENT_SKILLS,
			STUDENT_SKILLS_EXT,
			SAVE_DIFFICULTY: SAVE_TYPES_LOCALIZED,
			ROLL_DC_TYPES: {"base": "Base", "static": "Static DC"},
			FREQUENCY: FREQUENCY,
		};
		// data.FREQUENCY = FREQUENCY;
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
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "combat"}]
		});
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find(".add-qualifier").on("click", this.addQualifier.bind(this));
		html.find(".delete-qualifier").on("click", this.deleteQualifier.bind(this));

		html.find(".add-opportunity").on("click", this.addOpportunity.bind(this));
		html.find(".del-opportunity").on("click", this.deleteOpportunity.bind(this));
		ConditionalEffectManager.applyHandlers(html, this.item);
		// html.find(".add-effect").on("click", this.addCardEffect.bind(this));
		// html.find(".del-effect").on("click", this.deleteCardEffect.bind(this));
		// html.find(".add-condition").on("click", this.addConditional.bind(this));
		// html.find(".del-condition").on("click", this.deleteConditional.bind(this));
		// html.find(".add-consequence").on("click", this.addConsequence.bind(this));
		// html.find(".del-consequence").on("click", this.deleteConsequence.bind(this));
		html.find(".add-event").on("click", this.addCardEvent.bind(this));
		html.find(".del-event").on("click", this.deleteCardEvent.bind(this));
		html.find(".add-choice").on("click", this.addChoice.bind(this));
		html.find(".del-choice").on("click", this.deleteChoice.bind(this));

	}

	async addOpportunity(_ev: JQuery.ClickEvent) {
		const card = this.item;
		let opList =card.system.opportunity_list;
		const newOpportunity : Opportunity = {
			name: "Unnamed Choice",
			choices: 1,
			//TODO: Add this to the actual opportunity sheet, right now doesn't have a conditions entry section
			conditions: [],
			text: "",
			postEffects: { effects: []},
			roll: {
				rollType: "none",
			}
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
		let opList =card.system.opportunity_list;
		opList.splice(index,1);
		await card.update({"system.opportunity_list": opList});
	}

	async addCardEffect(ev: JQuery.ClickEvent) {
		const card = this.item;
		const location = this.getEffectLocation(ev);
		return await card.addConditionalEffect(location);
	}

	async deleteCardEffect(ev: JQuery.ClickEvent) {
		const location = this.getEffectLocation(ev);

		const effectIndex = Number(HTMLTools.getClosestData(ev, "effectIndex"));
		if (Number.isNaN(effectIndex)){
			throw new PersonaError("Effect Index is NaN");
		}
		return await this.item
			.deleteConditionalEffect(effectIndex, location);
	}

	getEffectLocation(ev: JQuery.ClickEvent) : CardEffectLocation {
		const evTarget = $(ev.currentTarget);
		if (evTarget.closest(".opportunity").length > 0) {
			const opportunityIndex= Number(HTMLTools.getClosestData(ev, "opportunityIndex"));

			if (evTarget.closest(".card-roll").length > 0) {
				return {
					name: "opportunity-roll",
					opportunityIndex
				};
			}
			if ( evTarget.closest(".opportunity-cond").length > 0) {
				return {
					name: "opportunity-condition",
					opportunityIndex
				};
			}
		} else if (evTarget.closest(".card-event").length > 0) {
			const eventIndex= Number(HTMLTools.getClosestData(ev, "eventIndex"));
			if (evTarget.closest(".choice").length > 0) {
				const choiceIndex= Number(HTMLTools.getClosestData(ev, "choiceIndex"));
				if (evTarget.closest(".effects-list").length> 0) {
					return {
						name: "event-choice-effects",
						eventIndex,
						choiceIndex,
					};
				} else {
					return {
						name: "event-choice-conditions",
						eventIndex,
						choiceIndex,
					};
				}
			}
			if (evTarget.closest(".card-event").length > 0) {
				return {
					name: "event-conditions",
					eventIndex,
				};
			}
		} else if (evTarget.closest(".event-modifiers").length > 0) {
			return {
				name: "card-modifiers",
			};
		}
		if (evTarget.closest(".card-conditions").length > 0) {
			return {
				name: "card-conditions",
			}
		}
		throw new PersonaError("Unknwon Location");
	}

	async addConditional(ev: JQuery.ClickEvent) {
		const card = this.item;
		const location = this.getEffectLocation(ev);
		const effectIndex = Number(HTMLTools.getClosestDataSafe(ev, "effectIndex", "-1"));
		return await card.addCondition( effectIndex, location);
	}

	async deleteConditional(ev: JQuery.ClickEvent) {
		const card = this.item;
		const location = this.getEffectLocation(ev);
		const effectIndex = Number(HTMLTools.getClosestDataSafe(ev, "effectIndex", -1));
		const conditionIndex = Number(HTMLTools.getClosestData(ev, "preconditionIndex"));
		return await card.deleteCondition(effectIndex, conditionIndex, location);
	}

	async addConsequence(ev: JQuery.ClickEvent) {
		const card = this.item;
		const location = this.getEffectLocation(ev);
		const effectIndex = Number(HTMLTools.getClosestData(ev, "effectIndex"));
		return await card.addConsequence(effectIndex, location);
	}

	async deleteConsequence(ev: JQuery.ClickEvent) {
		const card = this.item;
		const location = this.getEffectLocation(ev);
		const effectIndex = Number(HTMLTools.getClosestData(ev, "effectIndex"));
		const consequenceIndex = Number(HTMLTools.getClosestData(ev, "consequenceIndex"));
		return await card.deleteConsequence(effectIndex, consequenceIndex, location);
	}

	async addCardEvent( _ev: JQuery.ClickEvent) {
		await this.item.addCardEvent();
	}
	async deleteCardEvent( ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		await this.item.deleteCardEvent(eventIndex);

	}

	async addChoice(ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		await this.item.addEventChoice(eventIndex);

	}

	async deleteChoice(ev: JQuery.ClickEvent) {
		const eventIndex = Number(HTMLTools.getClosestData(ev, "eventIndex"));
		const choiceIndex = Number(HTMLTools.getClosestData(ev, "choiceIndex"));
		await this.item.deleteEventChoice(eventIndex,choiceIndex);
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

} // end of class
