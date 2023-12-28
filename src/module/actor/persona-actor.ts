import { ACTORMODELS } from "../datamodel/actor-types.js"
import { PersonaItem } from "../item/persona-item.js"

	export class PersonaActor extends Actor<typeof ACTORMODELS, PersonaItem> {

		createNewItem() {
			return this.createEmbeddedDocuments("Item", [{"name": "Unnamed Item", type: "item"}])[0];
		}

		get inventory() {
		return this.items.filter( x=> x.system.type == "item" || x.system.type == "weapon");
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


