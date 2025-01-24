import { sleep } from "./utility/async-wait.js";
import { DamageType } from "../config/damage-types.js";
import { ShadowRole } from "../config/shadow-types.js";
import { Shadow } from "./actor/persona-actor.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaCalendar } from "./social/persona-calendar.js";

export class PersonaScene extends Scene {
	allFoes() : Shadow[] {
		return PersonaDB.shadows()
		.filter ( shadow=> shadow.system.encounter.dungeons.includes(this.id));
	}

	encounterList() : Shadow[] {
		const disAllowedRoles: ShadowRole[] = [
			"miniboss-lord",
			"boss-lord",
			"miniboss",
			"boss",
		];
		let encounterList =
			this.allFoes().filter( shadow =>
			!disAllowedRoles.includes(shadow.system.role)
		);
		if (!PersonaCalendar.isStormy()) {
			encounterList = encounterList.filter( shadow => shadow.system.encounter.rareShadow != true);
		}
		return encounterList;
	}

	stats() : void {
		if (!game.user.isGM) return;
		type RelevantDamageTypes = Exclude<DamageType, "none"| "healing"| "all-out"| "untyped"> ;
		const stats : Record<RelevantDamageTypes, number> = {
			physical: 0,
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
						stats[dtype] += 1;
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
