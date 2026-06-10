import {ConditionalEffectC} from "./conditionalEffects/conditional-effect-class.js";
import {ConsequenceAmountResolver} from "./conditionalEffects/consequence-amount.js";
import {Calculateable, CalculationV2, EvaluatedCalculation} from "./utility/calculation-v2.js";
import {HTMLTools} from "./utility/HTMLTools.js";

export class BonusCalculation extends CalculationV2 {

  private modNames : readonly ModifierV2Target[] = [];

  constructor (bonusTypes: ModifierV2Target | ModifierV2Target[]) {
    //TODO: may have to get initial for each type here
    super(0);
    this.modNames = Array.isArray(bonusTypes) ? bonusTypes : [bonusTypes];
  }

  addCE(...effects: ConditionalEffectC[]) : this {
    const bonusEffects = effects
      .filter ( ce=> this.modNames
        .some (mod => ce.grantsBonusType(mod))
      );
    for (const ce of bonusEffects) {
      const filteredCons = ce.consequences
        .filter( cons => cons.type == "modifier-v2")
        .filter( cons =>this.modNames.includes(cons.modTarget));
      for (const cons of filteredCons) {
        const calculateable = this._toCalculateable(ce, cons);
        this.setTerm(cons.priority ?? 10, calculateable,
          ce.name,  cons.operation);
      }
    }
    return this;
  }

  private _toCalculateable(ce: ConditionalEffectC, cons: ConditionalEffectC["consequences"][number] & {type : "modifier-v2"}) : Calculateable {
    const calculateable: Calculateable = {
      eval (sit :Situation) {
        if (sit == undefined) {return null;}
        if (!ce.testPreconditions(sit))
        {return null;}
        const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
        const res = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, sit);
        if (res == undefined) {return null;}
        return {
          total: res,
          steps: [ce.name],
        } satisfies EvaluatedCalculation;
      }
    };
    return calculateable;
  }

}

export const MODV2_DETAILS = {
  "attack-roll" : {
    type: "offensive",
    rounding: "floor",
  },
  "save" : {
    type: "user",
    rounding: "floor",
  },
} as const satisfies Record<string, ModV2Type>;

const MODIFIER_V2_TARGET_LIST = Object.keys(MODV2_DETAILS) as (keyof typeof MODV2_DETAILS)[];

export const MODIFIER_V2_TARGET = HTMLTools.createLocalizationObject(MODIFIER_V2_TARGET_LIST, "persona.modifier-v2");

export type ModifierV2Target = keyof typeof MODIFIER_V2_TARGET;


type ModV2Type = {
  type: "offensive" | "defensive" | "user",
  rounding: "floor" | "ceiling" | "round" | "none",
  clamp ?: {min: number, max:number},
}


//TODO: do elaborate setup for each bopnus type with a starting value and then rounding rules
