import {Metaverse} from "./metaverse.js";
import { PreconditionType } from "../config/effect-types.js";
import { PowerType } from "../config/effect-types.js"


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
import { PersonaCombat } from "./combat/persona-combat.js";

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
		case "escalation-odd":
			return situation.escalationDie != undefined && situation.escalationDie % 2 == 1 && !!situation.activeCombat;
		case "escalation-even":
			return situation.escalationDie != undefined && situation.escalationDie % 2 == 0 && situation.escalationDie >0 && !!situation.activeCombat;
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
		case "not-tag": {
			if (!situation.usedPower) return false;
			const power = PersonaDB.findItem(situation.usedPower);
			return !power.system.tags.includes(condition.powerTag!);
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
		case "is-engaged": {
			if (!situation.activeCombat ) return false;
			const combat = PersonaCombat.ensureCombatExists();
			return combat.isEngaged(situation.userToken!);
		}
		case "is-engaged-with-target": {
			if (!situation.activeCombat ) return false;
			const combat = PersonaCombat.ensureCombatExists();
			if (!situation.target || !situation.userToken) return false;
			return combat.isEngagedWith(situation.userToken, situation.target);
		}
		case "is-not-engaged-with-target": {
			if (!situation.activeCombat ) return true;
			if (!situation.target || !situation.userToken) return true;
			const combat = PersonaCombat.ensureCombatExists();
			return !combat.isEngagedWith(situation.userToken, situation.target);
		}
		case "metaverse-enhanced":
			return Metaverse.isEnhanced();
		case "power-type-is":
			if (!situation.usedPower) return false;
			const power = PersonaDB.findItem(situation.usedPower);
			return power.system.type == "power" && power.system.subtype == condition.powerType;
		case "is-resistant-to": {
			const resist =user.elementalResist(condition.powerDamageType!);
			switch (resist)  {
				case "resist": case "block": case "absorb": case "reflect": return true;
				case "weakness": case "normal": return false;
				default:
					resist satisfies never;
					return false;
			}
		}
		case "not-resistant-to": {
			const resist =user.elementalResist(condition.powerDamageType!);
			switch (resist)  {
				case "resist": case "block": case "absorb": case "reflect": return false;
				case "weakness": case "normal": return true;
				default:
					resist satisfies never;
					return true;
			}
		}
		case "target-is-resistant-to": {
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			const resist =target.actor.elementalResist(condition.powerDamageType!);
			switch (resist) {
				case "resist": case "block": case "absorb": case "reflect": return true;
				case "weakness": case "normal": return false;
				default:
					resist satisfies never;
					return false;
			}
		}
		case "target-is-not-resistant-to": {
			if(!situation.target) return false;
			const target = PersonaDB.findToken(situation.target);
			const resist =target.actor.elementalResist(condition.powerDamageType!);
			switch (resist) {
				case "resist": case "block": case "absorb": case "reflect": return false;
				case "weakness": case "normal": return true;
				default:
					resist satisfies never;
					return true;
			}
		}
		case "struck-weakness":{
			if (!situation.target) return false;
			if (!situation.usedPower) return false;
			const target = PersonaDB.findToken(situation.target);
			const power = PersonaDB.findItem(situation.usedPower);
			const resist = target.actor.elementalResist(power.system.dmg_type);
			return (resist == "weakness");
		}
		default:
			condition.type satisfies never;
			PersonaError.softFail(`Unexpected Condition: ${condition.type}`);
			return false;
	}
}

export type Precondition = {
	type : PreconditionType,
	num?: number,
	powerType ?: PowerType,
	powerDamageType ?: DamageType,
	powerTag ?: PowerTag,
	status?: StatusEffectId,
}

export type Situation = {
	//more things can be added here all should be optional
	user: UniversalActorAccessor<PC | Shadow>;
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
}



