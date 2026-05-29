import {OtherEffect} from "../../config/consequence-types.js";
import {PersonaAnimation} from "../combat/persona-animations.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSounds} from "../persona-sounds.js";

export class AnimationQueue {

  animationManager: typeof PersonaAnimation;

  queue: Sourced<OtherEffect & {type: "sfx" ; target: TokenDocument<ValidAttackers> | "global" }>[] = [];

  constructor (anim: typeof this.animationManager) {
    this.animationManager = anim;
  }

  private clearQueue() {
    this.queue = [];
  }

  private filterQueue() {
    this.queue.sort ( (a, b) => b.priority - a.priority);
    const overrides= this.queue
      .filter (x => x.actionType == "override");
    for (const override of overrides) {
      this.applyOverride(override.sfxType, override.priority);
    }
  }

  private applyOverride(subtype: typeof this.queue[number]["sfxType"] ,priority: number) {
    this.queue = this.queue.filter( x=> x.sfxType != subtype || x.priority >= priority);
  }

  addSound(otherEffect: Sourced<OtherEffect> & {type: "sfx", sfxType: "play-sound"}) : void {
    const queueObj = {
      ...otherEffect,
      target: "global",
    } as const;
    this.queue.push(queueObj);
    this.filterQueue();
  }

  addAnimation(actor: ValidAttackers, otherEffect: Sourced<OtherEffect> & {type: "sfx", sfxType: "play-animation"}) : void {
    const token = this.getToken(actor);
    if (!token) {
      PersonaError.softFail(`Couldnt' find ${actor.name}'s token for animation`);
      return;
    }
    const queueObj = {
      ...otherEffect,
      target: token,
    } as const;
    this.queue.push(queueObj);
    this.filterQueue();
  }

  addFloatingText(actor: ValidAttackers, otherEffect: Sourced<OtherEffect> & {type: "sfx", sfxType: "floating-text"}) : void {
    const token = this.getToken(actor);
    if (!token) {
      PersonaError.softFail(`Couldnt' find ${actor.name}'s token for animation`);
      return;
    }
    const queueObj = {
      ...otherEffect,
      target: token,
    } as const;
    this.queue.push(queueObj);
    this.filterQueue();
  }

  getToken(actor: ValidAttackers)  : U<TokenDocument<ValidAttackers>> {
    const combat= PersonaCombat.combat;
    if (combat) {
      const comb= combat.getCombatantByActor(actor);
      if (comb && comb.token) {return comb.token;}
    }
    const sceneTok = game.scenes.current.tokens.find(tok=>
      tok.actor?.id == actor.id
      && tok.actorLink);
    if (sceneTok) {return sceneTok as TokenDocument<ValidAttackers>;}
    const activeTok = game.scenes.active.tokens.find(tok=>
      tok.actor?.id == actor.id
      && tok.actorLink);
    if (activeTok) {return activeTok as TokenDocument<ValidAttackers>;}
  }


  async play() : Promise<void> {
    const queue = this.queue;
    this.clearQueue();
    for (const anim of queue) {
      try {
        switch (anim.sfxType) {
          case "play-sound":
            await this.playSound(anim);
            break;
          case "play-animation":
            break;
          case "floating-text":
            break;
            //TODO finishthis
        }
      } catch (e) {
        PersonaError.softFail(e as Error, queue);
      }
    }
  }

  //TODO: convert to Sequencer
  async playSound(snd: typeof this.queue[number] & {sfxType: "play-sound"}) : Promise<void> {
    const promise  = PersonaSounds.playFile(snd.fileName, snd.volume ?? 1.0);
    if (snd.waitUntilFinished) {
      await promise;
    }
  }
}

