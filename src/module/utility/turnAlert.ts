import { PersonaSounds } from "../persona-sounds.js";


export class TurnAlert {
	static alert() {
			void PersonaSounds.play("alert.mp3", 1.0, false);
		}
	}
