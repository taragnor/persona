import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSounds} from "../persona-sounds.js";
import {randomSelect} from "../utility/array-tools.js";
import {HTMLTools} from "../utility/HTMLTools.js";

const NAVIGATOR_TRIGGER_LIST = [
	"unused",
	"rare-enemy",
	"tough-enemy",
	"1-enemy",
	"2-enemy",
	"3-enemy",
	"4-enemy",
	"5-enemy",
	"1-enemy-adv",
	"2-enemy-adv",
	"3-enemy-adv",
	"4-enemy-adv",
	"5-enemy-adv",
	"1-enemy-amb",
	"2-enemy-amb",
	"3-enemy-amb",
	"4-enemy-amb",
	"5-enemy-amb",
	"boss-enemy",
	"immune",
	"vulnerable",
	"injured",
	"great-work",
	"recovery",

] as const;

export type NavigatorTrigger = typeof NAVIGATOR_TRIGGER_LIST[number];

export const NAVIGATOR_TRIGGERS = HTMLTools.createLocalizationObject( NAVIGATOR_TRIGGER_LIST, "persona.navigator.voicelines.types");

export class NavigatorVoiceLines {

	static lastChat = 0;

	static async onStartCombat(combat: PersonaCombat) {
		const shadows = combat.combatants.contents
			.map( x=> x.actor)
			.filter (x=> x != undefined)
			.filter (x=> x.isShadow()
			);
		if (shadows.some(x=> x.hasRole("treasure-shadow"))) {
			return await this.playVoice("rare-enemy");
		}
		if (shadows.some( x=> x.isBossOrMiniBossType())) {
			return await this.playVoice("tough-enemy");
		}
		switch (shadows.length) {
			case 1:
			case 2:
			case 3:
			case 4:
			case 5:
				return await this.playVoice(`${shadows.length}-enemy`);
			default:
				return;
		}
	}

	static async playVoice (trigger: NavigatorTrigger, selfOnly = !game.user.isGM) : PVoid {
		try {
			const time = Date.now();
			if (time - this.lastChat < 7000) {return;}
			this.lastChat = time;
			if (!PersonaSettings.get("navigatorVoiceLines")) {
				return;
			}
			const navigator = PersonaDB.getNavigator();
			if (!navigator) {return;}
			const lines = navigator.navigatorVoiceLines
				.filter ( ln => ln.trigger == trigger);
			if (lines.length == 0) {return;}
			const line = randomSelect(lines);
			if (selfOnly) {
				await PersonaSounds.playFileSelf(line.fileName);
			} else {
				await PersonaSounds.playFileAll(line.fileName);
			}
		} catch (e) {
			Debug(e);
			PersonaError.softFail("Error in Navigator Chat", e);
			return;
		}
	}

}

type PVoid = Promise<void>; //for some reason Promise<void> screws up indenting

