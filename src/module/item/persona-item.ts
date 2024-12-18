import { EMAccessor } from "../conditional-effect-manager.js";
import { ConditionalEffectManager } from "../conditional-effect-manager.js";
import { localize } from "../persona.js";
import { POWER_TAGS } from "../../config/power-tags.js";
import { ModifierList } from "../combat/modifier-list.js";
import { testPreconditions } from "../preconditions.js";
import { CardChoice } from "../../config/social-card-config.js";
import { CardEvent } from "../../config/social-card-config.js";
import { Consequence } from "../../config/consequence-types.js";
import { Precondition } from "../../config/precondition-types.js";
import { BASIC_PC_POWER_NAMES } from "../../config/basic-powers.js";
import { BASIC_SHADOW_POWER_NAMES } from "../../config/basic-powers.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { getActiveConsequences } from "../preconditions.js";
import { PersonaError } from "../persona-error.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { UniversalItemAccessor } from "../utility/db-accessor.js";
import { Situation } from "../preconditions.js";
import { SLOTTYPES } from "../../config/slot-types.js";
import { ModifierListItem } from "../combat/modifier-list.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { PowerType } from "../../config/effect-types.js";
import { PC } from "../actor/persona-actor.js";
import { Shadow } from "../actor/persona-actor.js";
import { ITEMMODELS } from "../datamodel/item-types.js";
import { PersonaDB } from "../persona-db.js";

declare global {
	type ItemSub<X extends PersonaItem["system"]["type"]> = Subtype<PersonaItem, X>;
}

export class PersonaItem extends Item<typeof ITEMMODELS> {

	declare parent : PersonaActor | undefined;

	getClassProperty<T extends keyof CClass["system"]["leveling_table"][number]> (this: CClass,lvl: number, property:T)  : CClass["system"]["leveling_table"][number][T] {
		const adjustedLvl = Math.clamp(lvl, 0, 11);
		const data = this.system.leveling_table[adjustedLvl][property];
		if (property == "slots") return ArrayCorrector(data as any) as any;
		return data;
	}

	get accessor() : UniversalItemAccessor<typeof this> {
		return PersonaDB.getUniversalItemAccessor(this);
	}

	static getBasicPCPowers() : Power[] {
		const basic = BASIC_PC_POWER_NAMES;
		return basic.flatMap( powerName =>  {
			const power = PersonaDB.getBasicPower(powerName);
			if (!power) return [];
			return [power as Power];
		});
	}

	static getBasicShadowPowers() : Power[] {
		const basic = BASIC_SHADOW_POWER_NAMES;
		return basic.flatMap( powerName =>  {
			const power = PersonaDB.getBasicPower(powerName);
			if (!power) return [];
			return [power as Power];
		});
	}

	get tags() : string {
		if ("tags" in this.system) {
			const tags= this.system.tags.map(tag => localize(POWER_TAGS[tag]));
			return tags.join(", ");
		}
		return "";
	}

	get amount() : number {
		if (this.system.type != "consumable") {
			return 1;
		}
		return this.system.amount;
	}

	get costString() : string {
		switch (this.system.type) {
			case "power":
				return (this as Power).powerCostString();
			case "consumable":
				return "consumable";
			default:
				return "free";
		}
	}

	isAnyItemType() : this is (InvItem | Weapon | Consumable) {
		switch (this.system.type) {
			case "consumable":
			case "item":
			case "weapon":
				return true;
			default:
				return false;
		}
	}

	powerCostString(this: Power) : string {
		if (!this.parent || this.parent.type == "pc")
			return this.powerCostString_PC();
		if (this.parent.type == "shadow")
			return this.powerCostString_Shadow();
		else return "";
	}

	grantsPowers(this: ModifierContainer): boolean {
		try{
			return this.getEffects(null).some(
				eff => eff.consequences.some(
					cons => cons.type == "add-power-to-list"
				));
		} catch (e) {
			console.log(this);
			return false;
		}
	}

	getGrantedPowers(this: ModifierContainer, user: PC | Shadow, situation?: Situation): Power[] {
		if (!this.grantsPowers()) return [];
		if (!situation) {
			situation = {
				user: user.accessor
			};
		}
		return this.getEffects(user)
			.filter(
				eff => eff.consequences.some(
					cons => cons.type == "add-power-to-list"
				))
			.flatMap(eff=> getActiveConsequences(eff, situation, this))
			.flatMap(x=> x.type == "add-power-to-list" ? [x.id] : [])
			.map(id=> PersonaDB.allPowers().find( x=>x.id == id))
			.flatMap( pwr=> pwr? [pwr]: []);
	}

	powerCostString_PC(this: Power) : string {
		switch (this.system.subtype) {

			case "weapon":
				if (this.system.hpcost)
					return `${this.system.hpcost} HP`;
				else return "free";
			case "magic":
				const mpcost = this.system.mpcost;
				return `${mpcost} MP`;
			case "social-link":
				if (this.system.inspirationCost > 0) {
					return `${this.system.inspirationCost} Inspiration`;
				}

			case "other":
			case "passive":
			case "none":
			case "standalone":
			case "defensive":
			case "downtime":
				break;
			default:
				this.system.subtype satisfies never;
		}
		return "free";
	}

	powerCostString_Shadow(this: Power) : string {
		let costs : string[] = [];
		if (this.system.energy.required > 0) {
			costs.push(`EN>=${this.system.energy.required}`);
		}
		if (this.system.energy.cost > 0) {
			costs.push(`EN-${this.system.energy.cost}`);
		}
		return costs.join(", ");
	}

	static getSlotName(num : number) {
		return game.i18n.localize(SLOTTYPES[num]);
	}

	/** required because foundry input hates arrays*/
	async sanitizeEffectsData(this: PowerContainer) {
		const isArray = Array.isArray;
		let update = false;
		let effects = this.system.effects;
		try {
			if (!isArray(this.system.effects)) {
				effects = ArrayCorrector(this.system.effects);
				update = true;
			}
			effects.forEach( ({conditions, consequences}, i) => {
				if (!isArray(conditions)) {
					effects[i].conditions = ArrayCorrector(conditions);
					update=  true;
				}
				if (!isArray(consequences)) {
					effects[i].consequences = ArrayCorrector(consequences);
					update=  true;
				}
			});
		} catch (e) {
			console.log(this);
			throw e;
		}
		if (update) {
			await this.update({"system.effects": effects});
		}
	}

	getModifier(this: ModifierContainer, bonusTypes : ModifierTarget[] | ModifierTarget, sourceActor: PC | Shadow) : ModifierListItem[] {
		bonusTypes = Array.isArray(bonusTypes) ? bonusTypes: [bonusTypes];
		return this.getEffects(sourceActor)
			.map(x =>
				({
					name: this.name,
					source: PersonaDB.getUniversalItemAccessor(this),
					conditions: ArrayCorrector(x.conditions),
					modifier: ModifierList.getModifierAmount(x.consequences, bonusTypes),
					variableModifier: ModifierList.getVariableModifiers(x.consequences, bonusTypes),
				})
			);
	}

	getDamage(this:ModifierContainer , user: PC | Shadow, type: "high" | "low", situation: Situation = {user: user.accessor , usedPower: this.accessor, hit: true,  attacker: user.accessor}) : number {
		if (!("dmg_type" in this.system)) return 0;
		if (this.system.dmg_type == "none") return 0;
		const subtype : PowerType  = this.system.type == "power" ? this.system.subtype : "standalone";
		switch(subtype) {
			case "weapon" : {
				const dmg = user.wpnDamage();
				const bonus = user.getBonuses("wpnMult");
				const mult = user.wpnMult() + (this.system.melee_extra_mult ?? 0) + bonus.total(situation);
				const bonusDamage = user.getBonusWpnDamage();
				return {
					low: dmg.low * mult + bonusDamage.low.total(situation),
					high: dmg.high * mult + bonusDamage.high.total(situation),
				}[type];
			}
			case "magic": {
				const dmg = user.magDmg();
				const mult = this.system.mag_mult;
				const bonuses =  user.getBonuses("magDmg");
				const bonus = bonuses.total(situation);
				const high_bonus = user.getBonuses("magHigh").total(situation);
				const low_bonus = user.getBonuses("magLow").total(situation);
				const modified = {
					low: ( (dmg.low + low_bonus)  * mult) + bonus,
					high: ((dmg.high + high_bonus) * mult) + bonus,
				};
				return modified[type];
			}
			case "standalone": {
				const dmg = this.system.damage;
				return dmg[type];
			}
			default:
				return 0;
		}
	}

	/** used for damage calculation estaimate for char sheet*/
	getDamageMultSimple(this: ModifierContainer, user: PC |Shadow, situation: Situation = {user: user.accessor , usedPower: this.accessor, hit: true, attacker: user.accessor} ) {
		const mainMods = user.getEffects();

		const multCons = this.getEffects(user)
			.concat(mainMods)
			.map ( eff => getActiveConsequences(eff,situation, this))
			.flat()
			.filter( x=> x.type == "dmg-mult" || ( x.type == "damage-new" && x.damageSubtype == "multiplier"));
		return multCons.reduce( (acc, cons) =>
			acc * ("amount" in cons ? cons.amount ?? 1: 1)
			,1);
	}

	critBoost(this: Usable, user: PC | Shadow) : ModifierList {
		const x = this.getModifier("criticalBoost", user);
		let list = new ModifierList(x);
		list = list.concat(user.critBoost());
		// list.add("Power Slot Modifier", this.baseCritSlotBonus());
		list.add("Power Modifier", this.system.crit_boost ?? 0);
		return list;
	}

	isBasicPower(this: Usable) : boolean {
		 if (this.system.type == "consumable") {return false;}
		const basics = [
			...PersonaItem.getBasicPCPowers(),
			...PersonaItem.getBasicShadowPowers()
		];
		return basics.includes(this as Power);
	}

	 baseCritSlotBonus(this: Usable) : number {
		 if (this.system.type == "consumable") {return 0;}
		 if (this.isBasicPower()) return 0;
		 switch (this.system.slot) {
			 case 0: return 0;
			 case 1: return 2;
			 case 2: return 4;
			 case 3: return 7;
			 default:
				 PersonaError.softFail(`Unknwon Slot Type :${this.system.slot}`);
				 return 0;
		 }
	 }

	mpCost(this: Usable, user: PC | Shadow) {
		if (this.system.type == "consumable") return 0;
		const sit : Situation = {
			user: user.accessor,
			usedPower: this.accessor,
		}
		let list = user.getBonuses("mpCostMult");
		const bonuses = this.getModifier("mpCostMult", user);
		list = list.concat(new ModifierList(bonuses));
		const mult = 1 + list.total(sit);
		return Math.round(this.system.mpcost * mult);
	}

	getSourcedEffects(this: ModifierContainer, sourceActor: PC | Shadow): {source: ModifierContainer, effects: ConditionalEffect[]} {
		return {
			source: this,
			effects: this.getEffects(sourceActor)
		};
	}

	getEffects(this: ModifierContainer, sourceActor : PC | Shadow | null): ConditionalEffect[] {
		return ConditionalEffectManager.getEffects(this.system.effects, this, sourceActor);
	}

	requiredLinkLevel(this: Focus) : number  {
		let requirement = 0;
		for (const eff of this.getEffects( null)) {
			for (const cond of eff.conditions) {
				if (cond.type == "numeric" && cond.comparisonTarget == "social-link-level")
				{
					if (cond.num)
						return cond.num;
				}
			}
		}
		return requirement;
	}

	isAvailable(this: Activity, pc: PC): boolean {
		const sit: Situation = {
			user: pc.accessor
		};
		if(!testPreconditions(this.system.conditions,sit, null)) return false;
		return this.system.weeklyAvailability.available;
	}

	async setAvailability(this: SocialCard, bool: boolean) {
		await	this.update( {"system.weeklyAvailability.available": bool});
	}

	async addCardEvent(this: SocialCard) {
		const newEv : CardEvent = {
			text: "",
			img: "",
			placement: {
				starter: true,
				middle: true,
				finale: true,
				special: false,
			},
			label: "",
			name: "Unnamed Event",
			frequency: 1,
			choices: [],
			conditions: [],
		};
		this.system.events.push( newEv);
		this.update({"system.events": this.system.events});
	}

	async deleteCardEvent(this: SocialCard, eventIndex: number) {
		this.system.events.splice(eventIndex, 1);
		this.update({"system.events": this.system.events});
	}

	async addEventChoice(this: SocialCard, eventIndex: number) {
		const event = this.system.events[eventIndex];
		const arr = ArrayCorrector(event.choices);
		const newChoice: CardChoice = {
			name: "Unnamed Choice",
			conditions: [],
			text: "",
			postEffects: {effects:[]},
			roll: {rollType: "none"},
		};
		arr.push( newChoice);
		event.choices = arr;
		await this.update({"system.events": this.system.events});
	}

	async deleteEventChoice(this: SocialCard, eventIndex: number, choiceIndex: number) {
		const event = this.system.events[eventIndex];
		const arr = ArrayCorrector(event.choices);
		arr.splice(choiceIndex, 1);
		event.choices = arr;
		await this.update({"system.events": this.system.events});
	}


	get perk() : string {
		switch (this.system.type) {
			case "job":
				return this.system.perk;
			case "socialCard":
				return this.system.perk;
			default:
				return "";
		}
	}

	async createNewTokenSpend(this: Activity | SocialCard) {
		const list = this.system.tokenSpends;
		const newItem : typeof list[number] = {
			conditions: [],
			amount: 1,
			text: "",
			consequences: []
		};
		list.push(newItem);
		await this.update({"system.tokenSpends":list});
	}

	async deleteTokenSpend(this: Activity | SocialCard, deleteIndex:number) {
		const list = this.system.tokenSpends;
		list.splice(deleteIndex,1);
		await this.update({"system.tokenSpends":list});
	}

	async priceFix() {
		//updates money to new x10 total
		switch (this.system.type) {
			case "item":
			case "consumable":
				const price = this.system.price * 10;
				await this.update({"system.price": price});
			default:
				return;
		}
	}

	isMultiTarget(this: Usable) : boolean {
		switch (this.system.targets) {
			case "1-nearby-dead":
			case "1-nearby":
			case "1-engaged":
			case "self":
				return false;
			case "1d4-random":
			case "1d4-random-rep":
			case "1d3-random":
			case "1d3-random-rep":
			case "all-enemies":
			case "all-allies":
			case "all-dead-allies":
			case "all-others":
			case "everyone":
				return true;
			default:
				this.system.targets satisfies never;
				PersonaError.softFail(`Unknown target type: ${this.system.targets}`);
				return false;
		}
	}

	isAoE(this: Usable) : boolean {
		switch (this.system.targets) {
			case "1-nearby-dead":
			case "1-nearby":
			case "1-engaged":
			case "self":
			case "1d4-random":
			case "1d4-random-rep":
			case "1d3-random":
			case "1d3-random-rep":
				return false;
			case "all-enemies":
			case "all-allies":
			case "all-dead-allies":
			case "all-others":
			case "everyone":
				return true;
			default:
				this.system.targets satisfies never;
				PersonaError.softFail(`Unknown target type: ${this.system.targets}`);
				return false;
		}
	}

	/** used for determining shadows usage limits
	 */
	powerEffectLevel(this: Power) : number {
		const base = this.system.slot * 3;
		const tags = this.system.tags;
		let mod = 0;
		if (tags.includes("healing")) {
			mod += 1;
		}
		// const multiMod = this.isMultiTarget() ? 1 : 0;
		const dmgtype = this.system.dmg_type;
		if (dmgtype == "dark" || dmgtype == "light")
			mod+= 1;
		if (this.isAoE()) {
			mod += 2;
		}
		return base + mod;
	}

}


/** Handlebars keeps turning my arrays inside an object into an object with numeric keys, this fixes that */
export function ArrayCorrector<T extends any>(obj: (T[] | Record<string | number, T>)): T[] {
	try {
		if (obj == null) return[];
		if (!Array.isArray(obj)) {
			return Object.keys(obj).map(function(k) { return obj[k] });
		}
	} catch (e) {
		throw e;
	}
	return obj;
}

export type CClass = Subtype<PersonaItem, "characterClass">;
export type Power = Subtype<PersonaItem, "power">;
export type Weapon = Subtype<PersonaItem, "weapon">;
export type InvItem = Subtype<PersonaItem, "item">;
export type Talent = Subtype<PersonaItem, "talent">;
export type Focus = Subtype<PersonaItem, "focus">;
export type Consumable = Subtype<PersonaItem, "consumable">;
export type Job = Subtype<PersonaItem, "job">;
export type Activity = SocialCard;
export type SocialCard = Subtype<PersonaItem, "socialCard">;

export type UniversalModifier = Subtype<PersonaItem, "universalModifier">;

export type ModifierContainer = Weapon | InvItem | Focus | Talent | Power | Consumable | UniversalModifier;

export type PowerContainer = Consumable | Power | ModifierContainer;
export type Usable = Power | Consumable;


type ConditionalEffectUpdater<T extends ConditionalEffectObjectContainer> = {
	array: T,
	updater : () => Promise<unknown>;
};

type ConditionalEffectObjectContainer =
	{effects: ConditionalEffect[]}
	| {consequences: Consequence[]}
	| {conditions: Precondition[]};


