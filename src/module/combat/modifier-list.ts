import { PRECONDITIONLIST } from "../../config/effect-types.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { ModifierContainer } from "../item/persona-item.js";
import { Usable } from "../item/persona-item.js";
import { PowerContainer } from "../item/persona-item.js";
import { UniversalItemAccessor } from "../utility/db-accessor.js";
import { UniversalTokenAccessor } from "../utility/db-accessor.js";
import { PersonaDB } from "../persona-db.js";
import { PToken } from "./persona-combat.js";
import { PC } from "../actor/persona-actor.js";
import { Shadow } from "../actor/persona-actor.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";

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
		const filtered= this._data.filter( item=> item.conditions.every(cond => {
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
				return !!situation.activationRoll && nat! % 2 == 0; case "in-battle":
				return situation.activeCombat != undefined;
			case "non-combat":
				return situation.activeCombat == undefined;
			case "talent-level+":
				if (!situation.user) return false
				const id = source ? source.id! : "";
				const user = PersonaDB.findActor(situation.user);
				return !user.system.talents.some( x=> x.talentId == id && x.talentLevel < (condition.num ?? 0))
			default:
				condition.type satisfies never;
				const err = `Unexpected Condition: ${condition.type}`;
				console.error(err);
				ui.notifications.error(err);
				return false;
		}
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
	usedPower?: UniversalItemAccessor<Usable>;
	activeCombat ?: unknown ;
	naturalAttackRoll ?: number;
	criticalHit ?: boolean;
	hit?: boolean;
	resisted ?: boolean;
	struckWeakness ?: boolean;
	isAbsorbed ?: boolean;
	escalationDie ?: number;
	activationRoll ?: boolean;
	target?: UniversalTokenAccessor<PToken>;
	userToken?: UniversalTokenAccessor<PToken>;
	user: UniversalActorAccessor<PC | Shadow>;
}



