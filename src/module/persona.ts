
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

import { Simulations } from "./exploration/simulations.js";
import { AnyaPlanets } from "./exploration/anya-planets.js";
import { AmongUs } from "./exploration/among-us.js";
import { NPCAllySheet } from "./actor/sheets/npc-ally-sheet.js";
import { PersonaScene } from "./persona-scene.js";
import { PersonaRegion } from "./region/persona-region.js";
import { Darkness } from "./exploration/darkness-clock.js";
import { DebugTools } from "./utility/debug.js";
import { SocketManager } from "./utility/socket-manager.js";
import { templatePaths } from "../config/handlebars-templates.js";
import { PersonaClassSheet } from "./item/sheets/class-sheet.js";
import { ACTORMODELS } from "./datamodel/actor-types.js";
import { ITEMMODELS } from "./datamodel/item-types.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaItem } from "./item/persona-item.js";
import { PersonaAE } from "./active-effect.js";
import { PCSheet } from "./actor/sheets/pc-sheet.js";
import { ShadowSheet } from "./actor/sheets/shadow-sheet.js";
import { NPCSheet } from "./actor/sheets/npc-sheet.js";
import { PersonaPowerSheet } from "./item/sheets/power-sheet.js";
import { PersonaWeaponSheet } from "./item/sheets/weapon-sheet.js";
import { PersonaItemSheet } from "./item/sheets/item-sheet.js";
import { PersonaFocusSheet } from "./item/sheets/focus-sheet.js";
import { PersonaTalentSheet } from "./item/sheets/talent-sheet.js";
import { ConsumableSheet } from "./item/sheets/consumable-sheet.js";
import { PersonaHandleBarsHelpers } from "./handlebars-helpers.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { UniversalModifierSheet } from "./item/sheets/universalmodifier-sheet.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { TarotSheet } from "./actor/sheets/tarot-sheet.js";
import { SearchMenu } from "./exploration/searchMenu.js";
import { PersonaSocialCardSheet } from "./item/sheets/social-card-sheet.js";
import { Heartbeat } from "./utility/heartbeat.js";

export const PersonaSockets = new SocketManager ("persona", true);

function registerDataModels() {
	CONFIG.Actor.dataModels = ACTORMODELS;
	CONFIG.Item.dataModels = ITEMMODELS;
}

function registerDocumentClasses() {
	CONFIG.Actor.documentClass = PersonaActor;
	CONFIG.Item.documentClass = PersonaItem;
	CONFIG.ActiveEffect.documentClass = PersonaAE;
	// CONFIG.Dice.rolls.push(PersonaRoll);
	CONFIG.Combat.documentClass = PersonaCombat;
	CONFIG.Region.documentClass = PersonaRegion;
	CONFIG.Scene.documentClass = PersonaScene;
}

function registerSheetApplications() {
	Actors.unregisterSheet("core", ActorSheet);
	Items.unregisterSheet("core", ItemSheet);
	//custom sheets
	Actors.registerSheet("persona", PCSheet, {types: ["pc"], makeDefault: true});
	Actors.registerSheet("persona", NPCSheet, {types: ["npc"], makeDefault: true});
	Actors.registerSheet("persona", ShadowSheet, {types: ["shadow"], makeDefault: true});
	Actors.registerSheet("persona", TarotSheet, {types: ["tarot"], makeDefault: true});
	Actors.registerSheet("persona", NPCAllySheet, {types: ["npcAlly"], makeDefault: true});
	Items.registerSheet("persona", PersonaClassSheet, {types: ["characterClass"], makeDefault: true});
	Items.registerSheet("persona", PersonaPowerSheet, {types: ["power"], makeDefault: true});
	Items.registerSheet("persona", PersonaWeaponSheet, {types: ["weapon"], makeDefault: true});
	Items.registerSheet("persona", PersonaItemSheet, {types: ["item"], makeDefault: true});
	Items.registerSheet("persona", PersonaTalentSheet, {types: ["talent"], makeDefault: true});
	Items.registerSheet("persona", PersonaFocusSheet, {types: ["focus"], makeDefault: true});
	Items.registerSheet("persona", ConsumableSheet, {types: ["consumable"], makeDefault: true});
	// Items.registerSheet("persona", PersonaJobSheet, {types: ["job"], makeDefault: true});
	Items.registerSheet("persona", UniversalModifierSheet, {types: ["universalModifier"], makeDefault: true});
	Items.registerSheet("persona", PersonaSocialCardSheet, {types: ["socialCard"], makeDefault: true});
}

Hooks.once("ready", () => {Darkness.init()});

Hooks.once("init", async function() {
	console.log("*** PERSONA SYSTEM INIT START ***");

	DebugTools.setDebugMode(true);

	game.persona = {
		PersonaActor,
		PersonaItem
	};

	// Add custom config constants
	CONFIG.PERSONACFG = {}; //TODO: config object goes here

	//@ts-ignore
	window.SearchMenu = SearchMenu;

	registerDataModels();
	registerDocumentClasses();
	registerSheetApplications();
	registerHandlebarsHelpers();
	PersonaSettings.registerSettings();
	preloadHandlebarsTemplates();
	// ErrorScanner.check();
	Heartbeat.start();
});

function registerHandlebarsHelpers() {
	PersonaHandleBarsHelpers.init();
}

function preloadHandlebarsTemplates() {
	templatePaths.forEach(path => console.log(path));
	loadTemplates(templatePaths);
}

Hooks.on("init", async () => {
	//@ts-ignore
	CONFIG.Actor.trackableAttributes = {
		pc: {
			bar: ["combat.hpTracker", "combat.mp"],
			value: []
		},
		shadow: {
			bar: ["combat.hpTracker", "combat.energy"],
			value: []
		}
	};
});

export function localize(...args: Parameters<typeof game.i18n.localize>): ReturnType<typeof game.i18n.localize> {
	return game.i18n.localize(...args);
}

//@ts-ignore
window.AmongUs = AmongUs

//@ts-ignore
window.AnyaPlanets = new AnyaPlanets();

//@ts-ignore
window.Simulations = Simulations;
