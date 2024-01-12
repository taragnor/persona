import { PersonaItem } from "../item/persona-item";
import { PersonaActor } from "../actor/persona-actor";
import { PRECONDITIONLIST } from "../../config/effect-types";

type ModifierListItem = {
	name: string;
	conditions: Precondition[]
	modifier: number,
}
export class ModifierList {
	_data: ModifierListItem[];
	constructor (list: ModifierListItem[] = []) {
		this._data = list;
	}

	add(name: string, modifier: number, conditions: Precondition[] = []) {
		this._data.push( {
			name,
			conditions,
			modifier
		});
	}

	list(situtation: Situation): [number, string][] {
		const filtered= this._data.filter( item=> item.conditions.every(cond => PersonaItem.testPrecondition(cond, situtation)));
			return filtered.map( x=> [x.modifier, x.name]);
	}

	concat (this: ModifierList, other: ModifierList) : ModifierList {
		const list = this._data.concat(other._data);
		return new ModifierList(list);
	}

	total(situation: Situation = {}) : number {
		return this._data.reduce ( (acc, item) => {
			if (item.conditions.every( cond => PersonaItem.testPrecondition(cond, situation))) {
				return acc + item.modifier;
			}
			return acc;
		}, 0);

	}

	valueOf() : number {
		return this.total({});
	}


}

export type Precondition = {
	type : typeof PRECONDITIONLIST[number],
	num?: number,
}


export type Situation = {
	//more things can be added here all should be optional
	activeCombat ?: unknown ;
	naturalAttackRoll ?: number;
	criticalHit ?: boolean;
	hit?: boolean;
	escalationDie ?: number;
	activationRoll ?: boolean;
	target?: PersonaActor;
}


