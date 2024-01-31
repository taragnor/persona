import { PersonaItem } from "./item/persona-item.js";
import { DBAccessor } from "./utility/db-accessor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { ModifierContainer } from "./item/persona-item.js";
import { Focus } from "./item/persona-item.js";


class PersonaDatabase extends DBAccessor<PersonaActor, PersonaItem> {

	getClassById(id: string): Option<ItemSub<"characterClass">> {
		const item = this.getItemById(id);
		if (!item) return null;
		if (item.system.type == "characterClass") {
			return item as ItemSub<"characterClass">;
		}
		throw new Error("Id ${id} points towards invalid type");
	}

	getGlobalModifiers() : ModifierContainer [] {
		const items = this.getAllByType("Item") as PersonaItem[];
		const focii = items.filter( x=> x.system.type == "focus" && x.system.universal_modifier) as ModifierContainer[];
		return focii;
	}


}

export const PersonaDB = new PersonaDatabase();

//@ts-ignore
window.PersonaDB =PersonaDB;
