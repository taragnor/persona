import {Consequence, Dep_DamageConsequence, DeprecatedConsequence, NewDamageConsequence, NonDeprecatedConsequence, NonDeprecatedDamageCons, OldDamageConsequence} from "../../config/consequence-types.js";
import {DamageType} from "../../config/damage-types.js";
import {DeprecatedModifierTarget, ModifierTarget, NonDeprecatedModifierTarget} from "../../config/item-modifiers.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {ConditionTarget, MultiCheck} from "../../config/precondition-types.js";
import {PersonaItem} from "../item/persona-item.js";

export class ConsequenceConverter {

	static convertDeprecated( cons: Consequence, usable?: Item | null): NonDeprecatedConsequence {
		const dep = cons as DeprecatedConsequence;
		const applyTo = this.resolveApplyTo(dep);
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
					type: "none",
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
          potency: dep.amount ?? 1,
					applyTo,
				};
			case "removeStatus":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
					statusName: dep.statusName,
					applyTo,
				};
			case "extraAttack":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
					iterativePenalty: dep.iterativePenalty,
					amount: dep.amount,
					applyTo,
				};
			case "extraTurn":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
					applyTo,
				};
			case "scan":
				return {
					type: "combat-effect",
					combatEffect: dep.type,
					amount: dep.amount,
					downgrade: dep.downgrade ?? false,
					applyTo,
				};

      case "alter-energy":
        return {
          type: "combat-effect",
          combatEffect: dep.type,
          amount: dep.amount,
          applyTo,
        };
      case "modifier-new": {
        const fields = this.fixDeprecatedModifiers(dep.modifiedFields);
        const ret : NonDeprecatedConsequence = {
          type: dep.type,
          modifiedFields: fields,
          modifierCategory: "",
          amount: dep.amount,
        };
        return ret;
      }
      case "modifier": {
        const newField = this.convertModifierField(dep.modifiedField);
        if (newField) {
          const ret : NonDeprecatedConsequence = {
            type: dep.type,
            modifiedField: newField,
            modifierCategory: dep?.modifierCategory ?? "",
            amount: dep.amount,
          };
          return ret;
        }
        return {
          type : "none",
        };
      }
      case "expend-slot":
        return { type : "none", };
      default:
        dep satisfies never;
    }
    return cons as NonDeprecatedConsequence;
  }

  static fixDeprecatedModifiers( fields: MultiCheck<DeprecatedModifierTarget>) : MultiCheck<NonDeprecatedModifierTarget> {
    const reviseArr = Object.entries(fields)
    .map( ([k, v]) => [this.convertModifierField(k as ModifierTarget), v])
    .filter (([k, _v]) => k != undefined);
    return Object.fromEntries(reviseArr) as MultiCheck<NonDeprecatedModifierTarget>;
  }

  static convertModifierField( field: U<ModifierTarget>) : U<NonDeprecatedModifierTarget> {
    const nonDField = field as DeprecatedModifierTarget;
    switch (nonDField) {
      case "wpnMult":
      case "magHigh":
      case "magLow":
      case "wpnDmg_low":
      case "wpnDmg_high":
      case "weakestSlot":
      case "pay":
      case "will":
        return undefined;
      case "mpCostMult":
        return "power-mp-cost-mult";
      case undefined:
        return "allAtk"; //for modifiers that have yet to be filled in
      default:
        nonDField satisfies never;
    }
    return field as NonDeprecatedModifierTarget;
  }

	static convertDeprecatedDamageConsequence( cons: OldDamageConsequence | Dep_DamageConsequence, defaultDamageType?: DamageType) : NonDeprecatedDamageCons {
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
		const applyTo = this.resolveApplyTo(cons);
		return {
			type: "combat-effect",
			combatEffect: "damage",
			damageSubtype: st,
			damageType: dtype,
			amount: amount,
			calc: cons.calc,
			applyTo,
		};
	}

	static resolveApplyTo ( cons: Consequence) : ConditionTarget {
		if ("applyTo" in cons && cons.applyTo != undefined) {
			return cons.applyTo;
		}
		if ("applyToSelf" in cons) {
			return cons.applyToSelf ? "user" : "target";
		}
		if (PersonaSettings.debugMode()) {
			switch (cons.type) {
				case "modifier":
				case "modifier-new":
				case "none":
					break;
				default:
					console.debug(`Applying default applyTo of 'target' for ${cons.type}`);
			}
		}
		return "target";
	}

}
