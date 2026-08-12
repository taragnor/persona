import {CancelCheck} from "./config/triggers.js";
import {ConditionalEffectC} from "./module/conditionalEffects/conditional-effect-class.js";
import {ConditionalEffectPrinter} from "./module/conditionalEffects/conditional-effect-printer.js";
import {TriggeredEffect} from "./module/triggered-effect.js";

export class CancelTrigger {

  static cancelCheck<T extends CancelCheck>(situation: CheckParam<T>, actor: U<ValidAttackers>) :boolean {
    const situationCopy = {
      ...(situation satisfies CheckParam<T>),
      triggeringUser: game.user.id,
    } satisfies TriggeredSituation.CancelSituation;
    const triggers = TriggeredEffect.getTriggerList(situationCopy.trigger, actor, situationCopy);
    return triggers
      .some( trig => trig.canCancel());
  }

  private static _cancelCheckCEs<const T extends CancelCheck>(situation: CheckParam<T>, actor : U<ValidAttackers>) : ConditionalEffectC[] {
    const situationCopy = {
      ...(situation satisfies CheckParam<T>),
      triggeringUser: game.user.id,
    } satisfies TriggeredSituation.TriggerSituation;
    const triggers = TriggeredEffect.getTriggerList(situationCopy.trigger, actor, situationCopy);
    return triggers
      .filter( trig => trig.canCancel());
  }

  static getReasons<const T extends CancelCheck>(situation: CheckParam<T>, actor: U<ValidAttackers>) : string[] {
    const triggers= this._cancelCheckCEs(situation, actor);
    const failedCond = triggers
      .map (trig => {
        return ConditionalEffectPrinter.printConditions(trig.conditions);
      });
    return failedCond;
  }

}

type CheckParam<T extends CancelCheck=CancelCheck> = PartialKeys<TriggeredSituation.CancelSituation, "triggeringUser"> & {trigger: T};

