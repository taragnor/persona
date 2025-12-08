import {ALT_DAMAGE_SYSTEM} from "../module/combat/alt-damage-system.js";
import {DamageInterface} from "../module/combat/damage-system.js";
import {ORIGINAL_DAMAGE_SYSTEM} from "../module/combat/original-damage-system.js";
import { WEATHER_TYPES } from "./weather-types.js";

export const SYSTEMNAME = `persona` as const;
export const SYSTEMPATH = `systems/${SYSTEMNAME}` as const;
export const HBS_TEMPLATES_DIR = `${SYSTEMPATH}/sheets` as const;
export const HANDLEBARS_TEMPLATE_DIR = `${SYSTEMPATH}/parts` as const;


export class PersonaSettings {
	static cache : Partial<Record<SETTINGKEYS, unknown>> = {} ;
	static registerSettings() {
		for (const [key, options] of Object.entries(SETTINGS)) {
			//@ts-expect-error TS doesn't like this
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

	static debugMode() : boolean {
		const debugMode  = this.get("debugMode").valueOf();
		const realGame = game.users.filter( user => user.active).length > 3;
		return !realGame && debugMode;
	}

	static async clearLastRegion() {
		const nullResult : RegionExploredData= {lastRegionId: undefined, lastSceneId: undefined};
		await this.set("lastRegionExplored", nullResult);
	}

	static async setLastRegion(x : RegionExploredData) {
		await this.set("lastRegionExplored", x);
	}

	static getLastRegion() : RegionExploredData {
		const data= this.get("lastRegionExplored") as RegionExploredData;
		if (typeof data == "string") {
			const scene = game.scenes.find(x=> x.regions.contents.some( r=> r.id == data));
			if ((data as string).length == 0 || !scene) {
				const nullResult : RegionExploredData= {lastRegionId: undefined, lastSceneId: undefined};
				return nullResult;
			}
			return {
				lastRegionId: data,
				lastSceneId: scene.id,
			};
		}
		return data;
	}

	static freezeXPGain() : boolean {
		const xpLock  = this.get("xpLock").valueOf();
		const realGame = game.users.filter( user => user.active).length > 3;
		if (realGame && xpLock) {
			ui.notifications.warn("XP lock is on and this seems to be a real game, no XP is being awarded");
		}
		return xpLock;
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

	static getDamageSystem() : DamageInterface {
		return PersonaSettings.get("alternateDamageSystem") ? ALT_DAMAGE_SYSTEM : ORIGINAL_DAMAGE_SYSTEM;
	}

}


const SETTINGS = {

	"debugMode" : {
		name: "Debug Mode",
		hint: "Show more debug stats (like defenses in atk)",
		scope: "world",
		restricted: true,
		config: true,
		type :Boolean,
		default: false,
	},

	"xpLock" : {
		name: "XP Lock",
		hint: "Lock XP advancement",
		scope: "world",
		restricted: true,
		config: true,
		type :Boolean,
		default: false,
	},

	"alternateDamageSystem" : {
		name: "Alternate Damage System",
		hint: "Use Alternate Damage System (multiplier based)",
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
		type: Object,
		default:{},
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface PersonaSettingKeys extends PersonaSettingKeysBase {};

declare global {
	interface SettingNameSpace {
		"persona": PersonaSettingKeys;
	}
}


interface RegionExploredData {
	lastRegionId: U<string>;
	lastSceneId: U<string>;
}
