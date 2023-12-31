import { Power } from "../item/persona-item.js";
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

		set hp(newval: number) {
			this.update({"system.combat.hp": newval});
		}
		get hp(): number {
			if (this.system.type =="npc") return 0;
			return this.system.combat.hp;

		}

		get mhp() : number {
			if (this.system.type == "npc") return 0;
			try {
				const inc= this.hasIncremental("hp")? 1: 0;
				const lvl = this.system.combat.classData.level;
				return this.class.getClassProperty(lvl + inc, "maxhp");
			} catch (e) {
				console.warn(`Can't get Hp for ${this.name} (${this.id})`);
				return 0;
			}
		}

		hasIncremental(type: keyof Subtype<PersonaActor, "pc">["system"]["combat"]["classData"]["incremental"]) {
			switch (this.system.type) {
				case "pc": case "shadow":
					return this.system.combat.classData.incremental[type];
				default:
					throw new Error("Doesn't have incremental");
			}

		}

		getMaxSlotsAt(slot_lvl: number) : number {
			if (this.system.type != "pc") return 0;
			try {
				const inc =this.hasIncremental("slots") ? 1 : 0;
				const lvl = this.system.combat.classData.level;
				return this.class.getClassProperty(lvl + inc, "slots")[slot_lvl] ?? -999;

			} catch (e) {
				return -999;
			}
		}

		get powers(): Power[] {
			if (this.system.type =="npc") return [];
			try {
				const powerIds = this.system.combat.powers;
				const powers : Power[] = powerIds
					.flatMap( id => {
						const i = PersonaDB.getItemById(id) as Power;
						return i ? [i] : []
					});
				const basicAtk = PersonaItem.getBasicAttack();
				return powers.concat([basicAtk]);
			} catch(e) {
				console.error(e);
				return [];
			}
		}



	}

