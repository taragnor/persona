import { ArrayCorrector } from "../item/persona-item.js";
import { testPreconditions } from "../preconditions.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import {PersonaError} from "../persona-error.js";
import {ConsequenceAmountResolver} from "../conditionalEffects/consequence-amount.js";
import {PersonaActor} from "../actor/persona-actor.js";

export type ModifierListItem = Sourced<{
	name: string;
	// source: Option<UniversalAccessor<T>>;
	conditions:  SourcedPrecondition[];
	modifier: number;
}>;

type MLListType = "standard"
	| "percentage"
	| "percentage-special" //presented in additive format +.35 instad of +135%;

export class ModifierList {
	_data: ModifierListItem[];
	listType: MLListType;

	constructor ( sourcedEffects: SourcedConditionalEffect[], bonusFn : (eff :SourcedConditionalEffect) => number ,listType?: MLListType);
	constructor ( list?: ModifierListItem[], listType?: MLListType);
	constructor ( list: ModifierListItem[] | SourcedConditionalEffect[] = [], listTypeOrFn: MLListType | ((eff: SourcedConditionalEffect) => number) = "standard", listType ?: MLListType)
	{
		this.listType = typeof listTypeOrFn != "function" ? listTypeOrFn : (listType ? listType : "standard");
		if (list.length == 0 || ("name" in list.at(0)!)) {
			this._data = list as ModifierListItem[];
			return;
		}
		const ModListItems = (list as SourcedConditionalEffect[]).map( eff=> ({
			name: eff?.realSource?.name ?? eff.source?.name ?? "Unknown Source",
			source: eff.source,
			owner: eff.owner,
			realSource : eff.realSource,
			conditions: ArrayCorrector(eff.conditions),
			modifier: typeof listTypeOrFn == "function" ? listTypeOrFn(eff): 0,
		}));
		this._data = ModListItems;
		this._data= this._data.filter( x=> x.modifier != 0);
	}

	add(name: string, modifier: number, sourceItem?: ModifierListItem["source"]  , owner ?: ModifierListItem["owner"], conditions: SourcedPrecondition[] = []) : ModifierList {
		this._data.push( {
			source: sourceItem,
			owner,
			name,
			conditions,
			modifier,
			realSource: undefined,
		});
		return this;
	}

	filterZero() {
		this._data= this._data.filter( x=> x.modifier != 0);
	}

	list(situtation: Situation, listType : ModifierList["listType"] = this.listType): [number, string][] {
		const filtered = this.validModifiers(situtation, listType);
		return filtered.map( x=> [x.modifier, x.name]);
	}

	concat (this: Readonly<ModifierList>, other: Readonly<ModifierList>) : ModifierList {
		const list = this._data.concat(other._data);
		return new ModifierList(list, this.listType);
	}

	validModifiers (situation: Situation, type : ModifierList["listType"] = this.listType) : ModifierListItem[]  {
		return this._data.filter( item => {
			try {
				// const source = item.source ? PersonaDB.find(item.source) ?? null: null;
				if (item.modifier == 0 && type =="standard" ) {return false;}
					return testPreconditions(item.conditions, situation);
				} catch (e) {
					PersonaError.softFail("Problem with Valid MOdifiers in situation, can't get source",e,item );
					return false;
				}
		});
	}


	static getModifierAmount(consequences: SourcedConsequence[], targetMods: ModifierTarget[] | ModifierTarget) : number {
		targetMods = Array.isArray(targetMods) ? targetMods : [targetMods];
		return (ArrayCorrector(consequences) ?? [])
			.reduce( (acc,cons)=> {
				if ("modifiedFields" in cons
					&& targetMods
					.some( f => cons.modifiedFields[f] == true)
				) {
					const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
					const amount = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, {}) ?? 0;
					return acc + amount;
				}
				if ("modifiedField" in cons && cons.modifiedField && targetMods.includes(cons.modifiedField)) {
					if (cons.amount) {
						const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
						const amount = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, {}) ?? 0;
						return acc + amount;
					}
				}
				return acc;
			}, 0);
	}

	addConditionalEffects( effects: SourcedConditionalEffect[], source: PowerContainer  | string, bonusTypes: ModifierTarget[]) : this {
		const sourceName = typeof source =="string" ? source : source.name;
		const stuff : ModifierListItem[] = (ArrayCorrector(effects) ?? []).map( eff=>{
			return {
				name: sourceName,
				source: eff.source,
				owner: eff.owner,
				conditions: ArrayCorrector(eff.conditions),
				modifier: ModifierList.getModifierAmount(eff.consequences, bonusTypes),
				realSource: eff.realSource,
			};
		});
		this._data = this._data.concat(stuff);
		return this;

	}

	total(user: ValidAttackers, style ?: ModifierList["listType"]) : number;
	total(situation: Situation , style ?: ModifierList["listType"]) : number;
	total(situationOrActor: Situation | ValidAttackers , style = this.listType) : number {
		const situation :Situation = situationOrActor instanceof PersonaActor  ? {user: situationOrActor.accessor} : situationOrActor;
		const mods = this.validModifiers(situation, style);
		switch (style) {
			case "standard": {
				const base =  mods.reduce( (acc, item) => acc + item.modifier , 0);
				return base;
			}
			case "percentage": {
				const base =  mods.reduce( (acc, item) => acc * (item.modifier ?? 1) , 1);
				return base;
			}
			case "percentage-special": {
				return mods
				.map( x => {
					const mod = x.modifier ?? 1;
					if (mod < 0)  {
						return 1 + mod;
					}
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
				const total = modifier;
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

export type ResolvedModifierList =string[];
// export type ResolvedModifierList ={name: string, modifier:string}[];

