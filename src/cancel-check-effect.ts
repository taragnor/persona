import {CancelCheck, Trigger} from "./config/triggers.js";
import {PersonaActor} from "./module/actor/persona-actor.js";
import {ConditionalEffectC} from "./module/conditionalEffects/conditional-effect-class.js";
import {ConditionalEffectPrinter} from "./module/conditionalEffects/conditional-effect-printer.js";
import {TriggeredEffect} from "./module/triggered-effect.js";

export class CancelTrigger {

  static cancelCheck<T extends CancelCheck>(situation: CheckParam<T>, actor: U<ValidAttackers>) : boolean {
    const situationCopy = {
      ...(situation satisfies CheckParam<T>),
      triggeringUser: game.user.id,
    } satisfies TriggeredSituation.CancelSituation;
    const triggers = this.getTriggerList(situationCopy.trigger, actor, situationCopy);
    return triggers
      .filter ( trig => trig.canCancel())
      .filter ( trig => trig.testPreconditions(situation))
      .length > 0;
  }

  private static _cancelCheckCEs<const T extends CancelCheck>(situation: CheckParam<T>, actor : U<ValidAttackers>) : ConditionalEffectC[] {
    const situationCopy = {
      ...(situation satisfies CheckParam<T>),
      triggeringUser: game.user.id,
    } satisfies TriggeredSituation.TriggerSituation;
    const triggers = this.getTriggerList(situationCopy.trigger, actor, situationCopy);
    return triggers
      .filter ( trig => trig.canCancel())
      .filter ( trig => trig.testPreconditions(situation));
  }

  static getReasons<const T extends CancelCheck>(situation: CheckParam<T>, actor: U<ValidAttackers>) : string[] {
    const triggers = this._cancelCheckCEs(situation, actor);
    const failedCond = triggers
      .map (trig => {
        return ConditionalEffectPrinter.printConditions(trig.conditions) + ` (${trig.findRealSource()?.name})`;
      });
    return failedCond;
  }

  static getTriggerList(trigger : Trigger, actor : U<PersonaActor>, situation: Situation) :  ConditionalEffectC[] {
    return TriggeredEffect.getTriggerList(trigger, actor, situation);
  }

}

type CheckParam<T extends CancelCheck=CancelCheck> = PartialKeys<TriggeredSituation.CancelSituation, "triggeringUser"> & {trigger: T};

