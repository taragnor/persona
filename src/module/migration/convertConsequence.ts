import {Consequence, DamageConsequence, DeprecatedConsequence, NewDamageConsequence, NonDeprecatedConsequence, OldDamageConsequence} from "../../config/consequence-types.js";
import {DamageType} from "../../config/damage-types.js";
import {PersonaItem} from "../item/persona-item.js";

export class ConsequenceConverter {

	static convertDeprecated( cons: Consequence, usable?: Item | null): NonDeprecatedConsequence {
		const dep = cons as DeprecatedConsequence;
		switch (dep.type) {
			case "dmg-high":
			case "dmg-low":
			case "dmg-mult":
			case "absorb":
			case "dmg-allout-low":
			case "dmg-allout-high":
			case "revive":
			case "hp-loss":
			case "damage-new":
				if (usable && usable instanceof PersonaItem && usable.isUsableType()) {
					return this.convertDeprecatedDamageConsequence(dep, usable.system.dmg_type);
				}
				return this.convertDeprecatedDamageConsequence(dep);
			case "save-slot":
			case "half-hp-cost":
			case "add-escalation":
			case "recover-slot":
			case "escalationManipulation":
				console.log(`Deprecated Consequence type ${dep.type} in ${usable?.name} - ${usable?.parent?.name}`);
				return {
					type: "none"
				};
			case "addStatus":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
					statusName: dep.statusName,
					amount: dep.amount,
					durationApplyTo: dep.durationApplyTo,
					statusDuration: dep.statusDuration,
					saveType: dep.saveType,
				};
			case "removeStatus":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
					statusName: dep.statusName,
				};
			case "extraAttack":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
					iterativePenalty: dep.iterativePenalty,
					amount: dep.amount,
				};
			case "extraTurn":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
				};
			case "scan":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
					amount: dep.amount,
					downgrade: dep.downgrade ?? false,
				};

			case "alter-energy":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
					amount: dep.amount,
				};
			default:
				dep satisfies never;
		}
		return cons as NonDeprecatedConsequence;
	}

	static convertDeprecatedDamageConsequence( cons: OldDamageConsequence | DamageConsequence, defaultDamageType?: DamageType) : NewDamageConsequence {
		if (!defaultDamageType) {
			defaultDamageType = "by-power";
		}
		let st : NewDamageConsequence["damageSubtype"];
		let dtype = cons.damageType != undefined ? cons.damageType : defaultDamageType;
		let amount = cons.amount ?? 0;
		switch (cons.type) {
			case "dmg-high":
				st = "high";
				break;
			case "dmg-low":
				st = "low";
				break;
			case "absorb":
				st = "constant";
				break;
			case "dmg-mult":
				st ="multiplier";
				break;
			case "dmg-allout-low":
			case "dmg-allout-high":
				st = "allout";
				break;
			case "revive":
				st = "percentage";
				dtype = "healing";
				if (typeof amount == "number" && amount < 1) {
					amount *= 100;
				}
				break;
			case "hp-loss":
				st ="constant";
				dtype = "none";
				break;
			case "damage-new":
				st = cons.damageSubtype;
				break;
		}
		return {
			type: "combat-effect",
			combatEffect: "damage",
			damageSubtype: st,
			damageType: dtype,
			amount: amount,
			calc: cons.calc,
		};
	}

}
