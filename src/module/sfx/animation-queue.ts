import {OtherEffect} from "../../config/consequence-types.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaAnimation} from "../combat/persona-animations.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSounds} from "../persona-sounds.js";
import {sleep} from "../utility/async-wait.js";

export class AnimationQueue {

  animationManager: typeof PersonaAnimation;

  queue: Sourced<OtherEffect & {type: "sfx" ; target: TokenDocument<ValidAttackers> | "global", attacker: N<TokenDocument<ValidAttackers>> }>[] = [];

  constructor (anim: typeof this.animationManager) {
    this.animationManager = anim;
  }

  private clearQueue() {
    this.queue = [];
  }

  private filterQueue() {
    this.queue.sort ( (a, b) => a.order - b.order);
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
      attacker: null,
      order: otherEffect.order ?? 0,
    } as const;
    this.queue.push(queueObj);
    this.filterQueue();
  }

  quickScrollingText(target: ValidAttackers, order: number, text: string, color: string = "white", delay = 0) {
    this.addFloatingText(target, {
      type: "sfx",
      priority: 0,
      sfxType: "floating-text",
      actionType: "standard",
      order: order,
      text: text,
      applyTo: "target",
      color: color,
      delay: delay,
      source: undefined,
      owner: undefined,
      realSource: undefined
    });
  }

  addAnimation(actor: ValidAttackers, attacker: N<ValidAttackers>, otherEffect: Sourced<OtherEffect> & {type: "sfx", sfxType: "play-animation"}) : void {
    const token = this.getToken(actor);
    if (!token) {
      PersonaError.softFail(`Couldnt' find ${actor.name}'s token for animation ${otherEffect.sfxType}`);
      return;
    }
    const attackerTok = attacker ? this.getToken(attacker) : null;
    const queueObj = {
      ...otherEffect,
      target: token,
      order: otherEffect.order ?? 0,
      attacker: attackerTok? attackerTok : null,
    } as const;
    this.queue.push(queueObj);
    this.filterQueue();
  }

  addFloatingText(actor: ValidAttackers, otherEffect: Sourced<OtherEffect> & {type: "sfx"; sfxType: "floating-text";}) : void {
    const token = this.getToken(actor);
    if (!token) {
      PersonaError.softFail(`Couldnt' find ${actor.name}'s token for animation`);
      return;
    }
    const queueObj = {
      ...otherEffect,
      target: token,
      order: otherEffect.order ?? 0,
      attacker: null,
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

  async play(timeOut : number) : Promise<void> {
    try {
      if (!timeOut) { await this._play();}
      const timeOutPromise= sleep(timeOut);
      await Promise.race([ this._play(), timeOutPromise]);
    } catch (e) {
      PersonaError.softFail(e as Error);
    }
  }

  private async _play() : Promise<void> {
    let queue = this.queue;
    this.clearQueue();
    if (Sequence == undefined) {
      console.warn("Sequencer not found, can't use specail effects");
      return;
    }
    while (queue.length > 0) {
      const order = queue.at(0)?.order ?? 0;
      const playable = queue.filter( x=> (x.order ?? 0) == order);
      queue = queue.filter(x=> (x.order ?? 0) != order);
      let delay = 0;
      const seq =  playable
        .reduce ( (seq, anim) => this.convertToSequence(anim, seq, delay += anim.sfxType == "floating-text" ? 250 : 50)
          , new Sequence());
      try {
        await seq.play( );
        // await seq.play( {preload: true} );
      } catch (e) {
        PersonaError.softFail(e as Error, playable);
      }
    }
  }

  private convertToSequence(anim: typeof this.queue[number], seq: Sequence, innateDelay: number): Sequence {
    try {
    switch(anim.sfxType) {
      case "play-sound":
        return this.buildBasicSequence(anim, seq, innateDelay);
      case "play-animation":
        return this.handleTargetted(anim, seq, innateDelay);
      case "floating-text":
        return this.handleFloating(anim, seq, innateDelay);
      default:
        anim satisfies never;
        return seq; }
    } catch (e) {
      PersonaError.softFail(e as Error, anim);
      return seq;
    }
  }

  private handleFloating(anim: typeof this.queue[number], orig_sequence: Sequence, innateDelay: number): Sequence {
    const seq = this.buildBasicSequence(anim, orig_sequence, innateDelay);
    return seq;
  }

  private buildBasicSequence(anim: typeof this.queue[number], orig_sequence: Sequence, innateDelay: number) {
    switch(anim.sfxType) {
      case "play-sound": {
        let seq = orig_sequence.sound();
        seq = this.setGenericSequenceParams(anim, seq, innateDelay);
        seq = seq
        .file(anim.fileName)
        .volume(anim.volume ?? 1);
        if (anim.fadeIn) {
          seq = seq.fadeInAudio(anim.fadeIn);
        }
        if (anim.fadeOut) {
          seq = seq.fadeOutAudio(anim.fadeOut);
        }
        return seq;
      }
      case "play-animation": {
        if (anim.target == "global"){
          PersonaError.softFail("Global target not allowed in Animations");
          return orig_sequence;
        }
        let seq = orig_sequence.effect()
        .file(anim.fileName);
        seq = this.setGenericSequenceParams(anim, seq, innateDelay);
        if (PersonaSettings.debugMode()) {
          Debug(anim);
          console.log(anim);
        }
        if (anim.fadeIn) {
          seq = seq.fadeIn(anim.fadeIn);
        }
        if (anim.fadeOut) {
          seq = seq.fadeOut(anim.fadeOut);
        }
        if (anim.scale) {
          if (anim.projectile == "none") {
            seq = seq.scaleToObject(anim.scale);
          } else {
            seq = seq.scale(anim.scale);
          }
        }
        if (anim.opacity && anim.opacity != 1) {
          seq = seq.opacity(anim.opacity);
        }
        if (anim.playbackRate) {
          seq = seq.playbackRate(anim.playbackRate);
        }
        if (anim.aboveInterface) {
          seq = seq.aboveInterface();
        }
        return seq;
      }
      case "floating-text": {
        if (anim.target == "global"){
          PersonaError.softFail("Global target not allowed in Floating Text");
          return orig_sequence;
        }
        let seq = AnimationQueue.appendScrollingText(orig_sequence, anim, anim.target);
        seq = this.setGenericSequenceParams(anim, seq, innateDelay);
        return seq;
      }
      default:
        anim satisfies never;
        PersonaError.softFail(`Unknown animation type: ${(anim as GenericObject).sfxType as string}`, anim);
    }
    return orig_sequence;
  }

  private static appendScrollingText<T extends Sequence>(seq: T, anim: AnimationQueue["queue"][number] & {sfxType: "floating-text"} , location: Token | TokenDocument) {
    const style = {
      fill: anim.color ?? "white",
      fontFamily: anim.fontFamily ?? "Almendra",
      fontSize: anim.fontSize ?? 38,
      strokeThickness: anim.strokeThickness ?? 4,
    };
    return seq.scrollingText()
      .atLocation(location)
      .delay(300)
      .text(anim.text, style);
  }

  private handleTargetted(anim: typeof this.queue[number] & {sfxType : "play-animation"}, orig_seq: Sequence, innateDelay: number) : EffectProxy {
    if (anim.target == "global") {
      PersonaError.softFail("Target cannot be global on anim", anim);
      return orig_seq.effect();
    }
    if (anim.projectile  == "none") {
      let seq = this.buildBasicSequence(anim, orig_seq, innateDelay) as EffectProxy;
      if (anim.target.x == undefined || anim.target.y == undefined || Number.isNaN(anim.target.x) || Number.isNaN(anim.target.y)) {
        console.error("X or Y is undefined on anim Target");
        Debug(anim);
      }
      switch (anim.offType) {
        case "none":
          seq = seq.atLocation(anim.target);
          break;
        case "random":
          seq = seq.atLocation(anim.target, {randomOffset: anim.offsetPercent ?? 1});
          break;
        case "missed":
          seq = seq.missed();
          break;
        default:
          anim satisfies never;
          PersonaError.softFail("Bad anim type");
      }
      return seq;
    }
    if (!anim.attacker) {
      PersonaError.softFail("Can't do projectil animation for null attacker", anim);
      return orig_seq.effect();
    }
    switch (anim.projectile) {
      case "single-shot": {
        let seq = this.buildBasicSequence(anim, orig_seq, innateDelay) as EffectProxy;
        seq = seq.atLocation(anim.attacker)
        .stretchTo(anim.target);
        return seq;
      }
      case "burst": {
        let seq : EffectProxy = orig_seq.effect();
        for (let i = 0; i< 4 ; ++i ) {
          seq = this.buildBasicSequence(anim, orig_seq, innateDelay + (i * 100)) as EffectProxy;
          seq = seq.atLocation(anim.attacker)
            .stretchTo(anim.target, {randomOffset: 0.4});
        }
        return seq;
      }
      case "barrage": {
        let seq : EffectProxy = orig_seq.effect();
        for (let i = 0; i< 10 ; ++i ) {
          seq = this.buildBasicSequence(anim, orig_seq, innateDelay + (i * 75)) as EffectProxy;
          seq = seq.atLocation(anim.attacker)
            .stretchTo(anim.target, {randomOffset: 0.4});
        }
        return seq;
      }
      default:
        anim.projectile satisfies never;
        PersonaError.softFail(`Projectile of animation is ${anim.projectile as string}`, anim);
        return orig_seq.effect();
    }
  }


  private setGenericSequenceParams<S extends Sequence>(anim: typeof this.queue[number], seq: S, innateDelay: number) : S {
    if (anim.duration) {
      seq = seq.duration(anim.duration);
    }
    const delay = (anim.delay ?? 0) + innateDelay;
    if (delay != 0) {
      seq = seq.delay(delay);
    }
    if (anim.waitUntilFinished) {
      seq = seq.waitUntilFinished(0);
    }
    return seq;
  }

  //TODO: convert to Sequencer
  async playSound(snd: typeof this.queue[number] & {sfxType: "play-sound"}) : Promise<void> {
    const promise  = PersonaSounds.playFile(snd.fileName, snd.volume ?? 1.0);
    if (snd.waitUntilFinished) {
      await promise;
    }
  }
}

export const ORDER_PHASES = {
  0 : "power-use",
  1 : "attack",
  2 : "hit",
  3 : "aftereffect",
} as const;
