import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { PersonaItem } from "../persona-item.js";

export class PersonaClassSheet  extends PersonaItemSheetBase {
	declare item: Subtype<PersonaItem, "characterClass">;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/class-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		return super.getData();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
		html.find("table").on("click",()=> console.log("You clicked the table"));
		html.find(".add-row").on("click", this.#addRow.bind(this));
	}

	async #addRow() {
		console.log("Adding a row");
		const oldtable = this.item.system.leveling_table;
		const newobj: typeof oldtable[number] = {
			lvl_num: 0,
			maxhp: 1,
			slots: [0, 0, 0, 0],
			powers_known: [0,0,0,0],
			talents: [0,0,0,0],
			magic_damage: { low: 1, high:1, boost: 1},
			wpn_mult: 1,
		};
		const newtable = oldtable.concat([newobj]);
		console.log(newtable);
		await this.item.update({"system.leveling_table":newtable});
	}

}


