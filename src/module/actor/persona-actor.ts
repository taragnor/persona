import { ACTORMODELS } from "../datamodel/actor-types.js"

	export class PersonaActor extends Actor<typeof ACTORMODELS> {

		test() {
			if (this.system.type == "shadow") {
				this.system.tarot
			}
			if (this.system.type == "pc") {
				this.system.social.links
			}


		}

	}


