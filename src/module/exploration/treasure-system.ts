import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaDB } from "../persona-db.js";
import { weightedChoice } from "../utility/array-tools.js";
import { ProbabilityRate } from "../../config/probability.js";
import { TreasureTable } from "../../config/treasure-tables.js";

export class TreasureSystem {
	static get treasureList() {
		return PersonaDB.treasureItems()
		.filter ( item => item.system.treasure.table != "none");
	}

	static generate(table: Exclude<TreasureTable, "none">, treasureLevel: number) : U<TreasureItem> {
		const list =this.treasureList
		.filter( item =>
			item.system.treasure.table == table
			&& item.system.treasure.minLevel >= treasureLevel
			&& item.system.treasure.maxLevel <= treasureLevel);

	const weights = list
		.map( item=> {
			const rarity = item.system.treasure.rarity;
			const possessionMult =this.possessionWeightMod(item);
			const baseWeight = ENCOUNTER_RATE_PROBABILITY[rarity];
			const weight = baseWeight * possessionMult;
			return { item, weight };
		});
		return weightedChoice(weights);
	}

	static amountOfItemOwnedByParty(item : TreasureItem) : number {
		const pcsAndAllies = game.actors.filter( (act:PersonaActor) => act.isPC() || act.isNPCAlly()) as PersonaActor[];
		const items=  pcsAndAllies.map( actor => actor.items.find(i=> i == item)?.amount ?? 0);
		return items.reduce( (acc,i) => acc+i, 0);
	}

	static possessionWeightMod(item: TreasureItem) : number {
		if (this.isCollectableItem(item)) {return 1;}
		const amtOwned= this.amountOfItemOwnedByParty(item);
		return Math.max(0, 1 - amtOwned/3);
	}

	static isCollectableItem( item: TreasureItem) {
		switch (item.system.type) {
			case "consumable":
				return true;
			case "item":
				if (item.isCraftingItem) {return true;}
				return false;
			case "skillCard":
				return false;
			case "weapon":
				return false;
			default:
				item.system satisfies never;
				return false;
		}

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

