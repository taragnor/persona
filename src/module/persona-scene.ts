import { DamageType } from "../config/damage-types";
import { ShadowRole } from "../config/shadow-types";
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

}
