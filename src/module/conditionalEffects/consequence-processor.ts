import {ConsequenceAmount, DamageConsequence, EnhancedSourcedConsequence, NewDamageConsequence, NonDeprecatedConsequence} from "../../config/consequence-types.js";
import {RealDamageType} from "../../config/damage-types.js";
import {AttackResult, CombatResult} from "../combat/combat-result.js";
import {DamageCalculation} from "../combat/damage-calc.js";
import {ConsequenceProcessed, PersonaCombat, ValidAttackers} from "../combat/persona-combat.js";
import {ModifierContainer, PersonaItem} from "../item/persona-item.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";

export class ConsequenceProcessor {

	static async consequencesToResult(cons: SourcedConsequence<NonDeprecatedConsequence>[], power: U<ModifierContainer>, situation: Situation, attacker: ValidAttackers | undefined, target: ValidAttackers | undefined, atkResult: AttackResult | null): Promise<CombatResult> {
		const CombatRes = new CombatResult(atkResult);
		try {
			const x = this.ProcessConsequences(power, situation, cons, attacker, target, atkResult);
			const result = await this.getCombatResultFromConsequences(x.consequences, situation, attacker, target, atkResult);
			CombatRes.merge(result);
		}
		catch (e) {
			PersonaError.softFail("Error turning consequence into Result", e, cons);

		}
		return CombatRes;
	}

	static processConsequences_simple(consequence_list: SourcedConsequence<NonDeprecatedConsequence>[], situation: Situation): ConsequenceProcessed {
		let consequences : ConsequenceProcessed['consequences'] = [];
		for (const cons of consequence_list) {
			const applyTo = cons.applyTo ?? "target";
			const consTargets = PersonaCombat.solveEffectiveTargets(applyTo, situation, cons) as ValidAttackers[];
			consequences= consequences.concat(this.processConsequence_simple(cons, consTargets));
		}
		return {
			consequences
		};
	}

	static ProcessConsequences(power: U<ModifierContainer>, situation: Situation, relevantConsequences: SourcedConsequence<NonDeprecatedConsequence>[], attacker: ValidAttackers | undefined, target: ValidAttackers | undefined, atkresult : Partial<AttackResult> | null)
		: ConsequenceProcessed {
			let consequences : ConsequenceProcessed['consequences']= [];
			for (const cons of relevantConsequences) {
				const sourcedC = {
					...cons,
				};
				if (attacker) {
					const newCons = this.processConsequence(power, situation, sourcedC, attacker, target, atkresult);
					consequences = consequences.concat(newCons);
				} else {
					const applyTo = sourcedC.applyTo ?? "target";
					// const applyTo = sourcedC.applyTo ?? (sourcedC.applyToSelf ? 'owner' : 'target');
					const consTargets = PersonaCombat.solveEffectiveTargets(applyTo, situation, cons) as ValidAttackers[];
					const newCons = this.processConsequence_simple( sourcedC, consTargets);
					consequences = consequences.concat(newCons);
				}
			}
			return {consequences} satisfies ConsequenceProcessed;
		}

	static processConsequence( power: U<ModifierContainer>, situation: Situation, cons: SourcedConsequence<NonDeprecatedConsequence>, attacker: ValidAttackers, _target : ValidAttackers | undefined, atkresult ?: Partial<AttackResult> | null) : ConsequenceProcessed['consequences'] {
		//need to fix this so it knows who the target actual is so it can do a proper compariosn, right now when applying to Self it won't consider resistance or consider the target's resist.
		const applyTo = cons.applyTo ?? "target";
		const consTargets = PersonaCombat.solveEffectiveTargets(applyTo, situation, cons) as ValidAttackers[];
		const applyToSelf = applyTo == 'attacker' || applyTo =='user' || applyTo == 'owner';
		const absorb = (situation.isAbsorbed && !applyToSelf) ?? false;
		const block = atkresult && atkresult.result == 'block' && !applyToSelf;
		switch (cons.type) {
			case 'none':
			case 'modifier':
				return [];
			case "combat-effect": {
				switch (cons.combatEffect) {
					case 'damage':
						return this.processConsequence_damage(cons, consTargets, attacker, power, situation);
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
			case 'expend-slot':
				return targets.map( applyTo => ({applyTo, cons}));
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
				return targets.map( applyTo => ({applyTo, cons}));
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
				return [{applyTo: 'global', cons}];
			default:
				cons satisfies never;
				break;
		}
		return [];
	}

	static processConsequence_damage( cons: SourcedConsequence<NewDamageConsequence>, targets: ValidAttackers[], attacker: ValidAttackers, powerUsed: U<ModifierContainer>, situation: Situation) : ConsequenceProcessed['consequences'] {
		const consList : ConsequenceProcessed['consequences'] = [];
		let dmgCalc: U<DamageCalculation>;
		let dmgAmt : ConsequenceAmount = 0;
		let damageType : U<RealDamageType> = cons.damageType != "by-power" ? cons.damageType : "none";
		const power = powerUsed instanceof PersonaItem && powerUsed.isUsableType() ? powerUsed : undefined;
		if (power && power.isUsableType()) {
			damageType = cons.damageType != 'by-power' && cons.damageType != undefined ? cons.damageType : power.getDamageType(attacker);
		}
		const mods : EnhancedSourcedConsequence<DamageConsequence>['modifiers'] = [];
		cons = {
			...cons,
			damageType,
		};
		switch (cons.damageSubtype) {
			case "set-to-const":
			case "set-to-percent": {
				const consArray   = targets
				.map( target => {
					return {
						applyTo: target, 
						cons: cons,
					};
				});
				return consArray;
			}
		}
		if (cons.damageType == undefined) {
			PersonaError.softFail(`Damage type is undefined for ${power?.name ?? "Undefined Power"}`, cons);
			return [];
		}
		switch (cons.damageSubtype) {
			case 'low':
			case 'high':
			case 'odd-even': {
				if (!power) {return [];}
				if (situation.naturalRoll == undefined) {
					PersonaError.softFail(`Can't get odd even for damage of ${power.displayedName.toString() }` );
					return [];
				}
				dmgCalc = power.damage.getDamage(power, attacker.persona(), situation, cons.damageType);
				const evenRoll = (situation.naturalRoll ?? 0) % 2 == 0;
				if ( cons.damageSubtype == "high" || (cons.damageSubtype == "odd-even" && evenRoll)) {
					dmgCalc.setApplyEvenBonus();
				}
				break;
			}
			case 'multiplier':
				return targets.map( applyTo => ({applyTo, cons, })
				);
			case 'allout': {
				const combat = game.combat as PersonaCombat;
				if (combat) {
					const userTokenAcc = combat.getToken(situation.user);
					if (!userTokenAcc) {
						PersonaError.softFail(`Can't calculate All out damage - no token for ${situation?.user?.actorId ?? 'Null user'}`);
						break;
					}
					const userToken = PersonaDB.findToken(userTokenAcc);
					const allOutDmg = PersonaCombat.calculateAllOutAttackDamage(userToken, situation as AttackResult['situation']);
					dmgCalc = new DamageCalculation("all-out");
					for (const AOD of allOutDmg) {
						const source = {
							displayedName: `${AOD.contributor.displayedName} (${AOD.stack.join(', ')})`,
						};
						dmgCalc.add("base", AOD.amt, source.displayedName);
					}
					const evenRoll = (situation.naturalRoll ?? 0) % 2 == 0;
					if ( evenRoll) {
						dmgCalc.setApplyEvenBonus();
					}
					break;
				} else {
					return [];
					//bailout since no combat and can't calc all out.
				}
			}
			case 'constant':
				dmgAmt = cons.amount;
				break;
			case 'percentage-current':
			case 'percentage':
				dmgAmt = cons.amount;
				break;
			case 'mult-stack':
				dmgAmt =  cons.amount;
				break;
			default:
				cons.damageSubtype satisfies never;
		}
		if (dmgAmt || dmgCalc) {
			for (const applyTo of targets) {
				const piercePower = power && power.hasTag('pierce');
				const pierceTag = 'addedTags' in situation && situation.addedTags && situation.addedTags.includes('pierce');
				if (!piercePower && !pierceTag) {
					const resist = applyTo.persona().elemResist(damageType);
					if (resist == 'resist') {
						mods.push('resisted');
					}
					if (resist == 'absorb') {
						mods.push('absorbed');
					}
					if (resist == 'block') {
						mods.push('blocked');
					}
				}
				if (dmgCalc) {
					dmgCalc.setDamageType(damageType);
				}
				const consItems = targets.map( target => {
					const DC = dmgCalc != undefined ? dmgCalc.clone(): undefined;
					if (DC && power) {
						power.damage.applyDR(DC, damageType, power, target.persona());
					};
					return {
						applyTo: target,
						cons: {
							...cons,
							modifiers: mods,
							amount: dmgAmt,
							calc: DC
						}
					};
				});
				consList.push(...consItems);
			}
		}
		return consList;
	}

	static async getCombatResultFromConsequences(consList: ConsequenceProcessed['consequences'], situation: Situation, _attacker: ValidAttackers | undefined, _target : ValidAttackers | undefined, atkResult ?: AttackResult | null ) : Promise<CombatResult> {
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
