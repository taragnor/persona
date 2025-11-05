import {Shadow} from "../actor/persona-actor.js";
import {Metaverse} from "../metaverse.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {PersonaRegion} from "../region/persona-region.js";
import {weightedChoice} from "../utility/array-tools.js";
import {VotingDialog} from "../utility/shared-dialog.js";

export class RandomEncounter {


	static encounterChoices = [
		"fight",
		"evade",
		"sneak",
		"ambush",
	] as const;


	static async printRandomEncounterList(encounter: Encounter) {
		const {enemies, encounterType} = encounter;
		const speaker = ChatMessage.getSpeaker({alias: "Encounter Generator"});
		const enchtml = enemies.map( shadow =>
			`<li class="shadow"> ${shadow.name} </div>`
		).join("");
		const text = `
		<h2> ${encounterType} Encounter </h2>
		<ul class="enc-list">
		${enchtml}
		</ul>
		`;
		const messageData = {
			speaker: speaker,
			content: text,
			whisper: game.users.filter(usr => usr.isGM),
			style: CONST.CHAT_MESSAGE_STYLES.WHISPER,
		};
		await ChatMessage.create(messageData, {});
	}

	static getEncounterList(sceneOrRegion: PersonaScene | PersonaRegion, shadowType ?: Shadow["system"]["creatureType"]): Shadow[] {
		return sceneOrRegion.encounterList()
			.filter( shadow => shadowType ? shadow.system.creatureType == shadowType : true);
	}

	/** queries player to determine if they will ambush, fight , etc.*/
static async queryPlayerResponse(encounter: Encounter) : Promise<EncounterAction> {
	const dialog = new VotingDialog(this.encounterChoices, `${encounter.encounterType} Encounter`);
	const action = await dialog.majorityVote();
	return {
		action,
	};
}


	static generateEncounter(shadowType ?: Shadow["system"]["creatureType"], options: EncounterOptions = {}): Encounter {
		const region = Metaverse.getRegion();
		const scene =  game.scenes.current as PersonaScene;
		const regionOrScene = region ? region : scene;
		const baseList  = this.getEncounterList(regionOrScene, shadowType);
		let enemyType : Shadow["system"]["creatureType"] | undefined = undefined;
		const encounter : Shadow[] = [];
		let bailout = 0;
		let encounterList = baseList;
		let encounterSizeRemaining: number;
		if (baseList.length == 0) {
			PersonaError.softFail(`Base Encounter List is empty for ${scene.name} ${shadowType ? "(" + shadowType+ ")"  :""}`);
			return {
				enemies: [],
				encounterType: "error",
			};
		}
		let etype : EncounterType;
		do {
			etype = options.encounterType ? options.encounterType : this.#getEncounterType(options.frequencies ?? {});
			const size = this.#getEncounterSize(etype) + (options.sizeMod ?? 0);
			encounterSizeRemaining = size;
			encounterList = this.#filterByEncounterType(baseList, etype);
		} while (encounterList.length <= 0);

		console.log(`Encounter list : ${encounterList.map( x=> x.name).join(", ")}`);
		const weightedList = this.weightedEncounterList(encounterList, scene);
		const minSize = encounterList.reduce ( (a, x) => Math.min(a, x.encounterSizeValue()), 10);
		while (encounterSizeRemaining > 0) {
			if (bailout > 200) {
				PersonaError.softFail(`Had to bail out, couldn't find match for ${scene.name}`);
				return {
					enemies: encounter,
					encounterType: "error"
				};
			}
			if (bailout == 20) {
				ui.notifications.warn("Over 20 fail attempts getting random encounter");
			}
			const pick1 = weightedChoice(weightedList);
			const pick2 = weightedChoice(weightedList);
			const pick  = this.#choosePick(pick1, pick2, encounter);
			if (!pick) {
				continue;
			}
			if (enemyType == undefined) {
				enemyType = pick.system.creatureType;
			}
			if (pick.system.creatureType != enemyType) {
				bailout++; //escape hatch for if it keeps screwing up
				continue;
			}
			let amt = this.getSubgroupAmt(pick);
			if (minSize > encounterSizeRemaining) {
				break;
			}
			while (amt > 0) {
				const sizeVal = pick.encounterSizeValue();
				if (encounterSizeRemaining < 3 && minSize >= 3) {break;} //don't swamp them with solos
				if (sizeVal > encounterSizeRemaining) {
					break;
				}

				if (sizeVal < 0.25) {
					console.warn(`Size value of ${pick.name} less than 0.25`);
				}
				encounterSizeRemaining -= sizeVal;
				encounter.push(pick);
				amt -= 1;
			}
		}
		encounter.sort( (a,b) => a.name.localeCompare(b.name));
		return {enemies: encounter, encounterType: etype};
	}

	static #getEncounterType(frequencies: {hard ?: number, mixed ?: number}): EncounterType {
		const mixed = frequencies.mixed ? frequencies.mixed : 0;
		const DIE_SIZE = 16 + mixed;
		const sizeRoll = Math.floor((Math.random() * DIE_SIZE) +1);
		const hardMod = frequencies.hard ? frequencies.hard : 0;
		console.debug(`Hard Mod: ${hardMod}, Mixed Mod:${mixed}`);
		switch (true) {
			case sizeRoll <= 11 - hardMod:
				return "standard";
			case sizeRoll <= 13:
				return "tough";
			case sizeRoll == 14:
				return "treasure";
			case sizeRoll >= 15:
				return "mixed";
			default:
				return "standard";
		}
	}

static #choosePick (pick1: Shadow | undefined, pick2: Shadow | undefined, encounterList: Shadow[]): Shadow | undefined {
	if (!pick1 || !pick2) {
		PersonaError.softFail("Couldn't get a pick from choice list");
		return undefined;
	}
	if (encounterList.length <= 0) {return pick1;}
	if (Math.random() < 0.3333) {return pick1;} //favor weights less heavily
	const p1score = encounterList
		.reduce ( (acc, shadow) => acc + shadow.complementRating(pick1), 0);
	const p2score = encounterList
		.reduce ( (acc, shadow) => acc + shadow.complementRating(pick2), 0);
	const pick = p2score < p1score ? pick1 : pick2;
	return pick;
}

	static #getEncounterSize(etype: EncounterType) : number {
		const DIE_SIZE = 10;
		const sizeRoll = Math.floor((Math.random() * DIE_SIZE) +1);
		const addon = etype == "tough" || etype == "mixed" ? 1 : 0;
		switch (sizeRoll)  {
			case 1:
				return 3 + addon;
			case 2: case 3: case 4: case 5:
				return 4 + addon;
			case 8: case 9: case 10:
				return 5 + addon;
			default:
				if (sizeRoll > DIE_SIZE) {
					PersonaError.softFail(`Encounter number is ${sizeRoll}`);
				}
				return 4 + addon;
		}

	}

private static getSubgroupAmt(pick: Shadow) : number {
	switch (true) {
		case pick.hasRole("minion"):
			return Math.floor(Math.random() * 3 + 3);
		case pick.hasRole("duo"): return 2;
		case pick.hasRole("solo"): return 1;
		case pick.hasRole("elite"): return Math.floor(Math.random() * 2 + 2);
		case pick.hasRole(["soldier", "artillery", "tank", "brute", "assassin"]): return Math.floor(Math.random() * 3 + 1);
		case pick.hasRole("controller"):
		case pick.hasRole("treasure-shadow"):
		case pick.hasRole("lurker"):
		case pick.hasRole("support"):
			return Math.floor(Math.random() * 2 + 1);
		default:
			return Math.floor(Math.random() * 5 + 1);
	}
}


	static #filterByEncounterType(shadowList : Shadow[], etype : EncounterType) : Shadow[] {
		switch (etype) {
			case "standard":
				return shadowList.filter( x=> !x.hasRole(["treasure-shadow", "duo", "solo"]));
			case "tough":
				return shadowList.filter( x=> x.hasRole(["duo", "solo", "elite"]));
			case "treasure":
				return shadowList.filter( x=> x.hasRole(["treasure-shadow"]));
			case "mixed":
				return shadowList;
			case "error":
				return [];
			default:
				etype satisfies never;
				return [];
		}
	}

	static weightedEncounterList(arr: Shadow[], scene: PersonaScene = game.scenes.current as PersonaScene) {
		return arr
			.map (shadow => {
				const encounterWeight = shadow.getEncounterWeight(scene);
				const weight = encounterWeight;
				return { item: shadow, weight, };
			});
	}


}

export type Encounter =  {
	enemies: Shadow[],
	encounterType : EncounterType,
}


type EncounterType = "standard" | "tough" | "treasure" | "mixed" | "error";


export interface EncounterOptions {
	sizeMod ?: number;
	encounterType ?: EncounterType;
	frequencies ?: {hard: number, mixed: number},
}


export type EncounterAction = {
	action: "fight" | "ambush" | "evade" | "sneak";

}
