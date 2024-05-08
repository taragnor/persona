import { ModifierTarget } from "../../config/item-modifiers.js";
import { ModifierContainer } from "../item/persona-item.js";
import { PowerContainer } from "../item/persona-item.js";
import { UniversalItemAccessor } from "../utility/db-accessor.js";
import { PersonaDB } from "../persona-db.js";
import { Precondition } from "../../config/precondition-types.js";
import { Situation } from "../preconditions.js"
import { testPrecondition } from "../preconditions.js";
import { ModifierVariable } from "../../config/effect-types.js";

export type ModifierListItem = {
	name: string;
	source: Option<UniversalItemAccessor<PowerContainer>>;
	conditions: Precondition[];
	modifier: number;
	variableModifier: Set<ModifierVariable>;
}

export class ModifierList {
	_data: ModifierListItem[];

	constructor ( list: ModifierListItem[] = []) {
		this._data = list;
	}

	add(name: string, modifier: number, sourceItem: Option<ModifierContainer> = null, conditions: Precondition[] = []) {
		const source = sourceItem ? PersonaDB.getUniversalItemAccessor(sourceItem) : null;
		this._data.push( {
			source,
			name,
			conditions,
			modifier,
			variableModifier: new Set(),
		});
	}

	list(situtation: Situation): [number, string][] {
		const filtered = this.validModifiers(situtation);
		// const filtered = this._data.filter( item=> item.conditions.every(cond => {
		// 	const source = item.source ? PersonaDB.findItem(item.source): null;
		// 	ModifierList.testPrecondition(cond, situtation,
		// 		source)
		// }
		// ));
		return filtered.map( x=> [x.modifier, x.name]);
	}

	concat (this: Readonly<ModifierList>, other: Readonly<ModifierList>) : ModifierList {
		const list = this._data.concat(other._data);
		return new ModifierList(list);
	}

	validModifiers (situation: Situation) : ModifierListItem[]  {
		return this._data.filter( item => {
			const source = item.source ? PersonaDB.findItem(item.source) as PowerContainer: null;
			if (item.conditions.every( cond => ModifierList.testPrecondition(cond, situation, source))) {
				if (item.modifier != 0 || item.variableModifier.size != 0) {
					return true;
				}
			}
			return false;
		});
	}

	total(situation: Situation ) : number {
		const mods = this.validModifiers(situation);
		const base =  mods.reduce( (acc, item) => acc + item.modifier , 0);
		const vartotal = mods.reduce((acc, item) => {
			return acc + ModifierList.resolveVariableModifiers(item.variableModifier, situation);
		}, 0);
		return base + vartotal;
	}

	static testPrecondition (condition: Precondition, situation:Situation, source: Option<PowerContainer>) : boolean {
		return testPrecondition( condition, situation, source);
	}

	static resolveVariableModifiers( variableMods:Set<ModifierVariable> , situation: Situation) : number {
		return Array.from(variableMods).reduce( (acc, varmod) => {
			switch (varmod) {
				case "escalationDie":
					return acc + (situation.escalationDie ?? 0);
				default:
						varmod satisfies never;
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
				return { name, modifier: signedFormatter.format(total), raw: total}
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

