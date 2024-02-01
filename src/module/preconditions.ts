import { PreconditionType } from "../config/effect-types.js";
import { PowerContainer } from "./item/persona-item.js";
import { UniversalItemAccessor } from "./utility/db-accessor.js";
import { UniversalTokenAccessor } from "./utility/db-accessor.js";
import { UniversalActorAccessor } from "./utility/db-accessor.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaError } from "./persona-error.js";
import { Usable } from "./item/persona-item.js";
import { PToken } from "./combat/persona-combat.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";
import { DamageType } from "../config/damage-types.js";
import { PowerTag } from "../config/power-tags.js";
import { StatusEffectId } from "../config/status-effects.js";

export function testPrecondition (condition: Precondition, situation:Situation, source: Option<PowerContainer>) : boolean {
	const nat = situation.naturalAttackRoll;
	const user = PersonaDB.findActor(situation.user);
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
			return !user.system.talents.some( x=> x.talentId == id && x.talentLevel < (condition.num ?? 0))
		case "power-damage-type-is": {
			if (!situation.usedPower) return false;
			const power = PersonaDB.findItem(situation.usedPower);
			return condition.powerDamageType == power.system.dmg_type;
		}
		case "has-tag": {
			if (!situation.usedPower) return false;
			const power = PersonaDB.findItem(situation.usedPower);
			return power.system.tags.includes(condition.powerTag!);
		}
		case "user-has-status":
			return (user.statuses.has(condition.status!));
		case "user-not-status":
			return (!user.statuses.has(condition.status!));
		case "target-has-status": {
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			return (target.actor.statuses.has(condition.status!));
		}
		case "target-not-status": {
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			return (!target.actor.statuses.has(condition.status!));
		}
		case "user-is-pc":
			return user.system.type == "pc";
		case "user-is-shadow":
			return user.system.type == "shadow";
		default:
			condition.type satisfies never;
			PersonaError.softFail(`Unexpected Condition: ${condition.type}`);
			return false;
	}
}

export type Precondition = {
	type : PreconditionType,
	num?: number,
	powerDamageType ?: DamageType,
	powerTag ?: PowerTag,
	status?: StatusEffectId,
}

export type Situation = {
	//more things can be added here all should be optional
	usedPower?: UniversalItemAccessor<Usable>;
	activeCombat ?: boolean ;
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



