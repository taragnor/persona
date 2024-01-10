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
		const filtered= this._data.filter( item=> item.conditions.every(cond => ModifierList.satisfiesPrecondition(cond, situtation)));
			return filtered.map( x=> [x.modifier, x.name]);
	}

	concat (this: ModifierList, other: ModifierList) : ModifierList {
		const list = this._data.concat(other._data);
		return new ModifierList(list);
	}

	total(situation: Situation = {}) : number {
		return this._data.reduce ( (acc, item) => {
			if (item.conditions.every( cond => ModifierList.satisfiesPrecondition(cond, situation))) {
				return acc + item.modifier;
			}
			return acc;
		}, 0);

	}

	valueOf() : number {
		return this.total({});
	}


	static satisfiesPrecondition(condition: Precondition, situation: Situation): boolean {
		const nat = situation.naturalAttackRoll;
		switch (condition.type) {
			case "always":
				return true;
			case "natural+":
				return nat != undefined && nat >= condition.num! ;
			case "natural-":
				return nat != undefined && nat <= condition.num! ;
			case "natural-odd":
				return nat != undefined && nat % 2 == 1;
			case "natural-even":
				return nat != undefined && nat % 2 == 0;
			case "critical":
				return situation.criticalHit ?? false;
			case "miss":
					return situation.hit === false;
			case "hit":
					return situation.hit === true;
			case "escalation+":
				return situation.escalationDie != undefined && situation.escalationDie >= condition.num!;
			case "escalation-":
				return situation.escalationDie != undefined && situation.escalationDie <= condition.num!;
			case "activation+":
				return !!situation.activationRoll && nat! >= condition.num!;
			case "activation-":
				return !!situation.activationRoll && nat! <= condition.num!;
			case "activation-odd":
				return !!situation.activationRoll && nat! % 2 == 1;
			case "activation-even":
				return !!situation.activationRoll && nat! % 2 == 0;
			default:
				condition.type satisfies never;
				return false;
		}
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
}


