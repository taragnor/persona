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
	"powers-table.hbs",
];

export const templatePaths = templateFileNames.
	map( fname => `${path}/${fname}`);

