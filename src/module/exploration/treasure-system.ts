import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaDB } from "../persona-db.js";
import { weightedChoice } from "../utility/array-tools.js";
import { ProbabilityRate } from "../../config/probability.js";
import { TreasureTable } from "../../config/treasure-tables.js";
import {PersonaError} from "../persona-error.js";
import {Carryable, Tag} from "../item/persona-item.js";

export class TreasureSystem {
	static generate(treasureLevel: number, modifier : number = 0, treasureMin = 1) : EnchantedTreasureFormat[] {
		const treasureRoll = this.treasureRoll(modifier, treasureMin);
		const table = this.convertRollToTreasureTable(treasureRoll);
		const item = this.generateFromTable(table, treasureLevel);
		const otherTreasure = this.moreTreasure(treasureRoll) ? this.generate(treasureLevel, modifier, treasureMin) : [];
		if (!item) {return otherTreasure;}
		if (item.isEnchantable()) {
			if (item.isInvItem()) {
				if (item.system.slot == "weapon_crystal") {
					modifier -= 50;
				}
				if (item.system.slot == "accessory") {
					treasureMin = Math.max(50, treasureMin);
				}

			}
			const enchantmentRoll = this.treasureRoll(modifier, treasureMin);
			const enchantmentTable = this.convertRollToTreasureTable(enchantmentRoll);
			const enchantment = this.generateEnchantmentFromTable(enchantmentTable, treasureLevel);
			if (enchantment) {
				return [{
					item,
					enchantments: [enchantment],
				} ] .concat(otherTreasure);
			}
		}
		return [{
			item,
			enchantments: [],
		} as EnchantedTreasureFormat].concat(otherTreasure);
	}

	static moreTreasure (treasureRoll: number) : boolean {
		const die = treasureRoll ;
		switch (true)  {
			case die > 40 && die <= 50: return true;
			case die >= 73 && die < 75: return true;
			default: return false;
		}
	}
	static treasureRoll(modifier: number, treasureRollMin: number) : number {
		modifier += treasureRollMin;
		const dieSize = 101 - treasureRollMin;
		const die = modifier + Math.floor(Math.random() * dieSize);
		return die;
	}

	static convertRollToTreasureTable(rollValue: number) : Exclude<TreasureTable, "none"> {
		const die = rollValue;
		switch (true) {
			case die < 60: return "trinkets";
			case die < 80: return "lesser";
			case die < 100: return "greater";
			case die >= 100: return "royal";
			default: {
				PersonaError.softFail(`Defaulting to trinkets due to bad value for die ${die}`);
				return "trinkets";
			}
		}
	}

	static enchantmentList(table: Exclude<TreasureTable, "none">, treasureLevel: number) : Tag[] {
		return PersonaDB.enchantments()
			.filter ( item =>
				item.system.treasure.trinkets.enabled
				|| item.system.treasure.lesser.enabled
				|| item.system.treasure.greater.enabled
				|| item.system.treasure.royal.enabled
			)
		.filter( tag =>
			tag.system.treasure[table].enabled
			&& treasureLevel >= tag.system.treasure[table].minLevel
			&& treasureLevel <= tag.system.treasure[table].maxLevel
		);
	}

	static treasureList(table: Exclude<TreasureTable, "none">, treasureLevel: number)  : Carryable[] {
		return PersonaDB.treasureItems()
			.filter ( item =>
				item.system.treasure.trinkets.enabled
				|| item.system.treasure.lesser.enabled
				|| item.system.treasure.greater.enabled
				|| item.system.treasure.royal.enabled
			)
			.filter( item =>
				item.system.treasure[table].enabled
				&& treasureLevel >= item.system.treasure[table].minLevel
				&& treasureLevel <= item.system.treasure[table].maxLevel
			);
	}

	static generateFromTable(table: Exclude<TreasureTable, "none">, treasureLevel: number) : U<TreasureItem> {
		const list = this.treasureList(table, treasureLevel);
		if (list.length == 0) {return undefined;}
		const weights = list
		.map( item=> {
			const rarity = item.system.treasure[table].rarity;
			const possessionMult = this.possessionWeightMod(item);
			const baseWeight = ENCOUNTER_RATE_PROBABILITY[rarity];
			const weight = baseWeight * possessionMult;
			return { item, weight };
		});
		return weightedChoice(weights);
	}

	static amountOfItemOwnedByParty(item : TreasureItem) : number {
		const pcsAndAllies = game.actors.filter( (act:PersonaActor) => act.isPC() || act.isNPCAlly()) as PersonaActor[];
		const items = pcsAndAllies.map( actor => actor.items.find(i=> i == item)?.amount ?? 0);
		return items.reduce( (acc,i) => acc+i, 0);
	}

	static possessionWeightMod(item: TreasureItem) : number {
		if (this.isCollectableItem(item)) {return 1;}
		const amtOwned= this.amountOfItemOwnedByParty(item);
		return Math.max(0.25, 1 - amtOwned/3);
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

	static generateEnchantmentFromTable(table: Exclude<TreasureTable, "none">, treasureLevel: number) : U<Tag> {
		const list = this.enchantmentList(table, treasureLevel);
		if (list.length == 0) {return undefined;}
		const weights = list
		.map( item=> {
			const rarity = item.system.treasure[table].rarity;
			const baseWeight = ENCOUNTER_RATE_PROBABILITY[rarity];
			const weight = baseWeight;
			return { item, weight };
		});
		return weightedChoice(weights);
	}

	static printEnchantedTreasureString(treasure: EnchantedTreasureFormat) : string {
		const basename = treasure.item.name;
		if (treasure.enchantments.length == 0) {
			return basename;
		}
		const enchantments = treasure.enchantments.map( x=> x.name);
		return `${basename} (${enchantments.join(", ")})`;
	}

	static async test(treasureLevel: number, modifier: number = 0, minLevel: number = 1) {
		const arr : EnchantedTreasureFormat[] = [];
		for (let i = 0; i <100; i++ ) {
			const treasure = this.generate(treasureLevel, modifier, minLevel);
			if (treasure) { arr.push(...treasure); }
		}
		await this.handleTreasureRolls(arr);
	}

	static async handleTreasureRolls (treasures: EnchantedTreasureFormat[]) {
		if (treasures.length == 0) {return;}
		let html = `<h2> Treasure Found </h2>`;
		for (const treasure of treasures) {
			const treasureString = TreasureSystem.printEnchantedTreasureString(treasure);
			html +=`<div> ${treasureString} </div>`;
		}
		return await ChatMessage.create({
			speaker: {
				alias: "Treasure Rolls"
			},
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
		});
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


//@ts-expect-error testing
window.TreasureSystem = TreasureSystem;

export type EnchantedTreasureFormat = {
	item: TreasureItem,
	enchantments: Tag[]
}

