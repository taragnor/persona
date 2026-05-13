import {LocalEffect, OtherEffect} from "../../config/consequence-types.js";
import {PersonaActor} from "../actor/persona-actor.js";
import { ConsequenceApplier } from "../combat/consequence-applier.js";
import {StepsClock} from "../exploration/steps-clock.js";
import {DowntimePanel} from "../panels/downtime-panel.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSocial} from "../social/persona-social.js";
import {SocialCardExecutor} from "../social/social-card-executor.js";

export class Tests {

  /** purely as a loading mechanism*/
  static init() {}

  static get kim() : PC {
    const kim= game.actors.getName("Kimberly Newton") as PersonaActor;
    if (!kim || !kim.isRealPC()) {
      throw new PersonaError("Can't find Kim Actor");
    }
    return kim;
  }

  static async panelTest_downtime() {
    await PersonaSocial.panel.setActor(this.kim);
    await PersonaSocial.panel.activate();
  }

  static async stepsAdvance(num: number) {
    while (num-- > 0) {
      await StepsClock.instance.inc();
    }
  }

  private static get dummyShell() {
    return {
      source: undefined,
      owner: undefined,
      realSource: undefined,
      applyTo: "user",
    } as const;
  }

  static async testSocialActionChange() {
    const kim = this.kim;
		PersonaSocial["_cardExecutor"] = new SocialCardExecutor(kim, kim);
		await PersonaSocial.currentSocialCardExecutor!["_preExec"]();
    const eff : Sourced<LocalEffect> = {
      type: "social-card-action",
      ...this.dummyShell,
      __localEffect: true,
      cardAction: "alter-minor",
      amount: 1,
    } satisfies Sourced<LocalEffect>;
    const orig = kim.social.minorActions;
    await ConsequenceApplier.applyLocalEffect(eff, kim);
    if (kim.social.minorActions != orig + 1) {
      console.warn("add Test failed");
      return false;
    }
    eff.amount = -1;
    await ConsequenceApplier.applyLocalEffect(eff, kim);
    if (kim.social.minorActions != orig) {
      console.warn("subtract Test failed");
      return false;
    }
    return true;
  }

  static async testRecovery() {
    const kim = this.kim;
    const eff : Sourced<OtherEffect> = {
      type: "combat-effect",
      combatEffect: "apply-recovery",
      ...this.dummyShell,
    } satisfies Sourced<OtherEffect>;
    const mutableState =  {
      mpCost: 0,
      theurgy: 0,
    };
    const origHP = kim.hp;
    await kim.modifyHP(-1);
    const oldHP = kim.hp;

    await ConsequenceApplier._applyOtherEffect(kim, undefined, eff, mutableState);
    const newHP = kim.hp;
    await kim.setHP(origHP);
    if (oldHP == newHP) {
      console.warn("recovery test failed");
      return false;
    }
    return true;
  }
}



//@ts-expect-error adding to global
window.tests = Tests;
