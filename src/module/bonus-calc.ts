import {ConditionalEffectC} from "./conditionalEffects/conditional-effect-class.js";
import {ConsequenceAmountResolver} from "./conditionalEffects/consequence-amount.js";
import {PersonaError} from "./persona-error.js";
import {Calculateable, CalculationV2, EvaluatedCalculation} from "./utility/calculation-v2.js";
import {HTMLTools} from "./utility/HTMLTools.js";

export class BonusCalculation extends CalculationV2 {

  private modNames : readonly ModifierV2Target[] = [];
  private _typeData: ModV2Type;

  constructor (bonusTypes: ModifierV2Target | ModifierV2Target[]) {
    //TODO: may have to get initial for each type here
    const modNames = Array.isArray(bonusTypes) ? bonusTypes : [bonusTypes];
    const typeData = modNames.map (mod => MODV2_DETAILS[mod]);
    BonusCalculation.safetyCheck(typeData);
    super(typeData[0].initial ?? 0);
    this._typeData = typeData[0];
    this.modNames = Array.isArray(bonusTypes) ? bonusTypes : [bonusTypes];
  }

  get category(): ModV2Type["type"] {
    return this._typeData.type;
  }

  addCE(...effects: readonly ConditionalEffectC[]) : this {
    const bonusEffects = effects
      .filter ( ce=> this.modNames
        .some (mod => ce.grantsBonusType(mod))
      );
    for (const ce of bonusEffects) {
      const filteredCons = ce.consequences
        .filter( cons => cons.type == "modifier-v2")
        .filter( cons => this.modNames.includes(cons.modTarget));
      for (const cons of filteredCons) {
        const calculateable = this._toCalculateable(ce, cons);
        this.setTerm(cons.priority ?? 10, calculateable,
          ce.name,  cons.operation);
      }
    }
    return this;
  }

  private situationSafetyCheck(situation : U<Situation>) {
    switch (this._typeData.type) {
      case "offensive":
        if (!situation || !("attacker" in situation)) {
          PersonaError.softFail("No attacker in situation for offensive bonus", situation, this._typeData);
        }
        break;
      case "defensive":
        if (!situation || !("target" in situation)) {
          PersonaError.softFail("No target in situation for defensive bonus", situation, this._typeData);
        }
        break;
      case "user":
        if (!situation || !("user" in situation)) {
          PersonaError.softFail("No user in situation for user bonus", situation, this._typeData);
        }
        break;
      case "item":
        if (!situation || !("item" in situation)) {
          PersonaError.softFail("No item in situation for", situation, this._typeData);
        }
        break;
      default:
        this._typeData.type satisfies never;
        break;
    }
  }


  override eval(situation ?: Situation, options= {hideTotals: false}) : EvaluatedCalculation {
    try {
    this.situationSafetyCheck(situation);
    const data = super.eval(situation, options);
    data.total = this.applyFinalStep(data.total);
    return data;
    } catch (e) {
      PersonaError.softFail(e as Error, this, situation, options);
      return {
        total: this._typeData.initial,
        steps: ["ERROR"],
      };
    }
  }

  private static safetyCheck(data: ModV2Type[]) {
    if (data.length == 0) {
      throw new PersonaError("Null length bonus-calc");
    }
    const comp = data[0];
    for (const item of data) {
      for (const [k,v] of  Object.entries(item)) {
        if (v != comp[k as keyof typeof comp]) {
          Debug(item, comp);
          throw new PersonaError(`Type ${k} doesn't match in BonusCalculation`);
        }
      }
    }
  }

  private _toCalculateable(ce: ConditionalEffectC, cons: ConditionalEffectC["consequences"][number] & {type : "modifier-v2"}) : Calculateable {
    const calculateable: Calculateable = {
      eval: (sit :Situation) => {
        if (sit == undefined) {return null;}
        if (!ce.testPreconditions(sit))
        {return null;}
        const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
        const res = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, sit);
        if (res == undefined) {return null;}
        return {
          total: this.applyFinalStep(res),
          steps: [ce.name],
        } satisfies EvaluatedCalculation;
      }
    };
    return calculateable;
  }

  applyFinalStep(amt: number) : number {
    let ret = amt;
    if (this._typeData.clamp) {
      ret = Math.clamp(ret, this._typeData.clamp.min, this._typeData.clamp.max);
    }
    switch (this._typeData.rounding) {
      case "none":
        break;
      case "floor":
        ret = Math.floor(ret);
        break;
      case "ceiling":
        ret = Math.ceil(ret);
        break;
      case "round":
        ret = Math.round(ret);
        break;
      default:
        this._typeData.rounding satisfies never;
        PersonaError.softFail("Unknown rounding type");
        Debug(this);
    }
    return ret;
  }

}

export const MODV2_DETAILS = {
  "attack-roll" : {
    type: "offensive",
    rounding: "floor",
    initial: 0,
  },
  "save" : {
    type: "user",
    rounding: "floor",
    initial: 0,
  },
  "treasure-weight": {
    type: "item",
    rounding: "none",
    initial: 1,
    clamp: {min: 0, max: 100},
  }
} as const satisfies Record<string, ModV2Type>;

const MODIFIER_V2_TARGET_LIST = Object.keys(MODV2_DETAILS) as (keyof typeof MODV2_DETAILS)[];

export const MODIFIER_V2_TARGET = HTMLTools.createLocalizationObject(MODIFIER_V2_TARGET_LIST, "persona.modifier-v2");

export type ModifierV2Target = keyof typeof MODIFIER_V2_TARGET;


type ModV2Type = {
  type: "offensive" | "defensive" | "user" | "item",
  rounding: "floor" | "ceiling" | "round" | "none",
  clamp ?: {min: number, max:number},
  initial: number,
}


//TODO: do elaborate setup for each bopnus type with a starting value and then rounding rules
