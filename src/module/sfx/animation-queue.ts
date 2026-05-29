import {OtherEffect} from "../../config/consequence-types.js";
import {PersonaAnimation} from "../combat/persona-animations.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSounds} from "../persona-sounds.js";

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
      attacker: null,
    } as const;
    this.queue.push(queueObj);
    this.filterQueue();
  }

  addAnimation(actor: ValidAttackers, attacker: N<ValidAttackers>, otherEffect: Sourced<OtherEffect> & {type: "sfx", sfxType: "play-animation"}) : void {
    const token = this.getToken(actor);
    if (!token) {
      PersonaError.softFail(`Couldnt' find ${actor.name}'s token for animation`);
      return;
    }
    const attackerTok = attacker ? this.getToken(attacker) : null;
    const queueObj = {
      ...otherEffect,
      target: token,
      attacker: attackerTok? attackerTok : null,
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


  async play() : Promise<void> {
    const queue = this.queue;
    this.clearQueue();
    const seq=  queue
    .reduce ( (seq, anim) => this.convertToSequence(anim, seq)
      , new Sequence());
    await seq.play({preload: true});
    //for (const anim of queue) {
    //  try {
    //    const seq

    //    switch (anim.sfxType) {
    //      case "play-sound":
    //        await this.playSound(anim);
    //        break;
    //      case "play-animation":
    //        break;
    //      case "floating-text":
    //        break;
    //        //TODO finishthis
    //    }
    //  } catch (e) {
    //    PersonaError.softFail(e as Error, queue);
    //  }
    //}
  }

  private convertToSequence(anim: typeof this.queue[number], seq: Sequence = new Sequence() ): Sequence {
    try {
    switch(anim.sfxType) {
      case "play-sound":
        return this.buildBasicSequence(anim, seq);
      case "play-animation":
        return this.handleTargetted(anim, seq);
      case "floating-text":
        return this.handleFloating(anim, seq);
      default:
        anim satisfies never;
        return seq; }
    } catch (e) {
      PersonaError.softFail(e as Error, anim);
      return seq;
    }
  }

  private handleFloating(_anim: typeof this.queue[number], _orig_sequence: Sequence): Sequence {
    throw new Error("Not yet implemented");
  }

  private buildBasicSequence(anim: typeof this.queue[number], orig_sequence: Sequence) {
    switch(anim.sfxType) {
      case "play-sound": {
        let seq = orig_sequence.sound();
        seq = this.setGenericSequenceParams(anim, seq);
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
        seq = this.setGenericSequenceParams(anim, seq);
        if (anim.fadeIn) {
          seq = seq.fadeIn(anim.fadeIn);
        }
        if (anim.fadeOut) {
          seq = seq.fadeOut(anim.fadeOut);
        }
        if (anim.opacity) {
          seq = seq.opacity(anim.fadeOut);
        }
        return seq;
      }
      case "floating-text": {
        if (anim.target == "global"){
          PersonaError.softFail("Global target not allowed in Floating Text");
          return orig_sequence;
        }
        let seq = orig_sequence.scrollingText();
        seq = this.setGenericSequenceParams(anim, seq);
        return seq;
      }
      default:
        anim satisfies never;
        PersonaError.softFail(`Unknown animation type: ${(anim as GenericObject).sfxType as string}`, anim);
    }
    return orig_sequence;
  }

  private handleTargetted(anim: typeof this.queue[number] & {sfxType : "play-animation"}, orig_seq: Sequence) : EffectProxy {
    if (anim.target == "global") {
      PersonaError.softFail("Target cannot be global on anim", anim);
      return orig_seq.effect();
    }
    if (anim.projectile  == "none") {
      let seq = this.buildBasicSequence(anim, orig_seq) as EffectProxy;
      switch (anim.offType) {
        case "none":
          seq = seq.atLocation(anim.target);
          break;
        case "random":
          seq = seq.atLocation(anim.target, {randomOffset: anim.offsetPercent ?? 1});
          break;
        case "missed":
          seq = seq.missed();
      }
      return seq;
    }
    if (!anim.attacker) {
      PersonaError.softFail("Can't do projectil animation for null attacker", anim);
      return orig_seq.effect();
    }
    switch (anim.projectile) {
      case "single-shot": {
        let seq = this.buildBasicSequence(anim, orig_seq) as EffectProxy;
        seq = seq.atLocation(anim.attacker)
        .stretchTo(anim.target);
        return seq;
      }
      case "burst": {
        let seq : EffectProxy = orig_seq.effect();
        for (let i = 0; i< 4 ; ++i ) {
          seq = this.buildBasicSequence(anim, orig_seq) as EffectProxy;
          seq = seq.atLocation(anim.attacker)
            .stretchTo(anim.target, {randomOffset: 0.4})
          .waitUntilFinished(-100);
        }
        return seq;
      }
      case "barrage": {
        let seq : EffectProxy = orig_seq.effect();
        for (let i = 0; i< 10 ; ++i ) {
          seq = this.buildBasicSequence(anim, orig_seq) as EffectProxy;
          seq = seq.atLocation(anim.attacker)
            .stretchTo(anim.target, {randomOffset: 0.4})
          .waitUntilFinished(-200);
        }
        return seq;
      }
      default:
        anim.projectile satisfies never;
        PersonaError.softFail(`Projectile of animation is ${anim.projectile as string}`, anim);
        return orig_seq.effect();
    }
  }


  private setGenericSequenceParams<S extends Sequence>(anim: typeof this.queue[number], seq: S) : S {
    if (anim.duration) {
      seq = seq.duration(anim.duration);
    }
    if (anim.delay && anim.delay > 0) {
      seq = seq.delay(anim.delay);
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

