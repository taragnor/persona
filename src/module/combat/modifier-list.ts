import { PersonaActor } from "../actor/persona-actor.js";
import { PRECONDITIONLIST } from "../../config/effect-types.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { ModifierContainer } from "../item/persona-item.js";
import { PC } from "../actor/persona-actor.js";
import { Shadow } from "../actor/persona-actor.js";
import { Usable } from "../item/persona-item.js";
import { PowerContainer } from "../item/persona-item.js";

export type ModifierListItem = {
	name: string;
	source: Option<ModifierContainer>;
	conditions: Precondition[];
	modifier: number;
}
export class ModifierList {
	_data: ModifierListItem[];
	constructor ( list: ModifierListItem[] = []) {
		this._data = list;
	}

	add(name: string, modifier: number, source: Option<ModifierContainer> = null, conditions: Precondition[] = []) {
		this._data.push( {
			source,
			name,
			conditions,
			modifier
		});
	}

	list(situtation: Situation): [number, string][] {
		const filtered= this._data.filter( item=> item.conditions.every(cond => ModifierList.testPrecondition(cond, situtation, item.source)));
			return filtered.map( x=> [x.modifier, x.name]);
	}

	concat (this: ModifierList, other: ModifierList) : ModifierList {
		const list = this._data.concat(other._data);
		return new ModifierList(list);
	}

	total(situation: Situation ) : number {
		return this._data.reduce ( (acc, item) => {
			if (item.conditions.every( cond => ModifierList.testPrecondition(cond, situation, item.source))) {
				return acc + item.modifier;
			}
			return acc;
		}, 0);

	}

	static testPrecondition (condition: Precondition, situation:Situation, source: Option<PowerContainer>) : boolean {
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
			case "in-battle":
				return situation.activeCombat != undefined;
			case "non-combat":
				return situation.activeCombat == undefined;
			case "talent-level+":
				if (!situation.user) return false
				const id = source ? source.id! : "";
				return !situation.user.system.talents.some( x=> x.talentId == id && x.talentLevel < (condition.num ?? 0))
			default:
				condition.type satisfies never;
				const err = `Unexpected Condition: ${condition.type}`;
				console.error(err);
				ui.notifications.error(err);
				return false;
		}
	}

}

export type Precondition = {
	type : typeof PRECONDITIONLIST[number],
	num?: number,
}

export type ConditionalModifier = {
	conditions: Precondition[],
	modifiers: Modifier[],
}

type Modifier = {
	target: ModifierTarget,
	amount: number;
}


export type Situation = {
	//more things can be added here all should be optional
	usedPower?: Usable;
	activeCombat ?: unknown ;
	naturalAttackRoll ?: number;
	criticalHit ?: boolean;
	hit?: boolean;
	escalationDie ?: number;
	activationRoll ?: boolean;
	target?: PersonaActor;
	user: PC | Shadow;
}



