
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
import { templatePaths } from "../config/handlebars-templates.js";
import { PersonaClassSheet } from "./item/sheets/class-sheet.js";
import { ACTORMODELS } from "./datamodel/actor-types.js";
import { ITEMMODELS} from "./datamodel/item-types.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { PCSheet } from "./actor/sheets/pc-sheet.js";
import { ShadowSheet } from "./actor/sheets/shadow-sheet.js";
import { NPCSheet } from "./actor/sheets/npc-sheet.js";
import { PersonaPowerSheet } from "./item/sheets/power-sheet.js";
import { PersonaWeaponSheet } from "./item/sheets/weapon-sheet.js";
import { PersonaItemSheet } from "./item/sheets/item-sheet.js";
import { PersonaStudentSkillSheet } from "./item/sheets/student-skill-sheet.js";
import { PersonaFocusSheet } from "./item/sheets/focus-sheet.js";
import { PersonaTalentSheet } from "./item/sheets/talent-sheet.js";
import { ConsumableSheet } from "./item/sheets/consumable-sheet.js";

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
  Items.registerSheet("persona", PersonaClassSheet, {types: ["characterClass"], makeDefault: true});
  Items.registerSheet("persona", PersonaPowerSheet, {types: ["power"], makeDefault: true});
  Items.registerSheet("persona", PersonaWeaponSheet, {types: ["weapon"], makeDefault: true});
  Items.registerSheet("persona", PersonaItemSheet, {types: ["item"], makeDefault: true});
  Items.registerSheet("persona", PersonaTalentSheet, {types: ["talent"], makeDefault: true});
  Items.registerSheet("persona", PersonaFocusSheet, {types: ["focus"], makeDefault: true});
  Items.registerSheet("persona", PersonaStudentSkillSheet, {types: ["studentSkill"], makeDefault: true});
  Items.registerSheet("persona", ConsumableSheet, {types: ["consumable"], makeDefault: true});

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
	 Handlebars.registerHelper("getMaxSlotsAt", (actor: PersonaActor, lvl:number) => {
		 console.log(actor);
		 console.log(lvl);
		 return actor.getMaxSlotsAt(lvl);
	 });
 }

 function preloadHandlebarsTemplates() {
	 templatePaths.forEach(path => console.log(path));
	 loadTemplates(templatePaths);
 }
