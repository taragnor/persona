import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaDB } from "../persona-db.js";
import { weightedChoice } from "../utility/array-tools.js";
import { CARD_DROP_RATE, ITEM_DROP_RATE, ProbabilityRate, RANDOM_POWER_RATE } from "../../config/probability.js";
import { TreasureTable } from "../../config/treasure-tables.js";
import {PersonaError} from "../persona-error.js";
import {PersonaItem} from "../item/persona-item.js";

export class TreasureSystem {
	static generate(treasureLevel: number, modifier : number = 0, treasureMin = 1) : EnchantedTreasureFormat[] {
		const treasureRoll = this.treasureRoll(modifier, treasureMin);
		const table = this.convertRollToTreasureTable(treasureRoll);
		const item = this.generateFromTable(table, treasureLevel);
		const otherTreasure = this.moreTreasure(treasureRoll) ? this.generate(treasureLevel, modifier, treasureMin) : [];
		if (!item) {return otherTreasure;}
		if (item.isEnchantable()) {
			const enchantment = this.generateEnchantment(item, treasureLevel, modifier, treasureMin);
			if (enchantment) {
				return [{
					item: item.accessor as UniversalItemAccessor<TreasureItem>,
					enchantments: [enchantment.id],
				} ] .concat(otherTreasure);
			}
		}
		return [{
			item: item.accessor,
			enchantments: [],
		} as EnchantedTreasureFormat].concat(otherTreasure);
	}

	static generateEnchantment(item: Carryable, treasureLevel: number, modifier = 0, treasureMin = 1) : U<Tag> {
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
		return enchantment;
	}

	static async DorisAbility(item: Carryable) {
		if (!item.parent) {
			ui.notifications.warn("This requires an item held by a PC");
			return null;
		}
		const enchantment = this.generateEnchantment(item, item.parent.level);
		const html = `
			<h2> Re-enchanting ${item.name} </h2>
			Result : ${enchantment?.name ?? "Ritual Fizzled"}
			`;
		await ChatMessage.create( {
			speaker: {
				alias: "Re-enchantment ${item.name}"
			},
			content: html,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,

		});
		return enchantment;
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
		const basename = PersonaDB.findItem(treasure.item).name;
		if (treasure.enchantments.length == 0) {
			return basename;
		}
		const enchantments = treasure.enchantments.map( x=> PersonaDB.allTags().get(x)?.name);
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

	static randomPower(slot?:0 | 1 | 2 | 3, forbidExotic : boolean= false) {
		const powers = PersonaDB.allPowersArr()
			.filter ( pwr => pwr.isInheritable())
			.filter ( pwr => slot != undefined ? pwr.system.slot == slot : true)
			.filter ( pwr => forbidExotic ? !pwr.isExotic() : true);
		const weightedPowers = powers.map ( pwr =>
			({
				item: pwr,
				weight: RANDOM_POWER_RATE[pwr.system.rarity]
			}));
		return weightedChoice(weightedPowers);
	}


	private static async considerSkillCard(powerId: string, prob: number) : Promise<SkillCard[]> {
		if (!powerId) {return [];}
		const power = PersonaDB.allPowers().get(powerId);
		if (!power) {
			PersonaError.softFail(`Can't fiund Power Id ${powerId} for treasure`);
			return [];
		}
		if (Math.random() > prob) {return [];}
		const existingCard = PersonaDB.skillCards().find( x=> x.system.skillId  ==  powerId);
		if (existingCard) {
			return [existingCard];
		}
		const newCard = await PersonaItem.createSkillCardFromPower(power);
		const msg = `Skill Card created for ${power.name}`;
		ui.notifications.notify(msg);
		console.log(msg);
		return [newCard];
	}

	private static considerItem (itemId: string, prob: number, maxAmount = 1) : Carryable[] {
		const item = PersonaDB.treasureItems().find(x=> x.id == itemId);
		let amt = Math.max(1, Math.floor(Math.random() * maxAmount + 1));
		const arr : Carryable[] = [];
		while (amt-- > 0) {
			if (!item || prob <= 0) {return [];}
			if (Math.random() > prob) {return [];}
			arr.push(item);
		}
		return arr;
	}

	static async generateTreasureForShadow( shadow: Shadow) : Promise<TreasureItem[]> {
		const items : TreasureItem[] = [];
		if (shadow.isDMon()) { return [];}
		const size = shadow.encounterSizeValue();
		const treasure = shadow.system.encounter.treasure;
		const arr = ["item0", "item1", "item2", "item3"] as const;
		const treasureMod = shadow.persona().getBonuses("shadowItemDropRate").total(shadow, "percentage");
		const shadowItems = arr.reduce ( (acc, str) => {
			const item = treasure[str];
			if (!item) {return acc;}
			const prob = treasure[`${str}prob_v`];
			const percentage = ITEM_DROP_RATE[prob] * size * treasureMod;
			const maxAmount = treasure[`${str}maxAmt`];
			if (percentage <= 0) {
				return acc;
			}
			const treasureItem = this.considerItem(item, percentage, maxAmount);
			return acc.concat(treasureItem);
		}, [] as TreasureItem[]);
		const cardId = treasure["cardPowerId"];
		if (cardId) {
			const prob = treasure["cardProb_v"];
			const percentage = CARD_DROP_RATE[prob] * size;
			const card = await this.considerSkillCard(cardId, percentage);
			if (card.length > 0) {
				shadowItems.push(...card);
			}
		}
		items.push(...shadowItems);
		return items;
	}

	static async generateBattleTreasure(shadows: PersonaActor[]): Promise<BattleTreasure> {
		try {
			const money = shadows.reduce( (a,s) => a + s.moneyDropped(), 0);
			const promises : Promise<TreasureItem[]>[] = shadows
				.filter ( x=> x.isShadow())
				.flatMap( async (shadow) => await this.generateTreasureForShadow(shadow));
			const items = (await Promise.all(promises)).flat();
			const treasure : BattleTreasure = { money, items };
			return treasure;
		} catch (e) {
			PersonaError.softFail( "Problem with generating battle treasure", e);
			return {money: 0, items: []};
		}
	}

	static getValueOf(treasure: EnchantedTreasureFormat)  :number {
		const item = PersonaDB.findItem(treasure.item);
		const baseVal = item.moneyValue;
		const val= treasure.enchantments
			.reduce ( (acc, enc)=> {
				const tag = PersonaDB.allTags().get(enc);
				if (!tag) {return acc;}
				return acc * this.getTagCostMultiplier(tag);
			}, baseVal);
		return Math.round(val * (treasure.costMult ?? 1));
	}

	static baseItemPriceByLevel(item: Carryable) : number {
		const base = item.system.price ?? 0;
		if (base > 0) {return base;}
		const ILevelCost=  this._itemCost(item.itemLevel());
		if (item.isConsumable()) {return Math.round(ILevelCost * 0.33);}
		return Math.round(ILevelCost);
	}

	static getTagCostMultiplier(tag: Tag) : number {
		if (tag.system.priceMult != 1) {return tag.system.priceMult;}
		return (1 + 0.15 * tag.itemLevel());
	}

	private static _itemCost(lvl: number) : number {
		if (lvl <= 0) {return 0;}
		if (lvl == 1) {return 40;}
		return Math.round(this._itemCost(lvl -1) * 1.33);

	}

	static guessItemLevel(item: Carryable | Tag) : number {
		const treasure = item.system.treasure;
		for (let i = 0; i < 100; i+=5) {
			if (i >= treasure.royal.minLevel
				&& i <= treasure.royal.maxLevel)
				{return Math.max(1, Math.round(i / 10) + 1);}
		}
		for (let i = 0; i < 100; i+=5) {
			if (i >= treasure.greater.minLevel
				&& i <= treasure.greater.maxLevel )
				{return Math.max(1 ,Math.round(i / 10));}
		}
		for (let i = 0; i < 100; i+=5) {
			if (i >= treasure.lesser.minLevel
				&& i <= treasure.lesser.maxLevel)
				{return Math.max( 1 , Math.round(i / 10) - 1);}
		}
		for (let i = 0; i < 100; i +=5) {
			if (i >= treasure.trinkets.minLevel
				&& i <= treasure.trinkets.maxLevel)
				{return Math.max(1, Math.round(i / 10) - 3);}
		}
		return item.isTag() ? 0 : 1;
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
	item: UniversalItemAccessor<TreasureItem>,
	enchantments: Tag["id"][],
	costMult ?: number,
}


type BattleTreasure = {
	money : number,
	items: TreasureItem[],
};


