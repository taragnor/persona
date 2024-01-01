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

	async addNewPowerEffect(this: Power) {

		const arr= this.system.effects ?? [];
		arr.push( {
			conditions: [
				{
					type:"always",
			} ],
			consequences: [{
				type:"damage",
				amount:0
			}]
		});
		await this.update({ "system.effects": arr});
	}

	async addNewPowerPrecondition(this: Power, index:number) {
		const x = this.system.effects[index];
		x.conditions.push( {
			type: "always"
		});
		await this.update({"system.effects": x});
	}

	async addNewPowerConsequence(this: Power, index:number) {
		const x = this.system.effects[index];
		x.consequences.push( {
			type: "damage",
			amount: 0,
		});
		await this.update({"system.effects": x});
	}

}


export type CClass = Subtype<PersonaItem, "characterClass">;
export type Power = Subtype<PersonaItem, "power">;
