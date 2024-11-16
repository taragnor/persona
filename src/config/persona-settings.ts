import { WEATHER_TYPES } from "./weather-types.js";
import { PersonaActor } from "../module/actor/persona-actor.js";

export const SYSTEMNAME = `persona` as const;
export const SYSTEMPATH = `systems/${SYSTEMNAME}` as const;
export const HBS_TEMPLATES_DIR = `${SYSTEMPATH}/sheets` as const;
export const HANDLEBARS_TEMPLATE_DIR = `${SYSTEMPATH}/parts` as const;


export class PersonaSettings {
	static registerSettings() {
		for (const [key, options] of Object.entries(SETTINGS)) {
			//@ts-ignore
			game.settings.register("persona", key, options);
		}
	}

	static get<T extends SETTINGKEYS, IT extends InstanceType<typeof SETTINGS[T]["type"]>>(settingName: T) : IT extends Boolean ? boolean: IT {
		return game.settings.get("persona", settingName);
	}

	static async set<T extends SETTINGKEYS>(settingName: T, value: InstanceType<typeof SETTINGS[T]["type"]>) {
		await game.settings.set("persona", settingName, value);

	}

	static isMetaverseEnhanced() : boolean {
		return this.get("metaverseState").valueOf();
	}

	static debugMode() : boolean {
		return this.get("debugMode").valueOf();
	}

	static autoApplyCombatResults(): boolean {
		return this.get("autoApplyCombatResults").valueOf();
	}

}


const SETTINGS = {
	"metaverseState" : {
		name: "Metaverse Enhanced",
		hint: "Is Metaverse Enhanced?",
		scope: "world",
		restricted: true,
		config: true, //turn this off eventually
		type :Boolean,
		default: false,
		onChange: () => {
			console.log("Executing MEtaverse state update");
			if (game.user.isGM) {
			game.scenes
				.forEach( scene => scene.tokens.contents
					.forEach( tok => (tok.actor as PersonaActor | undefined)?.fullHeal()
					)
				);
			}
		}
	},

	"debugMode" : {
		name: "Debug Mode",
		hint: "Show more debug stats (like defenses in atk)",
		scope: "world",
		restricted: true,
		config: true,
		type :Boolean,
		default: false,
	},

	"autoApplyCombatResults" : {
		name: "Auto Apply Combat Results",
		hint: "Auto apply combat results?",
		scope: "world",
		restricted: true,
		config: true,
		type :Boolean,
		default: false,
	},

	"allOutAttackPrompt" : {
		name: "All out attack Prompt",
		hint: "Show prompt when AoA is available",
		scope: "world",
		restricted: true,
		config: true,
		type: Boolean,
		default: false,
	},

	"heartbeatOn": {
		name: "Heartbeat Code",
		hint: "Constantly checks to see if players disconnect",
		scope: "world",
		restricted: true,
		config: true,
		type: Boolean,
		default: true,
	},

	"weather": {
		name: "Weather Conditions",
		hint: "Weather conditions in world",
		scope: "world",
		restricted: true,
		config: true,
		choices: WEATHER_TYPES,
		default: "cloudy",
		type: String,
	},

	"searchReminder": {
		name: "Search Reminder",
		hint: "Beeps annoyingly at the last person to pick in search actions",
		scope: "world",
		restricted: true,
		config: true,
		type: Boolean,
		default: true,
	},

	"lastRegionExplored": {
		name: "Last Region",
		hint: "The Last Region a PC went into",
		scope: "world",
		restricted: true,
		config: false,
		type: String,
		default: ""
	}

} as const;

type SETTINGKEYS = keyof typeof SETTINGS;

