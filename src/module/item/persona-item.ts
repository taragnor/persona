import { ModifierListItem } from "../combat/modifier-list.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { PowerType } from "../../config/effect-types.js";
import { PC } from "../actor/persona-actor.js";
import { Shadow } from "../actor/persona-actor.js";
import { Situation } from "../combat/modifier-list.js";
import { Precondition } from "../combat/modifier-list.js";
import { ITEMMODELS } from "../datamodel/item-types.js";
import { PersonaDB } from "../persona-db.js";

declare global {
	type ItemSub<X extends PersonaItem["system"]["type"]> = Subtype<PersonaItem, X>;
}

export class PersonaItem extends Item<typeof ITEMMODELS> {

	getClassProperty<T extends keyof CClass["system"]["leveling_table"][number]> (this: CClass,lvl: number, property:T)  : CClass["system"]["leveling_table"][number][T] {
		return this.system.leveling_table[lvl][property];
	}

	static getBasicAttack() : Option<Power> {
		return PersonaDB.getItemByName("Basic Attack")  as Power;
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

	// async sanitizeModifiersData(this: ModifierContainer) {
	// 	const isArray = Array.isArray;
	// 	let update = false;
	// 	let mods = this.system.modifiers;
	// 	if (!isArray(this.system.modifiers)) {
	// 		mods = ArrayCorrector(mods);
	// 		update =  true;
	// 	}
	// 	mods.forEach( ({conditions, modifiers}, i) => {
	// 		if (!isArray(conditions)) {
	// 			mods[i].conditions = ArrayCorrector(conditions);
	// 			update = true;
	// 		}
	// 		if (!isArray(modifiers)) {
	// 			mods[i].modifiers = ArrayCorrector(modifiers);
	// 			update = true;
	// 		}
	// 	});
	// 	if (update) {
	// 		await this.update({"system.modifiers": mods});
	// 	}


	// }

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

async deletePowerPrecondition( this: PowerContainer, index: number) {
		const x = this.system.effects[index];
		x.conditions = ArrayCorrector(x.conditions);
	   x.conditions.splice(index, 1);
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

async deletePowerConsequence (this: PowerContainer, index: number) {
	const x = this.system.effects[index];
	x.consequences = ArrayCorrector(x.consequences);
	x.consequences.splice(index, 1);
	await this.update({"system.effects": this.system.effects});
}

getModifier(this: ModifierContainer, type : ModifierTarget) : Pick<ModifierListItem, "conditions" | "modifier">[] {
	return this.system.effects
		.map(x =>
			({
				conditions: x.conditions,
				modifier: x.consequences.reduce( (acc,x)=> {
					if ( x.modifiedField == type) return acc+(x.amount ?? 0);
					return acc;
				}, 0),
			})
		);
	// return this.system.modifiers[type];
}

	getDamage(this:Usable , user: PC | Shadow, type: "high" | "low") : number {
		const subtype : PowerType  = this.system.type == "power" ? this.system.subtype : "standalone";
		switch(subtype) {
			case "weapon" : {
				const dmg =user.wpnDamage(true);
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

}


/** Handlesbars keeps turning my arrays inside an object into an object with numeric keys, this fixes that */
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
export type StudentSkill = Subtype<PersonaItem, "studentSkill">;
export type Focus = Subtype<PersonaItem, "focus">;
export type Consumable = Subtype<PersonaItem, "consumable">;

export type ModifierContainer = Weapon | InvItem | Focus | Talent;

export type PowerContainer = Consumable | Power | ModifierContainer;
export type Usable = Power | Consumable;

