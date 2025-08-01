import { Helpers } from "./utility/helpers.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { TriggeredEffect } from "./triggered-effect.js";
import { Logger } from "./utility/logger.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { sleep } from "./utility/async-wait.js";
import { Metaverse } from "./metaverse.js";
import { UniversalModifier } from "./item/persona-item.js";
import { testPreconditions } from "./preconditions.js";
import { DamageType } from "../config/damage-types.js";
import { ShadowRole } from "../config/shadow-types.js";
import { Shadow } from "./actor/persona-actor.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaCalendar } from "./social/persona-calendar.js";
import { PersonaRegion } from "./region/persona-region.js";
import { PersonaActor } from "./actor/persona-actor.js";

export class PersonaScene extends Scene {
	declare regions: Collection<PersonaRegion>;
	declare tokens: Collection<TokenDocument<PersonaActor>>;

	get challengeLevel(): number {
		//TODO: placeholder
		return 0;

	}

	allFoes() : Shadow[] {
		return PersonaDB.shadows()
			.filter ( shadow=> shadow.system.encounter.dungeonEncounters.some( x=> x.dungeonId == this.id)) ;
	}

	encounterList() : Shadow[] {
		const disAllowedRoles: ShadowRole[] = [
			"boss",
		];
		let encounterList =
			this.allFoes()
			.filter( shadow => !disAllowedRoles.includes(shadow.system.role)
				&& shadow.getEncounterWeight(this) > 0
			)
			.filter( shadow => {
				const situation = {
					user: shadow.accessor,
					target: shadow.accessor,
				};
				return testPreconditions(shadow.system.encounter.conditions, situation, null);
			});
		if (!PersonaCalendar.isStormy()) {
			encounterList = encounterList.filter( shadow => shadow.system.encounter.rareShadow != true);
		}
		return encounterList;
	}

	async setAllDoorSound(snd: string) {
		const doors = this.walls.filter( wall => wall.door != 0);
		doors.forEach( door => door.update({doorSound: snd}));
	}

	get sceneEffects() : UniversalModifier[] {
		return PersonaDB.getSceneModifiers()
			.filter( x=> x.system.sceneList.some(id=> id == this.id));
	}

	getRoomEffects() : (UniversalModifier["id"])[] {
		const sceneEffects = this.sceneEffects
			.map(x=> x.id);
		const regionMods = Metaverse.getRegion()?.personalRoomEffectsOnly().map(x=> x.id) ?? [];
		//TODO: get global effects from the scene
		return sceneEffects.concat(regionMods);
	}

	findActorToken <T extends PersonaActor>(actor: T) : undefined | TokenDocument<T> {
		return this.tokens.find( t=> t.actor == actor) as TokenDocument<T> | undefined;
	}

	async onEnterMetaverse() : Promise<void> {
		const regionActions =
			this.regions.contents
			.map( region => region.onEnterMetaverse())
		const actorActions =
			this.tokens.contents
			.map( tok => {
				try {
					if (!tok.actor) return Promise.resolve();
					const actor = tok.actor as PersonaActor;
					return actor.onEnterMetaverse();
				} catch (e) {
					console.log(e);
				}
				return Promise.reject("Error in token metaverse action");
			});
		const promises : Promise<any>[] = [
			...regionActions,
			...actorActions,
		];
		await Promise.allSettled(promises);
	}

	async onExitMetaverse(): Promise<void> {
		const regionPromises : Promise<any>[] = this.regions.contents.map( reg => reg.onExitMetaverse());
		const tokenPromises : Promise<any>[] = this.tokens.contents
		.map( tok => {
			try {
				const actor = (tok.actor as PersonaActor);
				if (!actor
					|| !actor.isValidCombatant()
					|| tok.actorLink == true
				) return Promise.resolve();
				return actor.onExitMetaverse();
			} catch (e) {console.log(e)}
			return Promise.reject("Error on running Actor triggers for exit-metaverse");
		})
		const promises = [
			...regionPromises,
			...tokenPromises,
		];
		await Promise.allSettled(promises);
	}


	stats() : void {
		if (!game.user.isGM) return;
		type RelevantDamageTypes = Exclude<DamageType, "none"| "healing"| "all-out"| "untyped" | "by-power"> ;
		const stats : Record<RelevantDamageTypes, number> = {
			physical: 0,
			gun: 0,
			fire: 0,
			cold: 0,
			wind: 0,
			lightning: 0,
			light: 0,
			dark: 0,
		};
		this.encounterList()
		.forEach( shadow => {
			Object.keys(stats).forEach ( (dtype: RelevantDamageTypes ) => {
				const persona = shadow.persona();
				const resist=  persona.elemResist(dtype);
				switch (resist) {
					case "normal":
						break;
					case "weakness":
						stats[dtype] += 2;
						break;
					case "resist":
						stats[dtype] -= 1;
						break;
					case "block":
					case "absorb":
					case "reflect":
						stats[dtype] -= 2;
						break;
					default:
						resist satisfies never;
				}
			});
		});
		const statsString = Object.entries(stats)
		.sort( (a,b) => b[1] - a[1])
		.map( ([k,v]) => `${k} : ${v}`)
		.join( "\n");
		console.log(`Damage Type Usefulness\n
		\n${statsString}
			`);
	}

	isEffectOn(weatherType: WeatherData) : boolean {
		const currentEffects = canvas.scene.getFlag("fxmaster", "effects") as Record<string,WeatherData> ?? {};
		if (weatherType.name in currentEffects) return true;
		if (`core_${weatherType.type}` in currentEffects) {
			const data = currentEffects[`core_${weatherType.type}`];
			if( Helpers.isObjectShallowEqual(data, weatherType)) return true;
		}
		return false;
	}

	async changeWeather(newWeather: "" | Scene["weather"] | "cloudy" | "windy") {
		const windy = {
			name: "windy",
			type: "clouds",
			options :{
				scale: .2,
				speed: 12.0,
				lifetime: 0.33,
				density: 0.2,
				direction: 120,
				alpha: 0.15, //opacity value named this for some reason
			}
		} as const;
		const blizzard =  {
			name: "blizzard",
			type: "snowstorm",
			options: {
				direction: 120,
				scale: 3.2,
				speed: 3.8,
				density: 1.0,
				lifetime: 0.3,
			}
		} as const;
		const snow = {
			name: "mySnow",
			type: "snow",
			options: {
				scale: 1.0,
				speed: 1.5,
				lifetime: 0.5,
				density: 0.6,
			}
		} as const;
		const rain = {
			name: "myRain",
			type: "rain",
			options :{
				scale: 1.0,
				speed: 1.5,
				lifetime: 0.5,
				density: 0.6,
			}
		} as const;
		const clouds = {
			name: "MyClouds",
			type: "clouds",
			options :{
				scale: 1.0,
				speed: 0.5,
				lifetime: 0.3,
				density: 0.2,
				direction: 35,
				alpha: 0.15, //opacity value named this for some reason
			}
		} as const;
		const fog = {
			name: "MyFog",
			type: "fog",
			options :{
				scale: 2.0,
				speed: 0.333,
				lifetime: 0.666,
				density: 0.15,
				direction: 35,
				alpha: 0.4, //opacity value named this for some reason
			}
		} as const;
		const rainStorm = {
			name: "myRainStorm",
			type: "rain",
			options :{
				scale: 2.0,
				speed: 2.2,
				lifetime: 1,
				density: 1,
				direction: 35,
			}
		} as const;
		const weatherData = {
			"blizzard": blizzard,
			"cloudy" : clouds,
			"snow": snow,
			"rain": rain,
			"rainstorm": rainStorm,
			"fog": fog,
			"windy": windy,
		} as const satisfies Partial<Record<typeof newWeather, WeatherData>>;
		const newWeatherData = newWeather ? weatherData[newWeather as keyof typeof weatherData] : undefined;
		await this.clearAllWeather();
		if (newWeatherData) {
			//@ts-ignore
			Hooks.call("fxmaster.switchParticleEffect", newWeatherData);
		}
	}

	async clearAllWeather() : Promise<void> {
		const currentEffects = canvas.scene.getFlag("fxmaster", "effects") as Record<string,WeatherData> ?? {};
		if (!currentEffects) return;
		for (const wd of Object.values(currentEffects)) {
			//@ts-ignore
			Hooks.call("fxmaster.switchParticleEffect", {type: wd.type});
		}
		await sleep(250);
	}

}


type WeatherData = {
	name: string,
	type: "rain" | "snow" | "fog" | "clouds" | "snowstorm",
	options : {
		scale?: number,
		speed?: number,
		lifetime?: number,
		density?: number,
		direction?: number,
		alpha?: number
	}
};



Hooks.on("updateScene", async (_scene: PersonaScene, diff) => {
	if (!game.user.isGM) return;
	if (diff.active == true) {
		await PersonaSettings.set("lastRegionExplored", "");
		if (game.combats.contents.some( (cmb: PersonaCombat) => cmb.isSocial)) {
			Logger.gmMessage("Social Scene still active, consider ending it before starting metaverse activity");
		}
		await TriggeredEffect.onTrigger("on-active-scene-change")
			.emptyCheck()
			?.autoApplyResult();
	}
});


