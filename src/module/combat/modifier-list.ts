import { ModifierTarget, NonDeprecatedModifierTarget } from "../../config/item-modifiers.js";
import {PersonaError} from "../persona-error.js";
import {ConsequenceAmountResolver} from "../conditionalEffects/consequence-amount.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {ConditionalEffectC} from "../conditionalEffects/conditional-effect-class.js";
import {PersonaDB} from "../persona-db.js";
import {ConsequenceAmountV2} from "../../config/consequence-types.js";
import {ConditionalEffectManager} from "../conditionalEffects/conditional-effect-manager.js";
import {testPreconditions} from "../conditionalEffects/preconditions.js";

export type ModifierListItem = Sourced<{
  name: string;
  conditions:  SourcedPrecondition[];
  modifier: (number | Sourced<ConsequenceAmountV2>)[];
}>;

type MLListType = "standard"
  | "percentage"
  | "percentage-special" //presented in additive format +.35 instad of +135%;

export class ModifierList {
  private _data: ModifierListItem[];
  private listType: MLListType;

  constructor ( sourcedEffects: ConditionalEffectC[], bonusFn : (eff :ConditionalEffectC) => number ,listType?: MLListType);
  constructor ( list?: ModifierListItem[], listType?: MLListType);
  constructor ( list: ModifierListItem[] | ConditionalEffectC[] = [], listTypeOrFn: MLListType | ((eff: ConditionalEffectC) => number) = "standard", listType ?: MLListType)
  {
    this.listType = typeof listTypeOrFn != "function" ? listTypeOrFn : (listType ? listType : "standard");
    if (list.length == 0 || ("name" in list.at(0)!)) {
      this._data = list as ModifierListItem[];
      return;
    }
    const ModListItems = (list as ConditionalEffectC[]).map( eff=> {
      const realSource = eff.realSource ? PersonaDB.find(eff.realSource) : undefined;
      const source = eff.source ? PersonaDB.find(eff.source) : undefined;
      return {
        name: realSource?.name ?? source?.name ?? "Unknown Source",
        source: eff.source,
        owner: eff.owner,
        realSource : eff.realSource,
        conditions: ConditionalEffectManager.ArrayCorrector(eff.conditions),
        modifier: [typeof listTypeOrFn == "function" ? listTypeOrFn(eff): 0],
      };
    });
    this._data = ModListItems
      .filter (x=> x.modifier[0] != 0);
  }

  add(name: string, modifier: number, sourceItem?: ModifierListItem["source"], owner ?: ModifierListItem["owner"], conditions: SourcedPrecondition[] = []) : ModifierList {
    this._data.push({
      source: sourceItem,
      owner,
      name,
      conditions,
      modifier: [modifier],
      realSource: undefined,
    });
    return this;
  }

  filterZero(): this {
    this._data= this._data
      .map( x=> ({
        ...x,
        modifier: x.modifier.filter( y => y != 0),
      }))
    .filter( x=> x.modifier.length > 0);
    return this;
  }

  list(situtation: Situation, listType : ModifierList["listType"] = this.listType): [ModifierListItem["modifier"], string][] {
    const filtered = this.validModifiers(situtation, listType);
    return filtered.map( x=> [x.modifier, x.name]);
  }

  concat (this: ModifierList, other: ModifierList) : ModifierList {
    const list = this["_data"].concat(other["_data"]);
    return new ModifierList(list, this.listType);
  }

  validModifiers (situation: Situation, type : ModifierList["listType"] = this.listType) : ModifierListItem[]  {
    return this._data.filter( item => {
      try {
        if (item.modifier[0] == 0 && type =="standard" ) {return false;}
        return testPreconditions(item.conditions, situation);
      } catch (e) {
        PersonaError.softFail("Problem with Valid MOdifiers in situation, can't get source",e,item );
        return false;
      }
    });
  }

  static getModifierAmount(consequences: ConditionalEffectC["consequences"], targetMods: NonDeprecatedModifierTarget[] | NonDeprecatedModifierTarget) : (number | Sourced<ConsequenceAmountV2>)[] {
    targetMods = Array.isArray(targetMods) ? targetMods : [targetMods];
    return consequences
      .reduce( (acc,cons)=> {
        if ("modifiedFields" in cons
          && targetMods
          .some( f => cons.modifiedFields[f] == true)
        ) {
          const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
          acc.push(sourced);
          return acc;
        }
        if ("modifiedField" in cons && cons.modifiedField && targetMods.includes(cons.modifiedField)) {
          const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
          acc.push(sourced);
          return acc;
        }
        return acc;
      }, [] as (number |Sourced<ConsequenceAmountV2>)[]);
  }

  addConditionalEffects( effects: ConditionalEffectC[], bonusTypes: NonDeprecatedModifierTarget[]) : this {
    const stuff : ModifierListItem[] = (ConditionalEffectManager.ArrayCorrector(effects) ?? []).map( eff=>{
      return {
        name: eff.displayedName,
        source: eff.source,
        owner: eff.owner,
        conditions: ConditionalEffectManager.ArrayCorrector(eff.conditions),
        modifier: ModifierList.getModifierAmount(eff.consequences, bonusTypes),
        realSource: eff.realSource,
      };
    });
    this._data = this._data.concat(stuff);
    return this;
  }

  static resolveModifier(modifier: ModifierList["_data"][number]["modifier"], situation: Situation)  :number {
    const resolved : number[]= modifier.map( mod=>
      ConsequenceAmountResolver.resolveConsequenceAmount(mod, situation))
        .filter (mod=> mod != undefined);
    return resolved.reduce( (acc, mod) => acc+mod, 0);
  }

  total(user: ValidAttackers, style ?: ModifierList["listType"]) : number;
  total(situation: SituationTypes.BonusQuerySituation | SituationTypes.TriggerSituation , style ?: ModifierList["listType"]) : number;
  total(situationOrActor: Situation | ValidAttackers , style = this.listType) : number {
    const situation :Situation = situationOrActor instanceof PersonaActor  ? {user: situationOrActor.accessor} : situationOrActor;
    const mods = this.validModifiers(situation, style);
    const resolvedMods = mods.map( mod=> ModifierList.resolveModifier(mod.modifier, situation));
    switch (style) {
      case "standard": {
        const base =  resolvedMods.reduce( (acc, num) => acc + num , 0);
        return base;
      }
      case "percentage": {
        const base =  resolvedMods.reduce( (acc, num) => acc * (num ?? 1) , 1);
        return base;
      }
      case "percentage-special": {
        return resolvedMods
        .map( x => {
          const mod = x ?? 1;
          if (mod < 0)  { return 1 + mod; }
          return 1 + mod;
        })
        .reduce( (acc, mod) => acc * (mod ?? 1) , 1);
      }
      default:
        style satisfies never;
        return 0;
    }
  }

  /** returns an array of values to use in printing the rol */
  printable(situation:Situation, listType = this.listType) : ResolvedModifierList {
    const signedFormatter = new Intl.NumberFormat("en-US", {signDisplay:"always"});
    return this
      .validModifiers(situation, listType)
      .map( ({name, modifier}) => {
        const total = ModifierList.resolveModifier(modifier, situation);
        return { name, modifier: signedFormatter.format(total), raw: total};
      })
      .filter(x=> x.raw != 0)
      .map ( ({name, modifier}) => `${modifier} ${name}`);
  }
}

export type ConditionalModifier = {
  conditions: Precondition[],
  modifiers: Modifier[],
}

type Modifier = {
  target: ModifierTarget,
  amount: number;
}

export type ResolvedModifierList = string[];
