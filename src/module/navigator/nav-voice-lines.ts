import {RealDamageType, ResistStrength} from "../../config/damage-types.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {Persona} from "../persona-class.js";
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
	static nowPlaying = false;

	static async onStartCombat(combat: PersonaCombat) {
		const shadows = combat.combatants.contents
			.map( x=> x.actor)
			.filter (x=> x != undefined)
			.filter (x=> x.isShadow()
			);
		if (shadows.some(x=> x.hasRole("treasure-shadow"))) {
			return await this.playVoice({ type: "rare-enemy"});
		}
		if (shadows.some( x=> x.isBossOrMiniBossType())) {
			return await this.playVoice({type: "tough-enemy"});
		}
		switch (shadows.length) {
			case 1:
			case 2:
			case 3:
			case 4:
			case 5:
				return await this.playVoice({
					type: `${shadows.length}-enemy`}
				);
			default:
				return;
		}
	}

	static async playVoice (trigger: NavigatorVoiceEvent, selfOnly = !game.user.isGM) : PVoid {
		try {
			if (this.nowPlaying) {return;}
			const time = Date.now();
			if (time - this.lastChat < 2000) {return;}
			this.lastChat = time;
			if (!PersonaSettings.get("navigatorVoiceLines")) {
				return;
			}
			const navigator = PersonaDB.getNavigator();
			if (!navigator) {return;}
			let lines = navigator.navigatorVoiceLines
				.filter ( ln => ln.trigger == trigger.type);
			if (trigger.type == "vulnerable" || trigger.type == "immune") {
				lines= lines.filter ( x=> x.elementType == trigger.elementType)
			}
			if (lines.length == 0) {return;}
			const line = randomSelect(lines);
			if (selfOnly) {
				this.nowPlaying=true;
				await PersonaSounds.playFileSelf(line.fileName);
			} else {
				this.nowPlaying=true;
				await PersonaSounds.playFileAll(line.fileName);
			}
			this.nowPlaying = false;
		} catch (e) {
			Debug(e);
			PersonaError.softFail("Error in Navigator Chat", e);
			this.nowPlaying = false;
			return;
		}
	}

	static onHoverToken(token: Token<PersonaActor>, hover: boolean) {
		if (hover != true) {return;}
		const combat = game.combat as PersonaCombat;
		if(!combat || combat.isSocial) {return;}
		if (!combat.started) {return;}
		const actor = token.actor;
		if (!actor) {return;}
		if (!actor.isShadow()) {return;}
		const combatant = combat.findCombatant(actor);
		if (!combatant) {return;}
		const targetPersona = actor.persona();
		if (targetPersona.scanLevelRaw < 1) {return;}
		const currentActor = combat.combatant?.actor;
		if (!currentActor || !currentActor.isOwner) {return;}
		const damage = currentActor.persona().possibleElementTypes();
		const hintList =  damage.filter(
			dmgType => {
				const resist = this.knownElementResists(dmgType, targetPersona);
				return resist != "resist" && resist != "normal";
			});
		if (hintList.length == 0) {return;}
		const randElement = randomSelect(hintList);
		const resist = targetPersona.elemResist(randElement);
		switch (resist) {
			case "weakness":
				void this.playVoice({
					type: "vulnerable",
					elementType: randElement,
				}, true);
				return;
			case "absorb":
			case "reflect":
			case "block":
				void this.playVoice({
					type: "immune",
					elementType: randElement,
				}, true);
				return;
			default:
				return;
		}
	}

	static knownElementResists(element: RealDamageType,  persona: Persona) : ResistStrength {
		return persona.elemResist(element);

	}
}

Hooks.on("hoverToken", function (token: Token<PersonaActor>, hover: boolean) {
	NavigatorVoiceLines.onHoverToken(token, hover);
});

type PVoid = Promise<void>; //for some reason Promise<void> screws up indenting


type NavigatorVoiceEvent = {
	type: Exclude<NavigatorTrigger, "vulnerable" | "immune">
} | {
	type: "vulnerable" | "immune"
	elementType: RealDamageType,
};
