import {NonDeprecatedConsequence} from "../../../config/consequence-types.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import {ContextMenu, ContextMenuOptions} from "../../utility/context-menu.js";
import { PersonaPowerLikeBaseSheet } from "./powerlike-base-sheet.js";

export class PersonaPowerSheet extends PersonaPowerLikeBaseSheet {
	declare item: Power;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "item"],
			template: `${HBS_TEMPLATES_DIR}/power-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	override getData() {
		const data = super.getData();
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}

  override newConsequenceMenu() : ContextMenuOptions<MaybeArray<NonDeprecatedConsequence>>[] {
    const options = [{
      label: "Power Cost Modifiers",
      action: (_ev: JQuery.Event) => ([
        {
          type: "modifier",
          "amount": 0,
          "modifierCategory":"other",
          "modifiedField" : "power-mp-cost",
        } satisfies NonDeprecatedConsequence,
        {
          type: "modifier",
          "amount": 0,
          "modifierCategory":"other",
          "modifiedField" : "power-hp-cost",
        } satisfies NonDeprecatedConsequence,
        {
          type: "modifier",
          "amount": 0,
          "modifierCategory":"other",
          "modifiedField" : "power-energy-req",
        } satisfies NonDeprecatedConsequence,
        {
          type: "modifier",
          "amount": 0,
          "modifierCategory":"other",
          "modifiedField" : "power-energy-cost",
        } satisfies NonDeprecatedConsequence,
      ])
    },
    ] satisfies ContextMenu["options"];
    return [
      ...super.newConsequenceMenu(),
      ...options,
    ];
  }


}

