import {Consequence, DamageConsequence, DeprecatedConsequence, NonDeprecatedConsequence, OldDamageConsequence} from "../../config/consequence-types.js";
import {DamageType} from "../../config/damage-types.js";
import {PersonaItem} from "../item/persona-item.js";
import {PersonaError} from "../persona-error.js";

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
				if (usable && usable instanceof PersonaItem && usable.isUsableType()) {
					return this.convertDeprecatedDamageConsequence(dep, usable.system.dmg_type);
				}
				return this.convertDeprecatedDamageConsequence(dep);
			case "save-slot":
			case "half-hp-cost":
			case "add-escalation":
				console.log(`Deprecated Consequence type ${dep.type} in ${usable?.name}`);
				return {
					type: "none"
				};
			default:
				dep satisfies never;
		}
		return cons as NonDeprecatedConsequence;
	}

	static convertDeprecatedDamageConsequence( cons: OldDamageConsequence, defaultDamageType?: DamageType) : DamageConsequence {
		if (!defaultDamageType) {
			defaultDamageType = "by-power";
		}
		let st : DamageConsequence["damageSubtype"];
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
				if (amount < 1) {
					amount *= 100;
				}
				break;
			case "hp-loss":
				st ="constant";
				dtype = "none";
				break;
		}
		return {
			type: "damage-new",
			damageSubtype: st,
			damageType: dtype,
			amount: amount,
			calc: cons.calc,
		};
	}

}
