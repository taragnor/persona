import {PersonaSettings} from "../../config/persona-settings.js";import {StatusEffectId} from "../../config/status-effects.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {GENERAL_COMBATANT_VOICE_TRIGGERS} from "../navigator/nav-voice-lines.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {randomSelect} from "../utility/array-tools.js";
import {sleep} from "../utility/async-wait.js";
import {PersonaActor} from "./persona-actor.js";

export class ActorVoiceLines {
  private actor: PersonaActor;

  private nowPlaying: boolean = false;

  constructor (actor: PersonaActor) {
    this.actor = actor;
  }

  /** returns true if voice is played */
  async onEvent(trigger: keyof typeof GENERAL_COMBATANT_VOICE_TRIGGERS, eventOptions : VoiceEventOptions = {}) : Promise<boolean> {
    try {
      if (!this.actor.isNPCAlly()) {return false;}
      switch (trigger) {
        case "on-attack":
          return await this.onAttack(eventOptions);
        case "on-turn-start":
          return await this.onTurnStart();
        case "theurgy-ready":
          return await this.theurgyReady();
        case "take-damage":
          return await this.takeDamage(eventOptions);
        case "post-attack":
          return await this.postAttack(eventOptions);
        case "enemies-remaining":
          return await this.enemiesRemaining(eventOptions);
        case "battle-won":
          return await this.battleWon(eventOptions);
        case "status-added":
          return await this.statusAdded(eventOptions);
        default:
          trigger satisfies never;
          return false;
      }
    } catch (e) {
      PersonaError.softFail(e as Error, trigger, eventOptions);
      return false;
    }
  }

  private get voiceLines() {
    if (!this.actor.isNPCAlly()) {return [];}
    const lines= this.actor.system.combat?.navigatorVoice ?? [];
    return lines;
  }

  private async playVoice(trigger: keyof typeof GENERAL_COMBATANT_VOICE_TRIGGERS, options : VoiceLineOptions =  {}) : Promise<boolean> {
    try {
      if (this.nowPlaying) {return false;}
      if (options.percent && options.percent > 0) {
        const change = Math.random() < options.percent;
        if (!change) {return false;}
      }
      if (!PersonaSettings.get("navigatorVoiceLines")) {
        return false;
      }
      let lines = this.voiceLines
        .filter ( ln => ln.trigger == trigger);
      if (options.severity != undefined) {
        const {severity} = options;
        let min: number,max: number;
        if (typeof severity == "number") {
          min = severity; max = severity;
        } else {
          min = severity.min; max = severity.max;
        }
        lines = lines
          .filter( x=> x.level >= min &&
            x.level <= max
          );
      }
      if (options.statusId != undefined) {
        lines = lines.filter( x=> x.statusCondition == options.statusId);
      }
      if (lines.length == 0) {return false;}
      const line = randomSelect(lines);
      this.nowPlaying = true;
      await this._playVoice(line.fileName, options.selfOnly);
      this.nowPlaying = false;
      return true;
    } catch (e) {
      Debug(e);
      PersonaError.softFail("Error in Voicelines", e);
      this.nowPlaying = false;
      return false;
    }
  }

  async _playVoice(fileName: string, selfOnly: boolean = false) : Promise<void> { 
    try {
      this.nowPlaying = true;
      await ActorVoiceLines.playVoice(fileName, selfOnly);
    } catch (e) {
      PersonaError.softFail(`Erorr with sound playback : ${fileName}`, e as Error);
    }
    this.nowPlaying = false;
  }

  static async playVoice(fileName: string, selfOnly: boolean = false) : Promise<void> {
    try {
      await new Sequence().sound()
        .file(fileName)
        .play({local: selfOnly} );
    } catch (e) {
      PersonaError.softFail(`Erorr with sound playback : ${fileName}`, e as Error);
    }
  }

  private async onAttack( eventOptions : VoiceEventOptions = {}) : Promise<boolean> {
    const targets = eventOptions.targets ?? [];
    if (!targets.some( x=> x.isShadow() && x.isAlive())) {
      return false;
    }
    const power = eventOptions.usedPower;
    if (!power) {return false;}
    if (!this.actor.isValidCombatant()) {return false;}
    if (power == PersonaDB.getBasicPower("All-out Attack")) {
      return this.playVoice("on-attack", {severity: 1});
    }
    if (power?.hasTag("theurgy", this.actor)) {
      return this.playVoice("on-attack", {severity: 2});
    }
    return this.playVoice("on-attack", {severity: 0});
  }

  private async battleWon(_eventOptions : VoiceEventOptions = {}) : Promise<boolean> {
    return this.playVoice("battle-won", {percent: 0.5});
  }

  private async onTurnStart() : Promise<boolean> {
    if (!this.actor.isAlive()) {return false;}
    if (!PersonaSettings.debugMode() && this.actor.hasPlayerOwner && game.user.isGM) {return false;}
    let severity = 0;
    if (this.actor.hp < this.actor.mhp * 0.25) {
      severity = 1;
    }
    if (severity == 0 && this.actor.theurgyCharged()) {
      const theurgy = await this.theurgyReady();
      if (theurgy) {return theurgy;}
    }
    const statuses = Array.from(this.actor.statuses);
    for (const status of statuses) {
      const voice = await this.statusAdded( {
        statusAdded: status ,
        selfOnly: true
      });
      if (voice) {return true;}
    }
    return await this.playVoice( "on-turn-start", {
      severity : {min: severity, max: severity},
      selfOnly: true,
    });
  }

  private async takeDamage(options : VoiceEventOptions = {})  : Promise<boolean> {
    if ((options?.hpChange ?? 0) > 0) {return false;}
    let severity = 0;
    switch (true) {
      case this.actor.hp <= 0: {
        severity = 2;
        break;
      }
      case this.actor.hp < this.actor.mhp * 0.25: {
        severity = 1;
        break;
      }
      default:
        severity = 0;
    }
    return await this.playVoice( "take-damage", {severity : {min: severity, max: severity}});
  }

  private async postAttack(eventOptions : VoiceEventOptions = {}) : Promise<boolean> {
    await sleep(1000); //let other sounds stop
    const targets = eventOptions.targets ?? [];
    if (!targets.some(x=> x.isShadow())) {return false;}
    if (targets.some(x => !x.isAlive())) {
      const voice = await this.playVoice ("post-attack",
        {
          severity: 0, //when enemy killed
        });
      const voice2 = await this.enemiesRemaining(eventOptions);
      return voice || voice2;
    }
    return this.playVoice ( "post-attack", {
      severity: 1, //when enemy survived
    });

  }

  private async statusAdded( options: VoiceEventOptions) : Promise<boolean> {
    if (!options.statusAdded) {return false;}
    return await this.playVoice( "status-added", {statusId: options.statusAdded, selfOnly: options.selfOnly});
  }

  private async theurgyReady() : Promise<boolean> {
    return await this.playVoice("theurgy-ready");
  }

  private async enemiesRemaining(_eventOptions : VoiceEventOptions = {}, percent : number = 1) : Promise<boolean> {
    const combat = PersonaCombat.combat;
    if (!combat || combat.isSocial) {return false;}
    const enemies = combat.combatants.contents
    .filter( c=> c.actor && c.actor.isShadow() && c.actor.isAlive());
    if (enemies.length == 0) {return false;}
    return this.playVoice("enemies-remaining", {severity: enemies.length, percent});
  }

}


type VoiceLineOptions = {
  severity ?: number | {min : number; max: number};
  selfOnly ?: boolean;
  percent ?: number;
  statusId ?: StatusEffectId,
}

type VoiceEventOptions = {
  usedPower?: Usable;
  targets ?: ValidAttackers[],
  hpChange ?: number,
  statusAdded?: StatusEffectId,
  selfOnly ?: boolean,
}
