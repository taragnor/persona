import {LocalEffect, OtherEffect, StatusEffect} from "../../config/consequence-types.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {BonusCalculation, ModifierV2Target} from "../bonus-calc.js";
import { ConsequenceApplier } from "../combat/consequence-applier.js";
import {ResolvedActorChange} from "../combat/finalized-combat-result.js";
import {StepsClock} from "../exploration/steps-clock.js";
import {TreasureSystem} from "../exploration/treasure-system.js";
import {StatusDuration} from "../persona-ae.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {PersonaSocial} from "../social/persona-social.js";
import {SocialCardExecutor} from "../social/social-card-executor.js";
import {sleep} from "../utility/async-wait.js";
import {MultiTierCache, TimedCache} from "../utility/cache.js";
import {Calculateable} from "../utility/calculation-v2.js";

export class Tests {

  /** purely as a loading mechanism*/
  static init() {}

  static getPC(actorName: string) : PC {
    const actor= game.actors.getName(actorName) as PersonaActor;
    if (!actor || !actor.isRealPC()) {
      throw new PersonaError(`Can't find ${actorName} Actor`);
    }
    return actor;
  }

  static get anya(): PC {
    return this.getPC("Anya Forsythe");
  }

  static get kim() : PC {
    return this.getPC("Kimberly Newton");
  }

  static multiTierCacheTest () {
    const cache = new MultiTierCache(
      (name: {x:number}, val: number, n2: number) => new TimedCache( () => String(name.x + val + n2)  )
    );
    const obj = {x:3};
    if (cache.get(obj, 8, 7) != "18") {
      console.warn("MultiTier Test failed");
      return false;
    }
    if (cache.get({x:2}, 6, 12) != "20") {
      console.warn("MultiTier Test 2 failed");
      return false;
    }
    obj.x = 1;
    if (cache.get(obj, 8, 7) != "18") {
      console.warn("MultiTier Test failed (Timed cache not being used)");
      return false;
    }
    cache.clear();
    if (cache.get(obj, 8, 7) != "16") {
      console.warn("MultiTier Test failed (Cache not cleared)");
      return false;
    }
    return true;
  }

  static async theurgyTest(amt = 10) {
    const kim = this.kim;
    const eff : Sourced<OtherEffect> = {
      type: "combat-effect",
      combatEffect: "alter-theurgy",
      subtype: "direct",
      amount: amt,
      ...this.dummyShell,
    } satisfies Sourced<OtherEffect>;
    const mutableState =  {
      mpCost: 0,
      theurgy: 0,
    };
    await ConsequenceApplier._applyOtherEffect(kim, undefined, eff, undefined, mutableState);
    console.log(mutableState.theurgy);
    return mutableState.theurgy;
    //note doesn't actualy add this to Therugy just checks the math on the modifier
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

  static async statusTest() {
    const kim = this.kim;
    const std: StatusDuration = {
      dtype: "UEoNT",
      anchorHolder: kim.accessor,
    } satisfies StatusDuration;
    const st : StatusEffect = {
      id: "dizzy",
      duration: std,
    } satisfies StatusEffect;
    await kim.addStatus(st);
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

    await ConsequenceApplier._applyOtherEffect(kim, undefined, eff, undefined, mutableState);
    const newHP = kim.hp;
    await kim.setHP(origHP);
    if (oldHP == newHP) {
      console.warn("recovery test failed");
      return false;
    }
    return true;
  }

  static async treasureTest(searcher: N<PCLike>= this.kim, roomType: "treasure-poor" | "treasure-rich" | "treasure-ultra" | "standard" = "standard") {
    const scene = game.scenes.current as PersonaScene;
    let mod = 0, min = 0;
    switch (roomType) {
      case "standard":
        break;
      case "treasure-poor":
        mod -= 50;
        break;
      case "treasure-rich":
        mod +=10;
        min +=25;
        break;
      case "treasure-ultra":
        mod += 25;
        min += 50;
        break;
      default:
        throw new PersonaError("Invalid roomType");
    }
    await TreasureSystem.test(searcher, scene.treasureLevel, mod, min);
  }

  static async testAnchoredStatus () : TestResult {
    const anya = this.anya;
    const kim = this.kim;
    const statusEffect =  {
      "duration": {
        "dtype" :"3-rounds",
        "anchorHolder": anya.accessor,
        "amount": 3,
      },
      "id" :"jailed",
    } satisfies StatusEffect;
    const change = {
      "actor": kim.accessor,
      "addStatus" : [statusEffect],
      "removeStatus": [],
      "localEffects" : [],
      "damage": [],
      "otherEffects" : [],
    } satisfies ResolvedActorChange;
    await ConsequenceApplier.applyActorChange(change, undefined);
    if (!kim.hasStatus("jailed")) {
      console.warn("Anchored Status test failed to apply");
      return false;
    }
    for (let x=0 ; x < 10; x++) {
      await kim.onStartCombatTurn();
    }
    if (!kim.hasStatus("jailed")) {
      console.warn("Anchored Status test failed: treated as nonachored");
      return false;
    }
    for (let x = 0; x < 10; x++) {
      await anya.onStartCombatTurn();
    }
    await sleep(500);
    if (kim.hasStatus("jailed")) {
      console.warn("Anchored Status test failed: not removed");
      return false;
    }
    return true;
  }

  static bonusCalcTest() : TestResult {
    const calc = new BonusCalculation(["attack-roll"]);
    calc
      .set(0, 5, "Initial")
      .add(0, 10, "Add 10")
      .mult(0, 2, "Times 2")
      .sub (1, 10, "minus 10")
      .div (1, 2, "div by 2")
      .add(0, 2, "Add 2");
    let fail = this.testExpected(calc, 12);
    calc.set(2, 5, "override test");
    fail ??= this.testExpected(calc, 5);
    const calcable = {
      eval(_situation: Situation, _options?: object) {
        return {
          total: 3,
          steps: ["eval 3"],
        }
         ;
      }
    } satisfies Calculateable;
    const calc2= new BonusCalculation(["attack-roll"])
      .add(0, 1, "initial")
      .setTerm(0, 2, "x2", "multiply", {"takeBest":2})
      .mult(0, 4, "x4")
      .mult(0, 5, "x5")
      .mult(0, 3, "x3");
    fail ??= this.testExpected(calc2, 20);
    calc2.mult(1, calcable, "calcable Test");
    fail ??= this.testExpected(calc2, 60);
    return Promise.resolve( !fail);
  }

  static kimBonusTest(key: ModifierV2Target) : number {
    const bonuses = this.kim.persona().getBonusesV2(key);
    const evalBonus= bonuses.eval({
      attacker: this.kim.accessor,
      user: this.kim.accessor,
      target: this.kim.accessor,
    });
    console.log(evalBonus.steps);
    return evalBonus.total;
  }

  private static testExpected(calc: BonusCalculation, expected: number) : N<string> {
    const {total, steps} = calc.eval();
    console.log(steps);
    if (total != expected) {
      const msg = `Test fail, expected ${expected}, but got ${total}`;
      console.log(msg);
      return msg;
    }
    return null;
  }

}

//@ts-expect-error adding to global
window.tests = Tests;

type TestResult = Promise<boolean>;
