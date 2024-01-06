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

	getItemBonus(this: InvItem | Weapon, type : keyof InvItem["system"]["modifiers"]) : number {
		return this.system.modifiers[type];
	}

}


/** Handlesbars keeps turning my arrays inside an object into an object with numeric keys, this fixes that */
export function ArrayCorrector<T extends any>(obj: (T[] | Record<string | number, T>)): T[] {
	if (!Array.isArray(obj)) {
		return Object.keys(obj).map(function(k) { return obj[k] });
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

export type PowerContainer = Consumable | Power;

