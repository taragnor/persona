declare global {
	interface Game {
		persona:  {
			PersonaActor: typeof PersonaActor;
			PersonaItem: typeof PersonaItem;
		}
	}
	interface CONFIG {
		PERSONACFG: unknown
	}
}

import { ACTORMODELS } from "./datamodel/actor-types.js";
import { ITEMMODELS} from "./datamodel/item-types.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { PCSheet } from "./actor/sheets/pc-sheet.js";
import { ShadowSheet } from "./actor/sheets/shadow-sheet.js";
import { NPCSheet } from "./actor/sheets/npc-sheet.js";
import { PersonaItemSheetBase } from "./item/sheets/base-item-sheet.js";
import { HANDLEBARS_TEMPLATE_DIR } from "../config/persona-settings.js";



Hooks.once("init", async function() {
  console.log("*** PERSONA SYSTEM INIT START ***");
});

function registerDataModels() {
	CONFIG.Actor.dataModels= ACTORMODELS;
	CONFIG.Item.dataModels= ITEMMODELS;
}

function registerDocumentClasses() {
  CONFIG.Actor.documentClass = PersonaActor;
  CONFIG.Item.documentClass = PersonaItem;
}

function registerSheetApplications() {
  Actors.unregisterSheet("core", ActorSheet);
  Items.unregisterSheet("core", ItemSheet);
	//custom sheets
  Actors.registerSheet("persona", PCSheet, {types: ["pc"], makeDefault: true});
  Actors.registerSheet("persona", NPCSheet, {types: ["npc"], makeDefault: true});
  Actors.registerSheet("persona", ShadowSheet, {types: ["shadow"], makeDefault: true});

  Items.registerSheet("persona", PersonaItemSheetBase, {types: ["item"], makeDefault: true});
}

 Hooks.once("init", async function() {
   console.log("*** PERSONA SYSTEM INIT START ***");

   game.persona = {
     PersonaActor,
     PersonaItem
   };

   // Add custom config constants
   CONFIG.PERSONACFG = {}; //TODO: config object goes here

 	registerDataModels();
 	registerDocumentClasses();
 	registerSheetApplications();
 	registerHandlebarsHelpers();
 	preloadHandlebarsTemplates();
 });

 function registerHandlebarsHelpers() {
   Handlebars.registerHelper("caps", (str) => str.toUpperCase?.() || str);
 }

 function preloadHandlebarsTemplates() {
 	const path = HANDLEBARS_TEMPLATE_DIR;

 	const templateFileNames : string[] =[
 	];

 	const templatePaths = templateFileNames.
 		map( fname => `${path}/${fname}`);
 	loadTemplates(templatePaths);
 }
