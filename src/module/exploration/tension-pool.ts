import { Metaverse } from "../metaverse.js";
import { HBS_TEMPLATES_DIR } from "../../config/persona-settings.js";
import { ProgressClock } from "../utility/progress-clock.js";


 class TensionPoolClass extends ProgressClock {
	 constructor() {
		 super ("Tension Pool", 6);
	 }

	 async roll(PCsOnGuard: number) : Promise<TensionPoolResult> {
		 const roll = new Roll(`${this.amt}d6`);
		 await roll.roll();
		 if (!roll.dice.some(dice => dice.values.some(v => v == 1)))
		 return new TensionPoolResult(roll, "none");
		 if (TensionPool.isMaxed() && roll.dice[0].values.filter( v=> v == 1 || v== 2))  {
			 return new TensionPoolResult(roll, "reaper");
		 }
		 await TensionPool.add(-2);
		 if (roll.dice[0].values.filter( x=> x == 1 || x== 2).length > PCsOnGuard) {
			 this.generateEncounter();
			 return new TensionPoolResult( roll, "ambush");
		 }
		 this.generateEncounter();
		 return new TensionPoolResult (roll, "battle");
	 }

	  nullResult() : TensionPoolResult{
		  return new TensionPoolResult(undefined, "none");
	  }

	 async generateEncounter() {
		 try {
			 await Metaverse.generateEncounter();
		 } catch (e) {
			 console.log(e);
		 }
	 }

 }

export const TensionPool = new TensionPoolClass();

export class TensionPoolResult {
	roll: Roll | undefined;
	result: EncounterResult;

	constructor( roll: Roll | undefined, result: EncounterResult) {
		this.roll = roll;
		this.result = result;
	}

	async print(): Promise<ChatMessage> {
		const html =await renderTemplate(`${HBS_TEMPLATES_DIR}/search-result.hbs`, {tensionRoll : this.roll? this.roll.dice[0].values: [], tensionResult: this.result} );
		return await ChatMessage.create({
			speaker: {
				scene: undefined,
				actor: undefined,
				token: undefined,
				alias: "Tension Pool Roll"
			},
			content: html,
			type: CONST.CHAT_MESSAGE_TYPES.ROLL,
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

window.TensionPool = TensionPool;
