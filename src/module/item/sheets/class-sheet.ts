import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";

export class PersonaClassSheet  extends PersonaItemSheetBase {

	static override get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
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
		html.find(".add-row").each( () => console.log("found"));

		html.find(".add-row").on("click", this.#addRow.bind(this));
	}

	async #addRow() {
		console.log("Adding a row");
		if (!(this.item.system.type == "characterClass"))
			throw new Error("Not a class");
		let oldtable = this.item.system.leveling_table;
		const newobj: typeof oldtable[number] = {
			lvl_num: 0,
			maxhp: 1,
			slots: [0, 0, 0, 0],
			powers_known: [0,0,0,0],
			talents: [0,0,0,0],
			magic_damage: { low: 1, high:1},
			wpn_mult: 1,
		};
		oldtable.push(newobj);
		console.log(oldtable);
		await this.item.update({"system.leveling_table":oldtable});
	}

}
