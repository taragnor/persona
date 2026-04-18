import {NewDamageConsequence, NonDeprecatedConsequence} from "../../config/consequence-types.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {AttackResult, CombatResult} from "../combat/combat-result.js";
import {ConsequenceProcessed, PersonaCombat} from "../combat/persona-combat.js";
import {ModifierContainer, PersonaItem} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";

export class ConsequenceProcessor {

	static async consequencesToResult(cons: SourcedConsequence<NonDeprecatedConsequence>[], power: U<ModifierContainer>, situation: Situation, atkResult: AttackResult | null): Promise<CombatResult> {
		const CombatRes = new CombatResult(atkResult);
		try {
      const attacker = (situation.attacker) ? PersonaDB.findActor(situation.attacker)?.persona() : undefined;
			const x = this.ProcessConsequences(power, situation, cons, attacker, atkResult);
			const result = await this.getCombatResultFromConsequences(x.consequences, situation, atkResult);
			CombatRes.merge(result);
		}
		catch (e) {
			PersonaError.softFail("Error turning consequence into Result", e, cons);

		}
		return CombatRes;
	}

	static processConsequences_simple(consequence_list: SourcedConsequence<NonDeprecatedConsequence>[], situation: Situation): ConsequenceProcessed {
		let consequences : ConsequenceProcessed['consequences'] = [];
		for (const cons of consequence_list) { const applyTo = "applyTo" in cons ? cons.applyTo ?? "target": "target";
			const consTargets = PersonaCombat.solveEffectiveTargets(applyTo, situation, cons) as ValidAttackers[];
			consequences= consequences.concat(this.processConsequence_simple(cons, consTargets));
		}
		return {
			consequences
		};
	}

  static ProcessConsequences(power: U<ModifierContainer>, situation: Situation, relevantConsequences: SourcedConsequence<NonDeprecatedConsequence>[], attackerPersona: U<Persona>, atkresult : Partial<AttackResult> | null)
    : ConsequenceProcessed {
      let consequences : ConsequenceProcessed['consequences']= [];
      for (const cons of relevantConsequences) {
        const sourcedC = {
          ...cons,
        };
        if (attackerPersona) {
          const newCons = this.processConsequence(power, situation, sourcedC, attackerPersona, atkresult);
          consequences = consequences.concat(newCons);
        } else {
          const applyTo = "applyTo" in sourcedC ? sourcedC.applyTo ?? "target" : "target";
          const consTargets = PersonaCombat.solveEffectiveTargets(applyTo, situation, cons) as ValidAttackers[];
          const newCons = this.processConsequence_simple( sourcedC, consTargets);
          consequences = consequences.concat(newCons);
        }
      }
      return {consequences} satisfies ConsequenceProcessed;
    }

  static processConsequence( power: U<ModifierContainer>, situation: Situation, cons: SourcedConsequence<NonDeprecatedConsequence>, attackerPersona: Persona, atkresult ?: Partial<AttackResult> | null) : ConsequenceProcessed['consequences'] {
    //need to fix this so it knows who the target actual is so it can do a proper compariosn, right now when applying to Self it won't consider resistance or consider the target's resist.
    const applyTo = "applyTo" in cons ? cons.applyTo ?? "target" : "target";
    const consTargets = PersonaCombat.solveEffectiveTargets(applyTo, situation, cons) as ValidAttackers[];
    const applyToSelf = applyTo == 'attacker' || applyTo =='user' || applyTo == 'owner';
    const absorb = ("result" in situation && situation.result == "absorb" && !applyToSelf) ?? false;
    const block = atkresult && atkresult.result == 'block' && !applyToSelf;
    switch (cons.type) {
      case 'none':
      case 'modifier':
        return [];
      case "combat-effect": {
        switch (cons.combatEffect) {
          case 'damage':
            return this.processConsequence_damage(cons, consTargets, attackerPersona, power, situation);
          case 'addStatus': case 'removeStatus':
            if (!applyToSelf && (absorb || block)) {return [];}
            return consTargets.map( target => {
              return  {applyTo: target ,cons};
            });
        }
      }
    }
    return this.processConsequence_simple(cons, consTargets);
  }

	static processConsequence_simple( cons: SourcedConsequence<NonDeprecatedConsequence>, targets: ValidAttackers[]) :ConsequenceProcessed['consequences'] {
		switch (cons.type) {
			case 'none':
			case 'modifier':
			case 'modifier-new':
			case 'add-creature-tag':
				break;
			case 'other-effect':
			case 'set-flag':
			case 'add-power-to-list':
			case 'add-talent-to-list':
			case "inventory-action":
				return targets.map( applyTo => ({applyTo, cons}));
			case 'raise-resistance':
			case 'lower-resistance':
			case 'raise-status-resistance':
			case 'inspiration-cost':
			case 'use-power':
			case 'alter-mp':
				return targets.map( applyTo => ({applyTo, cons}));
			case 'social-card-action':
			case 'teach-power':
			case 'combat-effect':
				return targets.map( applyTo => ({applyTo, cons}));
			case 'alter-variable':
				if (cons.varType == "actor") {
				return targets.map( applyTo => ({applyTo, cons}));
				} else {
					return [{applyTo: "global", cons}];
				}
			case 'perma-buff':
			case 'alter-fatigue-lvl':
			case "gain-levels":
				return targets.map( applyTo => ({applyTo, cons}));
			case 'play-sound':
				return [{applyTo: 'global', cons}];
			case 'display-msg':
				if (cons.newChatMsg) {
					return [{applyTo: 'global', cons}];
				} else {
					return targets.map( applyTo => ({applyTo, cons}));
				}
			case 'dungeon-action':
				return [{applyTo: 'global', cons}];
			case 'expend-item': {
				const source = cons.source;
				if (!(source instanceof PersonaItem)) {return [];}
				if (! (source.isConsumable() || source.isSkillCard())) {
					return [];
				}
				const itemAcc = source.accessor;
				return targets.map( applyTo => {
					return {applyTo,
						cons: {
							type: 'expend-item',
							itemAcc,
							source: cons.source,
							owner: cons.owner,
							realSource: undefined,
							applyTo: cons.applyTo,
						}
					};
				});
			}
			case "cancel":
			case "set-roll-result":
				return [{applyTo: 'global', cons}];
			default:
				cons satisfies never;
				break;
		}
		return [];
	}

	static processConsequence_damage( cons: SourcedConsequence<NewDamageConsequence>, targets: ValidAttackers[], attackerPersona: Persona, powerUsed: U<ModifierContainer>, situation: Situation) : ConsequenceProcessed['consequences'] {
		return PersonaSettings.getDamageSystem().processConsequence_damage(cons, targets, attackerPersona, powerUsed, situation);
	}

	static async getCombatResultFromConsequences(consList: ConsequenceProcessed['consequences'], situation: Situation, atkResult ?: AttackResult | null ) : Promise<CombatResult> {
		const result = new CombatResult(atkResult);
		for (const cons of consList) {
			if (cons.applyTo == 'global') {
				await result.addEffect(atkResult, undefined, cons.cons, situation);
				continue;
			}
			await result.addEffect(atkResult, cons.applyTo, cons.cons, situation);
		}
		return result;
	}

}
