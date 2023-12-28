import { ACTORMODELS } from "../datamodel/actor-types.js"
import { PersonaItem } from "../item/persona-item.js"

	export class PersonaActor extends Actor<typeof ACTORMODELS, PersonaItem> {

		createNewItem() {
			return this.createEmbeddedDocuments("Item", [{"name": "Unnamed Item", type: "item"}])[0];
		}

		test() {
			if (this.system.type == "shadow") {
				this.system.tarot
			}
			if (this.system.type == "pc") {
				this.system.social.links
			}


		}

	}


