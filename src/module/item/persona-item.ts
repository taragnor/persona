import { ITEMMODELS } from "../datamodel/item-types.js";
import { PersonaDB } from "../persona-db.js";

declare global {
	type ItemSub<X extends PersonaItem["system"]["type"]> = Subtype<PersonaItem, X>;
}

export class PersonaItem extends Item<typeof ITEMMODELS> {

	getClassProperty<T extends keyof CClass["system"]["leveling_table"][number]> (this: CClass,lvl: number, property:T)  : CClass["system"]["leveling_table"][number][T] {
		return this.system.leveling_table[lvl][property];
	}

	static getBasicAttack() : Power {
		return PersonaDB.getItemByName("Basic Attack")  as Power;
	}

}


export type CClass = Subtype<PersonaItem, "characterClass">;
export type Power = Subtype<PersonaItem, "power">;
