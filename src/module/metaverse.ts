import { Persona } from "./persona-class.js";
import { StepsClock } from "./exploration/steps-clock.js";
import { DoomsdayClock } from "./exploration/doomsday-clock.js";
import { SceneClock } from "./exploration/scene-clock.js";
import { PersonaSFX } from "./combat/persona-sfx.js";
import { TriggeredEffect } from "./triggered-effect.js";
import { Helpers } from "./utility/helpers.js";
import { PersonaSockets } from "./persona.js";
import { weightedChoice } from "./utility/array-tools.js";
import { SearchMenu } from "./exploration/searchMenu.js";
import { PersonaRegion } from "./region/persona-region.js";
import { ProgressClock } from "./utility/progress-clock.js";
import { DungeonActionConsequence } from "../config/consequence-types.js";
import { shuffle } from "./utility/array-tools.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaError } from "./persona-error.js";
import { TensionPool } from "./exploration/tension-pool.js";
import { Logger } from "./utility/logger.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { PersonaScene } from "./persona-scene.js";
import { EnchantedTreasureFormat, TreasureSystem } from "./exploration/treasure-system.js";
import {RandomEncounter} from "./exploration/random-encounters.js";

export class Metaverse {
	static lastCrunch : number = 0;

	static async enterMetaverse() {
		if (!game.user.isGM) {return;}
		(game.actors as Collection<PersonaActor>)
			.filter( (x: PersonaActor)=> (x.isRealPC()) || x.system.type == "npcAlly")
			.forEach( (pc: PC | NPCAlly) => void pc.onEnterMetaverse());
		(game.scenes.contents as PersonaScene[])
			.forEach( sc => void sc.onEnterMetaverse());
		await TensionPool.instance.clear();
		Hooks.callAll("enterMetaverse");
		await Logger.sendToChat(`Entering Metaverse...`);
	}

	static async exitMetaverse() {
		(game.actors as Collection<PersonaActor>)
			.filter( (x: PersonaActor)=> x.isRealPC() || x.isNPCAlly())
			.forEach( (x: PC | NPCAlly) => void x.onExitMetaverse());
		const promises = game.scenes.contents.map(sc => (sc as PersonaScene).onExitMetaverse());
		await Promise.allSettled(promises);
		await TensionPool.instance.clear();
		Hooks.callAll("exitMetaverse");
		await Logger.sendToChat(`Exiting Metaverse... Everyone gains 1 level of fatigue`);
	}

	static weightedTest(type :Shadow["system"]["creatureType"] = "shadow") {
		const map = new Map<Shadow["name"], number>();
		for (let tries =0; tries< 2000; tries++) {
			const {enemies} = RandomEncounter.generateEncounter(type);
			for (const shadow of enemies) {
				const current = map.get(shadow.name) ?? 0;
				map.set(shadow.name, current +1);
			}
		}
		return this.#averageMap(map);
	}

	static weightedTest2() {
		const map = new Map<Shadow["name"], number>();
		const encounterList = RandomEncounter.getEncounterList(game.scenes.current as PersonaScene, "shadow");
		const weightedList = RandomEncounter.weightedEncounterList(encounterList);
		for (let tries =0; tries< 5000; tries++) {
			const shadow = weightedChoice(weightedList);
			if (!shadow) {
				console.warn("No choice was selected");
				continue;
			}
			const current = map.get(shadow.name) ?? 0;
			map.set(shadow.name, current +1);
		}
		return this.#averageMap(map);
	}

	static #averageMap(map: Map<string, number>) : string[] {
		let total = 0;
		const ret = [] as string[];
		for (const amt of map.values()) {
			total += amt;
		}
		const sorted = Array.from(map.entries()).sort( (a,b) => b[1] - a[1]);
		for (const [data, amt] of sorted) {
			const avg = Math.round(amt/total * 100)/100;
			ret.push( `${data}: ${avg}`);
		}
		return ret;
	}

	/** for use by macro */
	static async randomEncounter() {
		const encounter = RandomEncounter.generateEncounter();
		await RandomEncounter.printRandomEncounterList(encounter);
	}

	static inactiveMembersXPRate(party: ValidAttackers[], ally: NPCAlly): number {
		const bonuses = party.reduce( (acc, actor) => {
			const situation = {
				user: actor.accessor,
				target: ally.accessor,
			};
			return acc + actor.persona().getBonuses("inactive-party-member-xp-gains").total(situation);
		}, 0 );
		return Math.clamp(bonuses, 0, 1);
	}

	static inactiveMembersXP (amt: number, party: ValidAttackers[]) : Promise<XPGainReport[]>[]  {
		const otherAllies = PersonaDB.NPCAllies()
			.filter (x=> !party.includes( x));
		const otherAlliesAwards = otherAllies.map( async ally=> {
			try {
				const XPRate= this.inactiveMembersXPRate(party, ally);
				if (XPRate <= 0) {return [];}
				const inactiveAmt = XPRate * amt;
				const XPReport = await ally.awardXP(inactiveAmt);
				return XPReport;
			} catch (e) {
				PersonaError.softFail(`Error giving XP to Inactive Ally ${ally.name}`, e);
				return [];
			}
		});
		return otherAlliesAwards;
	}

	static async awardXP(shadows: Shadow[], party: ValidAttackers[]) : Promise<void> {
		if (!game.user.isGM) {return;}
		const numOfPCs = party.length;
		const xp= Persona.calcXP(shadows, numOfPCs );
		const navigator = PersonaDB.getNavigator();
		if (navigator) {
			party.push(navigator);
		}
		const inactivePartyXP = this.inactiveMembersXP(xp, party);
		const XPAwardDataPromises = party.map( async actor => {
			try {
				const XPReport = await actor.awardXP(xp);
				return XPReport;
			} catch (e) {
				PersonaError.softFail(`Error giving XP to ${actor.name}`, e);
				return [];
			}
		});
		const data = (await Promise.all(XPAwardDataPromises.concat(inactivePartyXP)))
		.flatMap(x=> x);
		await this.reportXPGain(data);
	}

	static async reportXPGain(xpReport: XPGainReport[]) : Promise<void> {
		const xpStringParts = xpReport
		.map( ({name, amount, leveled}) => {
			let LUMsg = "";
			const base =  `<div> ${name}: +${amount} XP </div>`;
			if (leveled) {
				LUMsg =  `<div class="level-up-msg"> Level Up!</div>`;
			}
			return base + LUMsg;
		});
		const text = xpStringParts.join("");
		if (xpReport.some(x=> x.leveled)) {
			void PersonaSFX.onLevelUp();
		}
		await ChatMessage.create({
			speaker: {
				alias: "XP Award",
			},
			content: text ,
			rolls: [],
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		});
	}

	// static async generateTreasure(shadows: PersonaActor[]): Promise<Treasure> {
	// 	const items : TreasureItem[] = [];
	// 	// let money = 0;
	// 	const considerSkillCard = async function (powerId: string, prob: number) {
	// 		if (!powerId) {return;}
	// 		if (Math.random() > (prob ?? 0) / 100) {return;}
	// 		const existingCard = PersonaDB.skillCards().find( x=> x.system.skillId  ==  powerId);
	// 		if (existingCard) {
	// 			items.push(existingCard);
	// 			return;
	// 		}
	// 		const power = PersonaDB.allPowers().get(powerId);
	// 		if (!power) {
	// 			PersonaError.softFail(`Can't fiund Power Id ${power} for treasure`);
	// 			return;
	// 		}
	// 		const newCard = await PersonaItem.createSkillCardFromPower(power);
	// 		const msg = `Skill Card created for ${power.name}`;
	// 		ui.notifications.notify(msg);
	// 		console.log(msg);
	// 		items.push(newCard);
	// 	};
	// 	const considerItem = function (itemId: string, prob: number) {
	// 		const item = PersonaDB.treasureItems().find(x=> x.id == itemId);
	// 		if (!item) {return;}
	// 		if (Math.random() > (prob ?? 0) / 100) {return;}
	// 		items.push(item);
	// 	};
	// 	const money = shadows.reduce( (a,s) => a + s.moneyDropped(), 0);
	// 	for (const shadow of shadows) {
	// 		if (shadow.system.type != "shadow") { continue;}
	// 		if (shadow.hasCreatureTag("d-mon")) { continue;}
	// 		const treasure = shadow.system.encounter.treasure;
	// 		considerItem(treasure.item0, treasure.item0prob);
	// 		considerItem(treasure.item1, treasure.item1prob);
	// 		considerItem(treasure.item2, treasure.item2prob);
	// 		await considerSkillCard(treasure.cardPowerId, treasure.cardProb);
	// 	}
	// 	const treasure : Treasure = { money, items };
	// 	return treasure;
	// }

	static async printTreasure(treasure : Treasure) {
		const {money, items} = treasure;
		const speaker = ChatMessage.getSpeaker({alias: "Treasure Generator"});
		const treasureListHTML = items
			.map( item => `<li> ${item.displayedName.toString()} </li>`)
			.join("");
		const text = `
		<b>Money:</b> ${money} <br>
		<ul class="treasure-list">
		${treasureListHTML}
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

	static async distributeMoney(money: number, players: PersonaActor[]) {
		if (players.length <= 0) {return;}
		const moneyShare = Math.floor(money / players.length);
		const shareDist =
			players.map( actor => ({
				pc: actor,
				share: Math.round(moneyShare * actor.treasureMultiplier)
			}));
		shuffle(shareDist);
		let moneyOverflow = money - (moneyShare * players.length);
		for (const entry of shareDist) {
			if (moneyOverflow > 0) {
				entry.share += 1;
				moneyOverflow--;
			}
			if (entry.pc.system.type == "pc") {
				await (entry.pc as PC).gainMoney(entry.share, true, true);
			}
		}
	}

	static async executeDungeonAction( action: DungeonActionConsequence) : Promise<void> {
		switch (action.dungeonAction) {
			case "roll-tension-pool":
				PersonaError.softFail("Rolling the tension pool is no longer a supported action");
				// await TensionPool
				// 	.instance.rollAuto();
				break;
			case "modify-tension-pool":
				await TensionPool.instance.add(action.amount);
				break;
			case "modify-clock": {
				const clock = ProgressClock.getClock(action.clockId);
				if (!clock) {
					const msg =`Can't find clock id ${action.clockId}`;
					console.warn(msg);
					// PersonaError.softFail(msg);
					return;
				}
				if (clock == DoomsdayClock.instance) {
					PersonaError.softFail("Can't modify doomsday clock via dungeon action");
					return;
				}
				await clock.add(action.amount);
			}
				break;
			case "close-all-doors":
				await this.closeAllDoors();
				break;
			case "change-scene-weather":
				await (game.scenes.active as PersonaScene).changeWeather(action.sceneWeatherType);
				break;
			case "set-clock": {
				const clock = ProgressClock.getClock(action.clockId);
				if (!clock) {
					const msg = `Can't find clock id ${action.clockId}`;
					console.warn (msg);
					return;
				}
				if (clock == DoomsdayClock.instance) {
					PersonaError.softFail("Can't modify doomsday clock via dungeon action");
					return;
				}
				await clock.set(action.amount);
				break;
			}
			case "rename-scene-clock": {
				const clock = SceneClock.instance;
				if (action.clockNewName) {clock.renameClock(action.clockNewName);}
				clock.setCyclic(action.cyclicClock ?? false);
				clock.setHideOnZero(action.hideOnZero ?? false);
				if (action.clockMax) {
					clock.setMax(action.clockMax);
				}
				break;
			}
			case "disable-region":
				break; // handled in persona-region class
			default:
				action satisfies never;
		}
	}

	static async closeAllDoors() {
		const scene = game.scenes.current;
		const openDoors = scene.walls
			.filter(w=> w.door > 0 && w.ds == 1);
		for (const door of openDoors) {
			await door.update( {ds: 0});
		}
	}

	static async searchRoom() {
		const region = this.getRegion();
		if (!region) {
			throw new PersonaError("Can't find region");
		}
		if (region.isSafe) {
			throw new PersonaError("Room is safe can't be searched");
		}
		await this.searchRegion(region);
	}

	static async passMetaverseTurn() {
		if (game.user.isGM)
		{return await this.#passMetaverseTurn();}
		else
		{return this.#sendPassTurnRequest();}
	}

	static async #passMetaverseTurn() {
		console.log("Trying to pass MV turn");
		const pcs = game.scenes.active.tokens.contents.filter( tok => tok.actor && (tok.actor as PersonaActor).isPC());
		const ret : string[] = [];
		for (const pc of pcs) {
			ret.push(...await (pc.actor as PersonaActor).onMetaverseTimeAdvance());
		}
		if (ret.length > 0) {
			const changes = ret
				.map( x=> `<li>${x}</li>`)
				.join("");
			await ChatMessage.create( {
				speaker: {alias: "Metaverse Exploration"},
				content: `<ul>${changes}</ul>`,
				style: CONST.CHAT_MESSAGE_STYLES.OOC,
			});
		}
		await StepsClock.instance.inc();
		await TriggeredEffect.autoApplyTrigger("on-metaverse-turn");
		ui.notifications.notify("Passing Metaverse turn");
	}

	static #sendPassTurnRequest() {
		const gms = game.users.filter(x=> x.isGM).map (x=> x.id);
		PersonaSockets.simpleSend("PASS_MV_TURN", {}, gms);
	}

	static async searchRegion(region: PersonaRegion) {
		const data = region.regionData;
		const searchOptions :typeof SearchMenu["options"] = {
			treasureRemaining: region.treasuresRemaining,
			stopOnHazard: data.specialMods.includes("stop-on-hazard"),
			isHazard: data.hazard != "none" && data.hazard != "found",
			isSecret: data.secret != "none" && data.secret != "found",
			incTension: data.specialMods.includes("no-tension-increase") ? 0 : 0, // set to always 0 due to new rules change
			hazardOnTwo: data.specialMods.includes("hazard-on-2"),
			cycle: false,
			treasureFindBonus: 0,
		};
		const results = await SearchMenu.start(searchOptions, region);
		const treasureRolls : EnchantedTreasureFormat[] = [];
		for (const resultSet of results) {
			const searcher = PersonaDB.findActor(resultSet.searcher.actor);
			for (const result of resultSet.results) {
				switch (result.result) {
					case "nothing":
						break;
					case "treasure": {
						if (!result.roll) {
							PersonaError.softFail("Treasure Found but no roll given");
							break;
						}
						const treasureRoll = await region.treasureFound(result.roll, searcher as ValidAttackers);
						if (treasureRoll) {
							treasureRolls.push(...treasureRoll);
						}
						break;
					}
					case "hazard":
						await region.hazardFound();
						break;
					case "secret":
						await region.secretFound();
						break;
					case "other":
					case "disconnected":
						break;
					default:
						result.result satisfies undefined;
				}
			}
		}
		await TreasureSystem.handleTreasureRolls(treasureRolls);
		await this.passMetaverseTurn();
	}

	static getRegion(regionId ?: string) : PersonaRegion | undefined {
		// if (CombatScene.instance) {
		// 	const prev = CombatScene.instance.previous;
		// 	if (prev) {
		// 		scene= prev;
		// 	}
		// }
		let scene = game.scenes.active;
		const regionData = PersonaSettings.getLastRegion();
		if (regionData.lastRegionId && regionData.lastSceneId) {
			const storedScene = game.scenes.get(regionData.lastSceneId);
			regionId = regionId || regionData.lastRegionId;
			if (storedScene) {scene = storedScene;}
			const region = scene.regions.find( (r: PersonaRegion) => r.id == regionId && !r?.regionData?.ignore);
			if (!region) {
				return undefined;
			}
			return region as PersonaRegion;
		}
		const actor = game.user.character;
		if (!actor) {return undefined;}
		let region = scene.regions.find( (region : PersonaRegion) => {
			if (region?.regionData?.ignore) {return false;}
			const arr = Array.from(region.tokens);
			return arr.some( tok => tok.actor?.id == actor.id);
		});
		if (!region) {
			//Search for party token
			region = scene.regions.find(
				(region : PersonaRegion) => {
					if (region?.regionData?.ignore) {return false;}
					const arr = Array.from(region.tokens);
					return arr.some(token => token.actor?.isOwner);
				});
			if (!region) {
				return undefined;
			}
		}
		if ((region as PersonaRegion)?.regionData?.ignore == true) {
			throw new PersonaError("Region is ignore!");

		}
		return region as PersonaRegion;
	}

	static async toggleCrunchParty () : Promise<void> {
		if (game.user.isGM) {
			if ("PartyCruncher" in window) {
				this.lastCrunch = Date.now();
				//@ts-expect-error party curnch stuff
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call
				await window.PartyCruncher.toggleParty(1);
			}
		} else {
			Helpers.pauseCheck();
			this.sendPartyCrunchRequest();
		}
	}

	static sendPartyCrunchRequest() {
		const gms = game.users.filter(x=> x.isGM);
		PersonaSockets.simpleSend("CRUNCH_TOGGLE", {}, gms.map( x=> x.id));
	}

	static async onCrunchRequest() {
		if (game.user.isGM) {
			const currTime = Date.now();
			if (currTime - this.lastCrunch > 8000) {
				await this.toggleCrunchParty();
			}
		} else {
			PersonaError.softFail("Crunch request recieved by non-GM, this is in error");
		}
	}
}

Hooks.on("socketsReady", () => {
	console.log("Sockets set handler");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	PersonaSockets.setHandler("CRUNCH_TOGGLE", Metaverse.onCrunchRequest.bind(Metaverse));
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	PersonaSockets.setHandler("PASS_MV_TURN", Metaverse.passMetaverseTurn.bind(Metaverse));
});

declare global {
	interface SocketMessage {
		"CRUNCH_TOGGLE": object;
		"PASS_MV_TURN" : object;
	}
}

export type PresenceRollData = {
	presenceValue: number,
	rollString: string,
	region: PersonaRegion,
	label: string,
	encounterType: "wandering" | "room" | "secondary",
	atkText ?: string,
	safeText ?: string,
}

declare global {
	interface HOOKS {
		"exitMetaverse" : () => void;
		"enterMetaverse" : () => void;
	}
}

Hooks.on("updateWall", async function (_updateItem: WallDocument, changes: Record<string, unknown>, _diff: unknown, userId: string) {
	if (changes.ds == 1 && game.user.isGM) {
		const situation : Situation = {
			trigger: "on-open-door",
			triggeringUser: game.users.get(userId)!,
		};
		await TriggeredEffect.autoApplyTrigger("on-open-door", undefined, situation);
	}
});

Hooks.on("clockTick", async function (clock: ProgressClock, _newAmt: number) {
	const situation : Situation = {
		trigger: "on-clock-tick",
		triggeringClockId: clock.id,
		triggeringUser: game.user,
	};
	// console.log("Triggering ClockTick");
	await TriggeredEffect.autoApplyTrigger("on-clock-tick", undefined, situation);
});

Hooks.on("updateClock", async function (clock: ProgressClock, _newAmt: number, _delta: number) {
	const situation : Situation = {
		trigger: "on-clock-change",
		triggeringClockId: clock.id,
		triggeringUser: game.user,
	};
	// console.log("Triggering Clock Change");
	await TriggeredEffect.autoApplyTrigger("on-clock-change", undefined, situation);
});

//@ts-expect-error adding to window
window.Metaverse = Metaverse;

type Treasure = {
	money : number,
	items: TreasureItem[],
};


