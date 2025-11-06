import {Shadow} from "../actor/persona-actor.js";
import {ModifierList} from "../combat/modifier-list.js";
import {Metaverse, PresenceRollData} from "../metaverse.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {PersonaRegion} from "../region/persona-region.js";
import {weightedChoice} from "../utility/array-tools.js";
import {VotingDialog} from "../utility/shared-dialog.js";
import {TensionPool} from "./tension-pool.js";

export class RandomEncounter {


	static encounterChoices = [
		"fight",
		"evade",
		"sneak",
		"ambush",
	] as const;

	static async presenceCheck(encounterType: PresenceRollData["encounterType"], region ?: PersonaRegion, situation ?: Situation, modifier = 0) : Promise<PresenceCheckResult> {
		if (!region) {
			region = Metaverse.getRegion();
			if (!region) {return null;}
		}
		if  (!situation) {
			situation = {
				trigger: "on-presence-check",
				triggeringRegionId : region.id,
				triggeringUser: game.user,
			};
		}
		const sModifiers = new ModifierList(
			PersonaDB.getGlobalModifiers()
			.concat(region.allRoomEffects)
			.flatMap(x=> x.getModifier("shadowPresence", null))
		);
		const sPresence = region.shadowPresence > 0 ? region.shadowPresence + sModifiers.total(situation) : 0;
		if (sPresence > 0) {
			if( await this.#enemyPresenceRoll(encounterType, sPresence + modifier, this.name) == true) {
				return "shadows";
			}
		}
		// const cModifiers = new ModifierList(
		// 	PersonaDB.getGlobalModifiers()
		// 	.concat(region.allRoomEffects)
		// 	.flatMap(x=> x.getModifier("concordiaPresence", null))
		// );
		// const cPresence = region.concordiaPresence > 0 ? region.concordiaPresence + cModifiers.total(situation): 0;
		// if (cPresence > 0) {
		// 	if ( await this.#concordiaPresenceRoll(encounterType, cPresence + modifier, this.name) == true)  {
		// 		return "daemons";
		// 	}
		// }
		return null;
	}

	// static async #concordiaPresenceRoll( encounterType: PresenceRollData["encounterType"], presenceValue: number, regionName: string = ""): Promise<boolean> {
	// 	return await this.#presenceRoll({
	// 		presenceValue,
	// 		regionName,
	// 		encounterType,
	// 		label: "Concordia Presence",
	// 		rollString: "1d8",
	// 		atkText: "Daemons Attack!",
	// 	});
	// }

	static async #enemyPresenceRoll ( encounterType: PresenceRollData["encounterType"], presenceValue:number, regionName: string = ""): Promise<boolean> {
		return await this.#presenceRoll({
			presenceValue,
			regionName,
			encounterType,
			label: "Enemy Presence",
			rollString: "1d12",
			atkText: "Enemies Attack!",
		});
	}

static async #presenceRoll (data: PresenceRollData) : Promise<boolean> {
	const roll = new Roll(data.rollString);
	await roll.roll();
	const isEncounter = roll.total <= data.presenceValue;
	let html = `<h2> ${data.label} (${data.regionName})</h2>`;
	html += `<div> Roll vs ${data.label} ${data.presenceValue}: ${roll.total} </div>`;
	const result = isEncounter ? data.atkText ?? `Danger`: data.safeText ?? `Safe`;
	html += `<div class="action-result">${result}</div>`;
	if (isEncounter) {
		html += `<br><hr><div>Will you?</div>`;
		html += `<ul>`;
		html += `<li> Fight</li>`;
		switch (data.encounterType) {
			case "wandering":
				html+= `
				<li> Evade (+1 tension on 1 on d6) </li>
				<li> Try to sneak past (d6, ambushed on 1, 2-3: +1 tension, 4-6 safe)</li>
				<li> Ambush (d8, +1 metaverse turn, 1 counter ambush, 2-3 no effect, 4-6 ambush shadows) </li>
			`;
				break;
			case "room":
				html+= `
				<li> Evade (Requires Guard): +1 tension unless a guard rolls 3-6 on d6. </li>
				<li> Ambush (Requires Guard + SL ability) </li>
				`;
				break;
			case "secondary":
				break;
			default:
				data.encounterType satisfies never;
		}
		html+= `</ul>`;
	}
await ChatMessage.create({
	speaker: {
		alias: data.label
	},
	content: html,
	rolls: [roll],
	style: CONST.CHAT_MESSAGE_STYLES.OOC,
});
return roll.total <= data.presenceValue;
}

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
	static async queryPlayerResponse(encounter: Encounter, validChoices: typeof this.encounterChoices[number][]) : Promise<EncounterAction> {
		const dialog = new VotingDialog(validChoices, `${encounter.encounterType} Encounter`);
		const action = await dialog.majorityVote();
		return {
			action,
		};
	}

	static async encounterProcess(battleType: PresenceRollData["encounterType"], shadowType ?: Shadow["system"]["creatureType"], options: EncounterOptions = {}) {
		const encounter = RandomEncounter.generateEncounter(shadowType, options);
		await RandomEncounter.printRandomEncounterList(encounter);
		const validChoices = VALID_CHOICES[battleType];
		const choice = await RandomEncounter.queryPlayerResponse(encounter, validChoices);
		return await this.processPlayerPreCombatAction(choice.action);
	}

	static async processPlayerPreCombatAction(action: typeof this.encounterChoices[number]) {
		switch (action) {
			case "fight":
				return await this.processFight();
			case "ambush":
				return await this.processAmbush();
			case "evade":
				return await this.processEvade();
			case "sneak":
				return await this.processSneak();
			default:
				action satisfies never;
				PersonaError.softFail(`Unknown Pre Combat choice ${action}`);
		}

	}

	static async processEvade() {
		const roll = await new Roll("1d6").evaluate();
		let html = `<div>Evade</div>
		<div> Roll : ${roll.total} </div>`;
		if (roll.total == 1) {
			void TensionPool._instance.inc();
			html += `<div> Tension +1</div>`;
		}
		await ChatMessage.create({
			speaker: {
				alias: "Player Decision"
			},
			content: html,
			rolls: [roll],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		});
	}

	static async processFight() {
		const html = `<div>Fight!</div>`;
		await ChatMessage.create({
			speaker: {
				alias: "Player Decision"
			},
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		});
	}

	static async processSneak() {
		const roll = await new Roll("1d6").evaluate();
		const total = roll.total;
		let html = `<div>Sneak</div>
		<div> Roll : ${total} </div>`;
		switch (true) {
			case total == 1 : {
				html += `<div> Ambushed By Shadows!!</div>`;
				break;
			}
			case total >= 2 && total <= 3: {
				void TensionPool._instance.inc();
				html += `<div> Tension +1</div>`;
				break;
			}
			default: {
				html += `<div> Ambush Successful!</div>`;
			}
		}
		await ChatMessage.create({
			speaker: {
				alias: "Player Decision"
			},
			content: html,
			rolls: [roll],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		});

	}

	static async processAmbush() {
		const roll = await new Roll("1d8").evaluate();
		const total = roll.total;
		let html = `<div>Ambush</div>
		<div> Roll : ${total} </div>`;
		switch (true) {
			case total == 1 : {
				html += `<div> Counter Ambushed By Shadows!!</div>`;
				break;
			}
			case total >= 2 && total <= 3: {
				html += `<div> No Effect</div>`;
				break;
			}
			default: {
				html += `<div> Ambush Successful!</div>`;
			}
		}
		await ChatMessage.create({
			speaker: {
				alias: "Player Decision"
			},
			content: html,
			rolls: [roll],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		});
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
				return shadowList.filter( x=> x.hasRole(["duo", "solo"]));
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

const VALID_CHOICES : Record<PresenceRollData["encounterType"], typeof RandomEncounter["encounterChoices"][number][]> = {
	room: ["fight", "evade", "ambush"],
	secondary: ["fight"],
	wandering: ["fight", "evade", "sneak", "ambush"],
};

//@ts-expect-error adding to global
window.RandomEncounter = RandomEncounter;

type PresenceCheckResult = null
	| "shadows"
	| "daemons"
	| "any";


