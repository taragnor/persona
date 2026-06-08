import {ConditionalEffectC} from "./conditionalEffects/conditional-effect-class.js";
import {ConsequenceAmountResolver} from "./conditionalEffects/consequence-amount.js";
import {Calculateable, CalculationV2, EvaluatedCalculation} from "./utility/calculation-v2.js";
import {HTMLTools} from "./utility/HTMLTools.js";

export class BonusCalculation extends CalculationV2 {

  modNames : ModifierV2Target[] = [];

  constructor (bonusTypes: ModifierV2Target | ModifierV2Target[]) {
    //TODO: may have to get initial for each type here
    super(0);
    this.modNames = Array.isArray(bonusTypes) ? bonusTypes : [bonusTypes];
  }

  addCE(...effects: ConditionalEffectC[]) : this {
    //TODO: finish later
    const bonusEffects= effects
      .filter ( ce=> ce.consequences
        .some( cons=>
          cons.type == "modifier-v2"
          && this.modNames.includes(cons.modTarget)
        )
      );
    for (const ce of bonusEffects) { 
      const filteredCons = ce.consequences
        .filter( cons=> cons.type == "modifier-v2")
        .filter(cons =>this.modNames.includes(cons.modTarget));
      for (const cons of filteredCons) {
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
        this.setTerm(cons.priority ?? 10, calculateable,
          ce.name,  cons.operation);
      }
    }
    return this;
  }

}

const MODIFIER_V2_TARGET_LIST = [
  "attack-roll",
] as const;

export const MODIFIER_V2_TARGET = HTMLTools.createLocalizationObject(MODIFIER_V2_TARGET_LIST, "persona.modifier-v2");

export type ModifierV2Target = keyof typeof MODIFIER_V2_TARGET;


//TODO: do elaborate setup for each bopnus type with a starting value and then rounding rules
