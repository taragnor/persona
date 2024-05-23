import { PersonaError } from "../../persona-error.js";
import { SocialCard } from "../persona-item.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { PersonaDB } from "../../persona-db.js";
import { ArrayCorrector } from "../persona-item.js";
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PERK_TYPES } from "../../../config/perk-types.js";
import { CAMEO_TYPES } from "../../../config/cameo-types.js";


const PRIMARY_SECONDARY = {
	"primary": "persona.term.primary",
	"secondary": "persona.term.secondary",
};

export class PersonaSocialCardSheet extends PersonaItemSheetBase {
	override item: SocialCard;

	override async getData() {
		const data = await super.getData();
		data.CAMEO_TYPES = CAMEO_TYPES;
		data.PERK_TYPES = PERK_TYPES;
		data.PRIMARY_SECONDARY = PRIMARY_SECONDARY;
		data.QUALIFIERS_NAME_LIST = PersonaDB.allSocialCards()
			.flatMap(card => card.system.qualifiers)
			.map(qual=> qual.relationshipName)
			.filter( (val, i, arr) => arr.indexOf(val) == i);
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

}
