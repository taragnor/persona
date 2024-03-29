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

	getClassProperty<T extends keyof CClass["system"]["leveling_table"][number]> (this: CClass,lvl: number, property:T)  : CClass["system"]["leveling_table"][number][T] {
		return this.system.leveling_table[lvl][property];
	}

	get accessor() : UniversalItemAccessor<typeof this> {
		return PersonaDB.getUniversalItemAccessor(this);
	}

	static getBasicPowers() : Power[] {
		const basic = [
			"Basic Attack",
			"Defend",
			"All-out Attack",
		] as const;
		return basic.flatMap( (powerName:string) =>  {
const power = PersonaDB.getItemByName(powerName);
			if (!power) return [];
			return [power as Power];
		});
	}

	get tags() : string {
		if ("tags" in this.system)
			return this.system.tags.join(", ");
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

	powerCostString(this: Power) : string {
		switch (this.system.subtype) {

			case "weapon":
				if (this.system.hpcost) 
					return `${this.system.hpcost} HP`;
				else return "free";
			case "magic":
				const slotName = PersonaItem.getSlotName(this.system.slot);
				return `${slotName} slot`;
			default:
				return "free";
		}

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

	async addNewPowerEffect(this: PowerContainer) {
		const arr= this.system.effects ?? [];
		arr.push( {
			conditions: [],
			consequences: []
		});
		await this.update({ "system.effects": arr});
	}

	async deletePowerEffect(this: PowerContainer, index: number) : Promise<void> {
		let arr =this.system.effects ?? [];
		arr.splice(index, 1);
		await this.update({ "system.effects": arr});
	}

	async addNewPowerPrecondition(this: PowerContainer, index:number) {
		const x = this.system.effects[index];
		x.conditions = ArrayCorrector(x.conditions);
		x.conditions.push( {
			type: "always"
		});
		await this.update({"system.effects": this.system.effects});
	}

	async deletePowerPrecondition( this: PowerContainer, effectIndex: number, condIndex: number) {
		const x = this.system.effects[effectIndex];
		x.conditions = ArrayCorrector(x.conditions);
		x.conditions.splice(condIndex, 1);
		await this.update({"system.effects": this.system.effects});
	}

	async addNewPowerConsequence(this: PowerContainer, index:number) {
		const x = this.system.effects[index];
		x.consequences = ArrayCorrector(x.consequences);
		x.consequences.push( {
			type: "none",
			amount: 0,
		});
		await this.update({"system.effects": this.system.effects});
	}

	async deletePowerConsequence (this: PowerContainer, effectIndex: number, consIndex: number) {
		const x = this.system.effects[effectIndex];
		x.consequences = ArrayCorrector(x.consequences);
		x.consequences.splice(consIndex, 1);
		await this.update({"system.effects": this.system.effects});
	}

	getModifier(this: ModifierContainer, type : ModifierTarget) : ModifierListItem[] {
		return this.system.effects
			.map(x =>
				({
					name: this.name,
					source: PersonaDB.getUniversalItemAccessor(this),
					conditions: ArrayCorrector(x.conditions),
					modifier: ArrayCorrector(x.consequences).reduce( (acc,x)=> {
						if ( x.modifiedField == type) {
							if (x.amount != 0) return acc+(x.amount ?? 0);
						}
						return acc;
					}, 0),
					variableModifier: new Set(ArrayCorrector(x.consequences).flatMap ( x=> {
						if (x.modifiedField != type) return [];
						if (x.type == "add-escalation") return ["escalationDie"];
						return [];
					}))
				})
			);
		// return this.system.modifiers[type];
	}

	getDamage(this:Usable , user: PC | Shadow, type: "high" | "low", situation: Situation = {user: user.accessor , usedPower: this.accessor}) : number {
		if (this.system.dmg_type == "none") return 0;
		const subtype : PowerType  = this.system.type == "power" ? this.system.subtype : "standalone";
		switch(subtype) {
			case "weapon" : {
				const dmg = user.wpnDamage(true, situation);
				const bonus = this.system.damage;
				const modified = {
					low: dmg.low + bonus.low,
					high: dmg.high + bonus.high
				}
				return modified[type];
			}
			case "magic": {
				const dmg = user.magDmg();
				const mult = this.system.mag_mult;
				const modified = {
					low: dmg.low * mult,
					high: dmg.high * mult
				}
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

	getEffects(this: ModifierContainer) {
		return this.system.effects.map( eff=> {
			return {
				conditions: ArrayCorrector(eff.conditions),
				consequences: ArrayCorrector(eff.consequences)
			}
		});
	}

	requiredLinkLevel(this: Focus) : number  {
		let requirement = 0;
		for (const eff of ArrayCorrector(this.system.effects)) {
			for (const cond of ArrayCorrector(eff.conditions)) {
				if (cond.type == "requires-social-link-level")
				{
					if (cond.num)
						requirement = Math.max(requirement, cond.num);
				}
			}
		}
		return requirement;
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

export type UniversalModifier = Subtype<PersonaItem, "universalModifier">;

export type ModifierContainer = Weapon | InvItem | Focus | Talent | Power | Consumable | UniversalModifier;

export type PowerContainer = Consumable | Power | ModifierContainer;
export type Usable = Power | Consumable;

