import { ACTORMODELS } from "../datamodel/actor-types"

	export class PersonaActor extends Actor<typeof ACTORMODELS> {

		test() {
			if (this.system.type == "shadow") {
				this.system.shadowattack
			}
			if (this.system.type == "npc") {
				this.system.schemaTest.num
			}


		}

	}


