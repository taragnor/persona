import { HANDLEBARS_TEMPLATE_DIR } from "../config/persona-settings.js";

const path = HANDLEBARS_TEMPLATE_DIR;

const templateFileNames : string[] =[
	"inventory-section.hbs",
	"combat-section.hbs",
	"modifiers-section.hbs",
	"power-effects.hbs",
	"resistance-section.hbs",
	"defenses-section.hbs",
	"incremental-section.hbs",
	"conditions-section.hbs",
	"consequences-section.hbs",
	"effects-section.hbs",
	"effects-section-adaptable.hbs",
	"powers-table.hbs",
	"focii-table.hbs",
	"talents-table.hbs",
	"social-section.hbs",
	"simple-roll.hbs",
	"display-token-change.hbs",
	"disengage-check.hbs",
	"condensed-roll.hbs",
	"social-benefits-section.hbs",
	"card-events-section.hbs",
	"card-opportunity-section.hbs",
	"card-roll-section.hbs",
	"input-condition.hbs",
	"input-consequence.hbs",
];

export const templatePaths = templateFileNames.
	map( fname => `${path}/${fname}`);

