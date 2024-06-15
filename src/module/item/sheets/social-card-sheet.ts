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
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { SAVE_TYPES_LOCALIZED } from "../../../config/save-types.js";

const PRIMARY_SECONDARY = {
	"primary": "persona.term.primary",
	"secondary": "persona.term.secondary",
};

export class PersonaSocialCardSheet extends PersonaItemSheetBase {
	override item: SocialCard;

	override async getData() {
		const data = await super.getData();
		data.POWERSTUFF =  PersonaEffectContainerBaseSheet.powerStuff;
		data.SOCIAL_DATA = {
			ROLLTYPES : SOCIAL_CARD_ROLL_TYPES,
			STUDENT_SKILLS,
			SAVE_DIFFICULTY: SAVE_TYPES_LOCALIZED,
		};
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
		html.find(".add-effect").on("click", this.addCardEffect.bind(this));
		html.find(".del-effect").on("click", this.deleteCardEffect.bind(this));
		html.find(".add-condition").on("click", this.addConditional.bind(this));
		html.find(".del-condition").on("click", this.deleteConditional.bind(this));
		html.find(".add-consequence").on("click", this.addConsequence.bind(this));
		html.find(".del-consequence").on("click", this.deleteConsequence.bind(this));

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

	async addOpportunity(_ev: JQuery.ClickEvent) {
		const card = this.item;
		let opList =card.system.opportunity_list;
		const newOpportunity : Opportunity = {
			choices: 1,
			//TODO: Add this to the actual opportunity sheet, right now doesn't have a conditions entry section
			conditions: [],
			text: "",
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
		const opportunityIndexStr= HTMLTools.getClosestData(ev, "opportunityIndex");
		if (opportunityIndexStr != undefined) {
			const indexNum = Number(opportunityIndexStr);
			if (Number.isNaN(indexNum)) {
				throw new PersonaError("Opportunity Index is NaN");
			}
			return await card.addConditionalEffect("opportunity", indexNum);
		}
	}

	async deleteCardEffect(ev: JQuery.ClickEvent) {
		console.log("Delete Card effect");
		const card = this.item;
		const opportunityIndexStr= HTMLTools.getClosestData(ev, "opportunityIndex");

		if (opportunityIndexStr != undefined) {
			const indexNum = Number(opportunityIndexStr);
			const effectIndex = Number(HTMLTools.getClosestData(ev, "effectIndex"));
			if (Number.isNaN(indexNum)) {
				throw new PersonaError("Opportunity Index is NaN");
			}
			if (Number.isNaN(effectIndex)){
				throw new PersonaError("Effect Index is NaN");
			}
			return await card.deleteConditionalEffect("opportunity", indexNum, effectIndex);
		}
	}

	async addConditional(ev: JQuery.ClickEvent) {
		const card = this.item;
		const opportunityIndexStr= HTMLTools.getClosestData(ev, "opportunityIndex");
		if (opportunityIndexStr != undefined) {
			const indexNum = Number(opportunityIndexStr);
			const effectIndex = Number(HTMLTools.getClosestData(ev, "effectIndex"));
			return await card.addCondition("opportunity", indexNum, effectIndex);
		}
	}

	async deleteConditional(ev: JQuery.ClickEvent) {
		const card = this.item;
		const opportunityIndexStr= HTMLTools.getClosestData(ev, "opportunityIndex");
		if (opportunityIndexStr != undefined) {
			const indexNum = Number(opportunityIndexStr);
			const effectIndex = Number(HTMLTools.getClosestData(ev, "effectIndex"));
			const conditionIndex = Number(HTMLTools.getClosestData(ev, "preconditionIndex"));
			return await card.deleteCondition("opportunity", indexNum, effectIndex, conditionIndex);
		}
	}

	async addConsequence(ev: JQuery.ClickEvent) {
		const card = this.item;
		const opportunityIndexStr= HTMLTools.getClosestData(ev, "opportunityIndex");
		if (opportunityIndexStr != undefined) {
			const indexNum = Number(opportunityIndexStr);
			const effectIndex = Number(HTMLTools.getClosestData(ev, "effectIndex"));
			return await card.addConsequence("opportunity", indexNum, effectIndex);
		}
	}

	async deleteConsequence(ev: JQuery.ClickEvent) {
		const card = this.item;
		const opportunityIndexStr= HTMLTools.getClosestData(ev, "opportunityIndex");
		if (opportunityIndexStr != undefined) {
			const indexNum = Number(opportunityIndexStr);
			const effectIndex = Number(HTMLTools.getClosestData(ev, "effectIndex"));
			const consequenceIndex = Number(HTMLTools.getClosestData(ev, "consequenceIndex"));
			return await card.deleteConsequence("opportunity", indexNum, effectIndex, consequenceIndex);
		}
	}

}


