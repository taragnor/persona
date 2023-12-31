import { PersonaDB } from "../persona-db.js";
import { ACTORMODELS } from "../datamodel/actor-types.js"
import { PersonaItem } from "../item/persona-item.js"

declare global {
	type ActorSub<X extends PersonaActor["system"]["type"]> = Subtype<PersonaActor, X>;
}

	export class PersonaActor extends Actor<typeof ACTORMODELS, PersonaItem> {

		async createNewItem() {
			return (await this.createEmbeddedDocuments("Item", [{"name": "Unnamed Item", type: "item"}]))[0];
		}

		get inventory() : ItemSub<"weapon" | "item">[] {
			return this.items.filter( x=> x.system.type == "item" || x.system.type == "weapon") as ItemSub<"weapon" | "item">[];
		}

		get class() : Subtype<PersonaItem, "characterClass"> {
			let classNameDefault;
			switch (this.system.type) {
				case "pc":
					classNameDefault = "Persona User";
					break;
				case "shadow":
					classNameDefault = "Shadow";
					break;
				default:
					throw new Error("NPCs have no classes");
			}
			const id = this.system.combat.classData.classId;
			let cl = PersonaDB.getClassById(id);
			if (!cl) {
				const namesearch = PersonaDB.getItemByName(classNameDefault)
				if (!namesearch)
					throw new Error(`Couldn't find class id: ${id} or name: ${classNameDefault}`);
				if (namesearch.system.type != "characterClass")
				{
					throw new Error("Bad Item named: ${classNameDefault}, expecting a character class");
				}
				cl = namesearch as ItemSub<"characterClass">;
			}
			return cl;
		}

		test() {
			if (this.system.type == "shadow") {
				this.system.tarot
			}
			if (this.system.type == "pc") {
				this.system.combat.hp.curr
				this.system.social.links
			}


		}

	}

