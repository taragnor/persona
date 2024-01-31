import { ModifierTarget } from "../../config/item-modifiers.js";
import { ModifierContainer } from "../item/persona-item.js";
import { PowerContainer } from "../item/persona-item.js";
import { UniversalItemAccessor } from "../utility/db-accessor.js";
import { PersonaDB } from "../persona-db.js";
import { Precondition } from "../preconditions.js";
import { Situation } from "../preconditions.js"
import { testPrecondition } from "../preconditions.js";

export type ModifierListItem = {
	name: string;
	source: Option<UniversalItemAccessor<PowerContainer>>;
	conditions: Precondition[];
	modifier: number;
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
			modifier
		});
	}

	list(situtation: Situation): [number, string][] {
		const filtered = this._data.filter( item=> item.conditions.every(cond => {
			const source = item.source ? PersonaDB.findItem(item.source): null;
			ModifierList.testPrecondition(cond, situtation,
				source)
		}
		));
			return filtered.map( x=> [x.modifier, x.name]);
	}

	concat (this: ModifierList, other: ModifierList) : ModifierList {
		const list = this._data.concat(other._data);
		return new ModifierList(list);
	}

	validModifiers (situation: Situation) : ModifierListItem[]  {
		return this._data.filter( item => {
			const source = item.source ? PersonaDB.findItem(item.source) as PowerContainer: null;
			if (item.conditions.every( cond => ModifierList.testPrecondition(cond, situation, source))) {
				return true;
			}
			return false;
		});
	}

	total(situation: Situation ) : number {
		return this.validModifiers(situation).reduce( (acc, item) => acc + item.modifier, 0);

	}

	static testPrecondition (condition: Precondition, situation:Situation, source: Option<PowerContainer>) : boolean {
		return testPrecondition( condition, situation, source);
	}

	/** returns an array of values to use in printing the rol */
	printable(situation:Situation) : {name: string, modifier:string}[] {
		const signedFormatter = new Intl.NumberFormat("en-US", {signDisplay:"always"});
		return this
			.validModifiers(situation)
			.filter(x=> x.modifier != 0)
			.map( ({name, modifier}) => ({ name, modifier: signedFormatter.format(modifier) }));
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


