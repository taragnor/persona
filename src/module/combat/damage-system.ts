import {NewDamageConsequence} from "../../config/consequence-types.js";
import {DamageLevel, DamageType, RealDamageType, ResistStrength} from "../../config/damage-types.js";
import {ItemSubtype, ModifierContainer, PersonaItem} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {AttackResult} from "./combat-result.js";
import {DamageCalculation, EvaluatedDamage} from "./damage-calc.js";
import {ConsequenceProcessed, PersonaCombat} from "./persona-combat.js";

export abstract class DamageSystemBase implements DamageInterface {

	BURN_PERCENT = 0.15 as const; //percentage damage of burn damage

	getDamage(power: Usable, attackerPersona: Persona, targetPersona: Persona, situation ?: Situation, options : GetDamageOptions = {}) : DamageCalculation {
		const damageType = power.getDamageType(attackerPersona);
		const calc = this.getPowerDamage(power, attackerPersona, situation, options);
		calc.setDamageType(damageType);
		if (!options.ignoreDefenses) {
			this.applyDR(calc, damageType, power, attackerPersona, targetPersona);
			const resist = targetPersona.elemResist(damageType);
			this.setResistance(calc, power, situation, resist);
		}
		return calc;
	}

	defaultSituation(power : Usable, attackerPersona: Persona, targetPersona: Persona) : Situation {
		return {
				user: attackerPersona.user.accessor,
				target: targetPersona.user.accessor,
				usedPower: power.accessor,
			};
	}

	protected setResistance(calc: DamageCalculation, power: Usable, situation: U<Situation>, resist: ResistStrength) {
		const piercePower = power && power.hasTag('pierce');
		const pierceTag = situation != undefined && 'addedTags' in situation && situation.addedTags && situation.addedTags.includes('pierce');
		if (piercePower || pierceTag) {return;}
		switch (resist) {
			case "resist":
				calc.setResisted();
				break;
			case "absorb" :
				calc.setAbsorbed();
				break;
			case "block":
				calc.setBlocked();
				break;
		}
	}

	getPowerDamage(power: Usable, attackerPersona: Persona, situation ?: Situation, damageOptions : GetDamageOptions = {}) : DamageCalculation {
		if (!situation) {
			situation = {
				user: attackerPersona.user.accessor ,
				usedPower: power.accessor,
				hit: true,
				attacker: attackerPersona.user.accessor
			};
		}
		const typeOverride = damageOptions.overrideDamageType;
		if (!typeOverride) {
			if (power.system.dmg_type == 'none') {
				return new DamageCalculation('none');
			}
		}
		if (power.isPower() && power.system.damageLevel == 'none') {
			return new DamageCalculation('none');
		}
		let subtype : Power["system"]["subtype"] = "none";
		if (power.isPower()) {
			subtype = power.system.damageLevel == "fixed" ?
				"standalone" : power.system.subtype;
		} else {
			subtype = 'standalone';
		}
		switch(subtype) {
			case 'weapon' : {
				return this.getWeaponSkillDamage(power as ItemSubtype<Power, 'weapon'>, attackerPersona, situation);
			}
			case 'magic': {
				return this.getMagicSkillDamage(power  as ItemSubtype<Power, 'magic'>, attackerPersona, situation);
			}
			case 'standalone': {
				return this.getStandaloneDamage(power, typeOverride);
			}
			default:
				return new DamageCalculation('none');
		}
	}

	getBurnDamage(_power: Usable, _attackerPersona: Persona, targetPersona: Persona) : number {
		return Math.round(targetPersona.source.mhp  * this.BURN_PERCENT);
	}

	protected calculateAllOutAttackDamage(attackLeader: ValidAttackers, allAttackers: ValidAttackers[], target:ValidAttackers, situation: AttackResult['situation'] ) : AllOutReturn[] {
		const list : AllOutReturn[] = [];
		for (const actor of allAttackers) {
			if (!actor.canAllOutAttack()) {continue;}
			const isAttackLeader = actor == attackLeader;
			const damageCalc = this.individualContributionToAllOutAttackDamage(actor, target, situation, isAttackLeader);
			const result = damageCalc.eval();
			if (result == undefined) {
				PersonaError.softFail('Allout contribution for ${actor.name} was undefined');
				continue;
			}
			const contribution= Math.round(Math.abs(result.hpChange));
			list.push( {
				contributor: actor,
				amt: contribution,
				stack: result.str,
			});
		}
		return list;
	}

	protected abstract individualContributionToAllOutAttackDamage(attacker: ValidAttackers, target: ValidAttackers, situation: AttackResult['situation'], isAttackLeader: boolean) : DamageCalculation;

	protected abstract applyDR(calc: DamageCalculation, damageType: RealDamageType, power: Usable, attackerPersona: U<Persona>, targetPersona: Persona) : DamageCalculation;

	abstract getWeaponSkillDamage(power: ItemSubtype<Power, 'weapon'>, userPersona: Persona, situation: Situation) : DamageCalculation ;

abstract	getMagicSkillDamage(power: ItemSubtype<Power, 'magic'>, userPersona: Persona, situation: Situation) : DamageCalculation ;

	getStandaloneDamage(power: Usable, damageTypeOverride?: DamageType) : DamageCalculation {
		const dmg = power.system.damage;
		const baseDtype = damageTypeOverride || power.system.dmg_type;
		const dtype = baseDtype == 'by-power' ? 'untyped' : baseDtype;
		const calc = new DamageCalculation(dtype);
		calc.add('base', dmg.low, `${power.displayedName.toString()} base damage`);
		calc.add('evenBonus', dmg.high - dmg.low, `${power.displayedName.toString()} Even Bonus Damage`);
		return calc;
	}

	convertFromOldLowDamageToNewBase(low: number) : number {
		return this.getWeaponDamageByWpnLevel(low-1);
	}

	processConsequence_damage( consequence: SourcedConsequence<NewDamageConsequence>, targets: ValidAttackers[], attacker: ValidAttackers, powerUsed: U<ModifierContainer>, situation: Situation) : ConsequenceProcessed['consequences'] {
		return targets.flatMap( target => {
			const cons = this.process_damageConsOnTarget(consequence, target, attacker, powerUsed, situation);
			if (cons != null) {
				return [{
					applyTo: target,
					cons,
				}];
			} return [];
		});

	}

	protected process_damageConsOnTarget( cons: SourcedConsequence<NewDamageConsequence>, target: ValidAttackers, attacker: ValidAttackers, powerUsed: U<ModifierContainer>, situation: Situation) : N<ConsequenceProcessed['consequences'][number]["cons"]> {
		const damageOptions : GetDamageOptions= {};
		let dmgCalc: U<DamageCalculation>;
		let damageType : U<RealDamageType> = cons.damageType != "by-power" ? cons.damageType : "none";
		const power = powerUsed instanceof PersonaItem && powerUsed.isUsableType() ? powerUsed : undefined;
		if (power && power.isUsableType()) {
			damageType = cons.damageType != 'by-power' && cons.damageType != undefined ? cons.damageType : power.getDamageType(attacker);
		}
		cons = {
			...cons,
			damageType,
		};
		switch (cons.damageSubtype) {
			case "set-to-const":
			case "set-to-percent": {
				return cons;
			}
		}
		if (cons.damageType == undefined) {
			PersonaError.softFail(`Damage type is undefined for ${power?.name ?? "Undefined Power"}`, cons);
			return null;
		}
		switch (cons.damageSubtype) {
			case 'low':
			case 'high':
			case 'odd-even': {
				if (!power) {return null;}
				if (situation.naturalRoll == undefined) {
					PersonaError.softFail(`Can't get odd even for damage of ${power.displayedName.toString() }` );
					return null;
				}
				if (cons.damageType != "by-power") {
					damageOptions["overrideDamageType"] =  cons.damageType;
				}
				dmgCalc = power.damage.getDamage(power, attacker.persona(), target.persona(), situation, damageOptions);
				const evenRoll = (situation.naturalRoll ?? 0) % 2 == 0;
				if ( cons.damageSubtype == "high" || (cons.damageSubtype == "odd-even" && evenRoll)) {
					dmgCalc.setApplyEvenBonus();
				}
				return {
					...cons,
					calc: dmgCalc,
				};
			}
			case 'multiplier':
				return cons;
			case 'allout': {
				const combat = PersonaCombat.combat;
				if (!combat) { return null; }
				const userTokenAcc = combat.getToken(situation.user);
				if (!userTokenAcc) {
					PersonaError.softFail(`Can't calculate All out damage - no token for ${situation?.user?.actorId ?? 'Null user'}`);
					return null;
				}
				const userToken = PersonaDB.findToken(userTokenAcc);
				if (!combat) {return null;}
				const leader = combat.getCombatantByToken(userToken);
				if (!leader) {return null;}
				const allAttackers = combat
				.getAllies(leader, true)
				.map (ally => ally.actor)
				.filter( ally => ally.canAllOutAttack());
				const allOutDmg = this.calculateAllOutAttackDamage(userToken.actor, allAttackers, target, situation as AttackResult['situation']);
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
				return {
					...cons,
					calc: dmgCalc,
				};
			}
			case 'constant':
			case 'percentage-current':
			case 'percentage':
			case 'mult-stack':
				return cons;
			default:
				cons.damageSubtype satisfies never;
				return null;
		}

	}

	 abstract getWeaponDamageByWpnLevel(lvl: number) : number;
	abstract getArmorDRByArmorLevel(lvl: number) : number;
}


export interface DamageInterface {
	getBurnDamage(power: Usable, attackerPersona: Persona, targetPersona: Persona) : number;
	getDamage(power: Usable,attackerPersona: Persona, targetPersona: Persona, situation ?: Situation, options?: GetDamageOptions) : DamageCalculation;
	// applyDR(calc: DamageCalculation, damageType: RealDamageType, power: Usable, attackerPersona: U<Persona>, targetPersona: Persona) : DamageCalculation;
	convertFromOldLowDamageToNewBase(lowDmg: number): number;
	getWeaponDamageByWpnLevel(lvl: number) : number;
	getArmorDRByArmorLevel(lvl: number) : number;
	// calculateAllOutAttackDamage(attackLeader: ValidAttackers, allAttackers: ValidAttackers[], situation: AttackResult['situation'] ) : AllOutReturn[];
	// individualContributionToAllOutAttackDamage(actor: ValidAttackers, situation: AttackResult["situation"], isAttackLeader: boolean) : DamageCalculation;
	processConsequence_damage( cons: SourcedConsequence<NewDamageConsequence>, targets: ValidAttackers[], attacker: ValidAttackers, powerUsed: U<ModifierContainer>, situation: Situation) : ConsequenceProcessed['consequences'];

}

export type ConvertableDamageLevel = Exclude<DamageLevel, "-" | "fixed">;

export type NewDamageParams = {
	baseAmt: number,
	extraVariance: number,
};


export type AllOutReturn  = {
	contributor: ValidAttackers,
	amt: number,
	stack: EvaluatedDamage['str']
};

interface GetDamageOptions {
	overrideDamageType ?:  RealDamageType;
	ignoreDefenses?: boolean;
}
