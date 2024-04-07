import { Logger } from "./utility/logger.js";
import { PC } from "./actor/persona-actor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { PersonaSettings } from "../config/persona-settings.js";

export class Metaverse {
	static isEnhanced() : boolean {
		return PersonaSettings.isMetaverseEnhanced(); //placeholder
	}

	static async enterMetaverse() {
		(game.actors as Collection<PersonaActor>)
			.filter( (x: PersonaActor)=> x.system.type == "pc")
			.forEach( (x: PC)=> x.OnEnterMetaverse());
		game.scenes
			.forEach( scene => scene.tokens.contents
				.forEach( tok => (tok.actor as PersonaActor | undefined)?.fullHeal()
				)
			);

		Hooks.callAll("enterMetaverse");
		await Logger.sendToChat(`Entering Metaverse...`);
	}

	static async exitMetaverse() {
		(game.actors as Collection<PersonaActor>)
			.filter( (x: PersonaActor)=> x.system.type == "pc")
			.forEach( (x: PC)=> x.OnExitMetaverse());
		Hooks.callAll("exitMetaverse");
		await Logger.sendToChat(`Exiting Metaverse...`);
	}

}


declare global {
	interface HOOKS {
		"exitMetaverse" : () => void;
		"enterMetaverse" : () => void;
	}
}



//@ts-ignore
window.Metaverse = Metaverse;
