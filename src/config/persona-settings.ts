import { PersonaDB } from "../module/persona-db.js";
import { WEATHER_TYPES } from "./weather-types.js";
import { PersonaActor } from "../module/actor/persona-actor.js";

export const SYSTEMNAME = `persona` as const;
export const SYSTEMPATH = `systems/${SYSTEMNAME}` as const;
export const HBS_TEMPLATES_DIR = `${SYSTEMPATH}/sheets` as const;
export const HANDLEBARS_TEMPLATE_DIR = `${SYSTEMPATH}/parts` as const;


export class PersonaSettings {
	static cache : Partial<Record<SETTINGKEYS, unknown>> = {} ;
	static registerSettings() {
		for (const [key, options] of Object.entries(SETTINGS)) {
			//@ts-ignore
			game.settings.register("persona", key, options);
		}
	}

	static resetCache() {
		this.cache = {
		};
	}

	static get<T extends keyof PersonaSettingKeys>(settingName: T) : PersonaSettingKeys[T] {
		return game.settings.get("persona", settingName);
	}

	static async set<T extends SETTINGKEYS>(settingName: T, value: SettingNameSpace["persona"][T]) {
		await game.settings.set("persona", settingName, value);

	}

	static isMetaverseEnhanced() : boolean {
		return this.get("metaverseState").valueOf();
	}

	static debugMode() : boolean {
		const debugMode  = this.get("debugMode").valueOf();
		const realGame = game.users.filter( user => user.active).length > 3;
		return !realGame && debugMode;
	}

	static autoEndTurn() : boolean {
		return this.get("autoEndTurn").valueOf();
	}

	static autoApplyCombatResults(): boolean {
		return this.get("autoApplyCombatResults").valueOf();
	}
	static agressiveCaching(): boolean {
		if (this.cache.aggressiveCaching === undefined) {
			this.cache.aggressiveCaching = this.get("aggressiveCaching");
		}
		return this.cache.aggressiveCaching as boolean;
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

	"autoEndTurn" : {
		name: "Auto End Turn",
		hint: "End Creatures turn when it's out of actions",
		scope: "world",
		restricted: true,
		config: true,
		type: Boolean,
		default: true,
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

	"aggressiveCaching": {
		name: "Aggressive Data Caching",
		hint: "Attempt potentially losy optimizations",
		scope: "world",
		restricted: true,
		onChange: () => PersonaSettings.resetCache(),
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

	"damageMult": {
		name: "Damage Multiplier",
		hint: "Use New Damage Multiplier system",
		scope: "world",
		restricted: true,
		config: true,
		type: Boolean,
		default: true,
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
	},

} as const;

type SETTINGKEYS = keyof typeof SETTINGS;

// type S2 = {
// 	[k in SETTINGKEYS] :
// 	"choices" extends keyof Settings[k]
// 	? keyof Settings[k]["choices"]
// 	// ? Settings[k]["choices"][keyof Settings[k]["choices"]]
// 	: Unwrap<InstanceType<Settings[k]["type"]>>
// }

type PersonaSettingKeysBase = Prettify<SettingsObjToSettingKeyType<typeof SETTINGS>>;

interface PersonaSettingKeys extends PersonaSettingKeysBase {};

declare global {
	interface SettingNameSpace {
		"persona": PersonaSettingKeys;
	}
}


