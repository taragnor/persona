import { PersonaError } from "../persona-error.js";
import { Metaverse } from "../metaverse.js";
import { HBS_TEMPLATES_DIR } from "../../config/persona-settings.js";
import { ProgressClock } from "../utility/progress-clock.js";


const TENSION_POOL_MAX = 6 as const;
const TENSION_POOL_NAME = "Tension Pool";

export class TensionPool extends ProgressClock {
	 static _instance : TensionPool;
	 constructor() {
		 const cl = ProgressClock.getOrCreateClockByName(TENSION_POOL_NAME, TENSION_POOL_MAX);
		 super(cl.id, cl.name, cl.max);
	 }

	 static get instance() : TensionPool {
		 return this._instance;
	 }

	 static init() {
		 this._instance = new TensionPool();
		 this._instance.setHideOnZero(true);
	 }

	 async rollAuto() {
		 if (!game.user.isGM)
			 {throw new PersonaError("Can't roll tension pool as non-GM");}
		 const result = await this.roll();
		 await result.print();
	 }

	 async roll() : Promise<TensionPoolResult> {
		 if (!game.user.isGM)
			 {throw new PersonaError("Can't roll tension pool as non-GM");}
		 const roll = new Roll(`${this.amt}d6`);
		 await roll.roll();
		 if (!roll.dice.some(dice => dice.values.some(v => v == 1))) {
			 return new TensionPoolResult(roll, "none");
		 }
		 if (this.isMaxed())  {
			 return new TensionPoolResult(roll, "reaper");
		 }
		 const sixes = roll.dice
		 .flatMap( die=> die.total == 6 ? [die] : [])
		 .length;
		 await this.add(-sixes);
		 await this.generateEncounter();
		 return new TensionPoolResult (roll, "battle");
	 }

	  nullResult() : TensionPoolResult{
		  return new TensionPoolResult(undefined, "none");
	  }

	 async generateEncounter() {
		 try {
			 const encounter = Metaverse.generateEncounter();
			 await Metaverse.printRandomEncounterList(encounter);
		 } catch (e) {
			 console.log(e);
		 }
	 }

 }

Hooks.on("ready", () => {
	TensionPool.init();
});

export class TensionPoolResult {
	roll: Roll | undefined;
	result: EncounterResult;

	constructor( roll: Roll | undefined, result: EncounterResult) {
		this.roll = roll;
		this.result = result;
	}

	async print(): Promise<ChatMessage> {
		const html = await foundry.applications.handlebars.renderTemplate(`${HBS_TEMPLATES_DIR}/search-result.hbs`, {tensionRoll : this.roll? this.roll.dice[0].values: [], tensionResult: this.result} );
		return await ChatMessage.create({
			speaker: {
				scene: undefined,
				actor: undefined,
				token: undefined,
				alias: "Tension Pool Roll"
			},
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
			rolls: [this.roll],
		});
	}
}

declare global {
	interface Window {
		TensionPool: ProgressClock;
	}
}

export type EncounterResult ="ambush" | "battle" |"reaper" | "none" ;
