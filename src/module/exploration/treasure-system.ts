import { PersonaDB } from "../persona-db.js"
import { weightedChoice } from "../utility/array-tools";
import { ProbabilityRate } from "../../config/probability.js";
import { TreasureTable } from "../../config/treasure-tables.js";

export class TreasureSystem {
	get treasureList() {
		return PersonaDB.treasureItems()
		.filter ( item => item.system.treasure.table != "none")
	}

	generate(table: Exclude<TreasureTable, "none">, treasureLevel: number) : U<TreasureItem> {
		const list =this.treasureList
		.filter( item =>
			item.system.treasure.table == table
			&& item.system.treasure.minLevel >= treasureLevel
			&& item.system.treasure.maxLevel <= treasureLevel);

	const weights = list
		.map( item=> {
			const rarity = item.system.treasure.rarity;
			const weight = ENCOUNTER_RATE_PROBABILITY[rarity];
			return {
			item,
			weight
			};
		});
		return weightedChoice(weights);
	}

}

type TreasureItem = ReturnType<typeof PersonaDB["treasureItems"]>[number];

export const ENCOUNTER_RATE_PROBABILITY : ProbabilityRate = {
	common: 5,
	"common-minus": 2,
	"normal-plus": 1.5,
	normal: 1,
	"normal-minus": .75,
	"rare-plus": .5,
	rare: .2,
	never: 0,
	always: Infinity,
} ;

