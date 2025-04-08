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
		const regionMods = Metaverse.getRegion()?.roomEffects.map(x=> x.id) ?? [];
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
				const resist=  shadow.elementalResist(dtype);
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

	isEffectOn(name: string) : boolean {
		const currentEffects = canvas.scene.getFlag("fxmaster", "effects") ?? {};
		//@ts-ignore
		return (name in currentEffects);
	}

	async changeWeather(newWeather: "" | Scene["weather"]) {
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
		};
		const snow = {
			name: "mySnow",
			type: "snow",
			options: {
				scale: 1.0,
				speed: 1.5,
				lifetime: 0.5,
				density: 0.6,
			}
		};
		let blizzardS = false;
		let snowS = false;
		switch (newWeather) {
			case "blizzard":
				blizzardS = true;
				console.log("Blizzard On");
				break;
			case "fog":
				break;
			case "snow":
				snowS = true;
				console.log("Snow On");
				break;
			case "rain":
				break;
			case "rainstorm":
				break;
			case "":
				break;
			default:
				console.log(`Unknown Weather ${newWeather}`);
				break;
		}
		let blizActual = this.isEffectOn(blizzard.name);
		let snActual = this.isEffectOn(snow.name);
		if (blizActual && blizzardS == false) {
			//@ts-ignore
			Hooks.call("fxmaster.switchParticleEffect", blizzard);
			console.log(`Blizzard ${blizzardS}`);
		}
		if (snActual && snowS == false) {
			//@ts-ignore
			Hooks.call("fxmaster.switchParticleEffect", snow);
			console.log(`Snow ${snowS}`);
		}
		// await sleep(250);
		blizActual = this.isEffectOn(blizzard.name);
		snActual = this.isEffectOn(snow.name);
		if (!blizActual && blizzardS == true) {
			//@ts-ignore
			Hooks.call("fxmaster.switchParticleEffect", blizzard);
			console.log(`Blizzard ${blizzardS}`);
		}
		if (!snActual && snowS == true) {
			//@ts-ignore
			Hooks.call("fxmaster.switchParticleEffect", snow);
			console.log(`Snow ${snowS}`);
		}
	}

}
