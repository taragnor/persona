import { TensionPool } from "../exploration/tension-pool.js";
import { PersonaCombat } from "./persona-combat.js";
import { Consequence } from "../../config/consequence-types.js";
import { ArrayCorrector } from "../item/persona-item.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { testPreconditions } from "../preconditions.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { ModifierContainer } from "../item/persona-item.js";
import { PowerContainer } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";
import { Precondition } from "../../config/precondition-types.js";
import { ModifierVariable } from "../../config/effect-types.js";

export type ModifierListItem = {
	name: string;
	source: Option<UniversalItemAccessor<PowerContainer>>;
	conditions: Precondition[];
	modifier: number;
	variableModifier: Set<{variable: ModifierVariable, makeNegative: boolean}>;
}

type MLListType = "standard"
	| "percentage"
	| "percentage-special" //presented in additive format +.35 instad of +135%;

export class ModifierList {
	_data: ModifierListItem[];
	listType: MLListType;

	constructor ( list: ModifierListItem[] = [], listType: MLListType = "standard") {
		this._data = list;
		this.listType = listType;
	}

	add(name: string, modifier: number, sourceItem: Option<ModifierContainer> = null, conditions: Precondition[] = []) : ModifierList {
		const source = sourceItem ? PersonaDB.getUniversalItemAccessor(sourceItem) : null;
		this._data.push( {
			source,
			name,
			conditions,
			modifier,
			variableModifier: new Set(),
		});
		return this;
	}

	list(situtation: Situation): [number, string][] {
		const filtered = this.validModifiers(situtation);
		return filtered.map( x=> [x.modifier, x.name]);
	}

	concat (this: Readonly<ModifierList>, other: Readonly<ModifierList>) : ModifierList {
		const list = this._data.concat(other._data);
		return new ModifierList(list, this.listType);
	}

	validModifiers (situation: Situation) : ModifierListItem[]  {
		return this._data.filter( item => {
			const source = item.source ? PersonaDB.findItem(item.source): null;
			if (ModifierList.testPreconditions(item.conditions, situation, source)) {
				if (item.modifier != 0 || item.variableModifier.size != 0) {
					return true;
				}
			}
			return false;
		});
	}

	static getVariableModifiers(consequences: Consequence[], targetMods: ModifierTarget[]): ModifierList["_data"][number]["variableModifier"] {
		return new Set(ArrayCorrector(consequences).flatMap ( c=> {
			if ("modifiedFields" in c
				&& targetMods.some( f => c.modifiedFields[f] == true)
				&& c.modifierType == "system-variable") {
				return [{variable: c.varName, makeNegative: c.makeNegative}];
			}
			if (!("modifiedField" in c) || !c.modifiedField) {return [];}
			if (!targetMods.includes(c.modifiedField)) {return [];}
			if (c.type == "add-escalation") {return [{variable: "escalationDie", makeNegative: false}];}
			return [];
		}));
	}

	static getModifierAmount(consequences: Consequence[], targetMods: ModifierTarget[] | ModifierTarget) : number {
		targetMods = Array.isArray(targetMods) ? targetMods : [targetMods];
		return (ArrayCorrector(consequences) ?? [])
			.reduce( (acc,x)=> {
				if ("modifiedFields" in x
					&& targetMods.some( f => x.modifiedFields[f] == true)
					&& x.modifierType == "constant") {
					return acc + (x.amount ?? 0);
				}
				if ("modifiedField" in x && x.modifiedField && targetMods.includes(x.modifiedField)) {
					if (x.amount) {return acc + x.amount;}
				}
				return acc;
			}, 0);
	}

	addConditionalEffects( effects: ConditionalEffect[], source: PowerContainer  | string, bonusTypes: ModifierTarget[]) : this {
		const sourceName = typeof source =="string" ? source : source.name;
		const sourceAccessor = typeof source == "string" ? null : source.accessor;
		const stuff : ModifierListItem[] = (ArrayCorrector(effects) ?? []).map( eff=>{
			return {
					name: sourceName,
					source: sourceAccessor,
					conditions: ArrayCorrector(eff.conditions),
				modifier: ModifierList.getModifierAmount(eff.consequences, bonusTypes),
				variableModifier: ModifierList.getVariableModifiers(eff.consequences, bonusTypes),
			};
		});
		this._data = this._data.concat(stuff);
		return this;

	}

	total(situation: Situation , style = this.listType) : number {
		const mods = this.validModifiers(situation);
		switch (style) {
			case "standard": {
				const base =  mods.reduce( (acc, item) => acc + item.modifier , 0);
				const vartotal = mods.reduce((acc, item) => {
					return acc + ModifierList.resolveVariableModifiers(item.variableModifier, situation);
				}, 0);
				return base + vartotal;
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

	static testPreconditions (...args: Parameters<typeof testPreconditions>) : boolean {
		return testPreconditions( ...args);
	}

	static resolveVariableModifiers( variableMods: ModifierListItem["variableModifier"], _situation: Situation) : number {
		return Array.from(variableMods).reduce( (acc, varmod) => {
			const sign = varmod.makeNegative ? -1 : 1;
			switch (varmod.variable) {
				case "escalationDie":
					if (!game.combat) {return acc;}
					return acc + (((game?.combat as PersonaCombat )?.getEscalationDie() ?? 0) * sign);
				case "tensionPool":
						return (TensionPool.instance.amt ?? 0) * sign;
				default:
						varmod.variable satisfies never;
			}
			return acc;
		},0);
	}

	/** returns an array of values to use in printing the rol */
	printable(situation:Situation) : ResolvedModifierList {
		const signedFormatter = new Intl.NumberFormat("en-US", {signDisplay:"always"});
		return this
			.validModifiers(situation)
			.map( ({name, modifier, variableModifier}) => {
				const total = modifier + ModifierList.resolveVariableModifiers(variableModifier, situation);
				return { name, modifier: signedFormatter.format(total), raw: total};
			})
			.filter(x=> x.raw != 0);
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

export type ResolvedModifierList ={name: string, modifier:string}[];

