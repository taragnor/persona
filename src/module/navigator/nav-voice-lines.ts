import {RealDamageType, ResistStrength} from "../../config/damage-types.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {Encounter, RandomEncounter} from "../exploration/random-encounters.js";
import {Persona} from "../persona-class.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSounds} from "../persona-sounds.js";
import {PersonaSocial} from "../social/persona-social.js";
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
  "enemy-healing",
  "enemy-spotted",
  "reaper",
  "status-added", //to PC
  "generic-okay",
  "special" , //reclassify later
  "level-up",
  "warning",
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
      switch (trigger.type) {
        case "vulnerable":
        case "immune":
          lines = lines.filter ( x=> x.elementType == trigger.elementType
            && x.strongEnemy == trigger.strongEnemy
          );
          break;
        case "injured":
          lines = lines.filter ( x=> (x.level ?? 1) == trigger.severity);
          break;
        case "enemy-spotted":
            lines = lines.filter ( x=> (x.level ?? 1) == trigger.difficultyLevel);
          break;
      }
      if (lines.length == 0) {return;}
      const line = randomSelect(lines);
      if (selfOnly) {
        this.nowPlaying = true;
        await PersonaSounds.playFileSelf(line.fileName);
      } else {
        this.nowPlaying = true;
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

	static async onTargetKilled(target: ValidAttackers, combat: PersonaCombat) {
		if (target.isShadow()) {return;}
		const remainingPCs = combat.combatants.filter( c=>
				c.actor != undefined
				&& !c.actor.isShadow()
				&& c.actor.isAlive());
		if (remainingPCs.length <= 2) {
			await this.playVoice({
				type: "injured",
        severity: 3,
			});
		} else {
			await this.playVoice({
				type: "injured",
        severity: 2,
			});
    }
	}

  static async onTargetHeal(target: ValidAttackers, combat: PersonaCombat) {
    if (target.isNPCAlly() || target.isPC() || combat.isSocial) {return;}
    if (Math.random() < 0.5) {
			await this.playVoice({
				type: "enemy-healing",
			});
    }
  }

  static async onBattleLoss() {
    await this.playVoice( {
      type: "injured",
      severity: 4,
    });
  }

	static onHoverToken(token: Token<PersonaActor>, hover: boolean) {
		if (hover != true) {return;}
		if (game.user.isGM) {return;}
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
          strongEnemy: false,
				}, true);
				return;
			case "absorb":
			case "reflect":
			case "block":
				void this.playVoice({
					type: "immune",
					elementType: randElement,
          strongEnemy: false,
				}, true);
				return;
			default:
				return;
		}
	}

	static knownElementResists(element: RealDamageType,  persona: Persona) : ResistStrength {
		return persona.elemResist(element);

	}

  static async onEnemyEncountered(encounter: Encounter)  : Promise<void> {
    const diff = RandomEncounter.getLevelDiffString(encounter);
    let difficultyLevel = 1;
    switch (diff)  {
      case "Very Easy":
        difficultyLevel = -1;
        break;
      case "Easy":
        difficultyLevel = 0;
        break;
      case "Moderate":
      case "Strong":
        difficultyLevel = 1;
        break;
      case "Very Strong":
        difficultyLevel = 2;
        break;
      case "Overwhelming":
        difficultyLevel = 3;
        break;
      default:
        diff satisfies never;
    }
    await this.playVoice({
      type: "enemy-spotted",
      difficultyLevel,
    });
  }

  static async navigatorTalk(this:void, text: string) {
    const navigator = PersonaDB.getNavigator();
    if (!navigator) {return;}
    await PersonaSocial.characterDialog(navigator, text);
  }

    // const speaker  = {
    //   alias: navigator.name,
    // };
    // const content = `
    // <div class="f-row">
    // <img class="navigator-img" src=${navigator.img}>
    // <div class="navigator-speech">
    //   "${text}"
    // </div>
    // </div>
    // `;
    // const messageData = {
    //   speaker: speaker,
    //   content,
    //   style: CONST.CHAT_MESSAGE_STYLES.IC,
    // };
    // await ChatMessage.create(messageData, {});
    // }

}


Hooks.on("hoverToken", function (token: Token<PersonaActor>, hover: boolean) {
	NavigatorVoiceLines.onHoverToken(token, hover);
});

type PVoid = Promise<void>; //for some reason Promise<void> screws up indenting


type NavigatorVoiceEvent = {
	type: Exclude<NavigatorTrigger, "vulnerable" | "immune" | "injured" | "enemy-spotted" | "level-up">
} | {
	type: "vulnerable" | "immune"
	elementType: RealDamageType,
  strongEnemy: boolean,
} | {
  type: "injured",
  severity: number,
} | {
  type: "enemy-spotted",
  difficultyLevel: number,
} | {
  type: "level-up",
  isNavigator: boolean,
};

//@ts-expect-error adding to global
window.navTalk = NavigatorVoiceLines.navigatorTalk;
