import { PersonaError } from "../persona-error.js";
import { SeededRandom } from "../utility/seededRandom.js";
import { ValidAttackers } from "../combat/persona-combat.js";
import { Persona } from "../persona-class.js";
import {PersonaStat} from "../../config/persona-stats.js";
import {RealDamageType} from "../../config/damage-types.js";
import {DamageCalculation} from "../combat/damage-calc.js";
import {Usable} from "../item/persona-item.js";

export class PersonaCombatStats {

	persona : Persona;
	static AILMENT_RESIST_DIVISOR = 5 as const;
	static INSTANT_DEATH_RESIST_DIVISOR = 5 as const;
	static STAT_POINTS_PER_LEVEL = 3 as const;
	static INIT_DIVISOR = 3 as const;
	static MAX_STAT_GAP =  10 as const;
	static MAX_STAT_VAL = 99 as const;
	static MIN_STAT_VAL = 1 as const;
	static DEFENSE_DIVISOR = 2 as const;
	static BASE_INSTANT_DEATH_DEFENSE= 20 as const;
	static BASE_DEFENSE = 2 as const;
	static BASE_AILMENT_DEFENSE = 20 as const;

	constructor (persona: Persona) {
		this.persona = persona;
	}

	get combatStats() {
		return this.persona.source.system.combat.personaStats;
	}

	getStatValue(x: PersonaStat) : number {
		const permaBonus = this.combatStats.permanentStatsBonuses[x];
		const situation = {
			user: this.persona.user.accessor,
		};
		const modBonuses = this.persona
			.getBonuses(x)
			.total(situation);
		const statTotal = Math.floor( permaBonus + this.combatStats.stats[x] + modBonuses);
		return Math.min(99, statTotal);
	}

	get strength() : number { return this.getStatValue("str");}
	get magic() : number { return this.getStatValue("mag"); }
	get endurance() : number { return this.getStatValue("end"); }
	get agility(): number { return this.getStatValue("agi"); }
	get luck(): number { return this.getStatValue("luk");}

	baseFort() : number {
		return PersonaCombatStats.BASE_DEFENSE + Math.floor(this.endurance / PersonaCombatStats.DEFENSE_DIVISOR);
	}

	baseWill() : number {
		return PersonaCombatStats.BASE_DEFENSE + Math.floor(this.luck / PersonaCombatStats.DEFENSE_DIVISOR);
	}

	baseRef() : number {
		return PersonaCombatStats.BASE_DEFENSE + Math.floor(this.agility / PersonaCombatStats.DEFENSE_DIVISOR);
	}

	baseWpnAttackBonus() : number {
		return Math.floor(this.strength / PersonaCombatStats.DEFENSE_DIVISOR);
	}

	baseMagAttackBonus(): number {
		return Math.floor(this.magic / PersonaCombatStats.DEFENSE_DIVISOR);
	}

	baseAilmentAtkBonus(): number {
		return this.ailmentBonus();
	}

	baseDeathAtkBonus() : number {
		return this.instantDeathBonus();
	}

	baseInit() : number {
		return Math.floor(this.agility / PersonaCombatStats.INIT_DIVISOR);
	}

	staminaDR() : number{
		return Math.floor(this.endurance);
	}

	damageReduction(damageType : RealDamageType, power: Usable): DamageCalculation {
		const calc = new DamageCalculation(damageType);
		if (damageType == "healing") {return calc;}
		if (!power.isUsableType()) {return calc;}
		if (power.isConsumable()) {return calc;}
		if (power.isWeaponSkill())  { return this.physDR();}
		if (power.isMagicSkill()) {return this.magDR();}
		if (damageType == "all-out") {return this.physDR();}
		return calc;
	}

	enduranceDR() : DamageCalculation {
		const situation = {
			user: this.persona.user.accessor,
			target: this.persona.user.accessor,
		};
		const calc= new DamageCalculation(null);
		const stamina = this.staminaDR();
		const generalDRBonus = this.persona.getBonuses("dr").total(situation);
		const staminaString = 'Endurance Damage Reduction';
		calc.add("base", -Math.abs(stamina), staminaString);
		calc.add("base", -generalDRBonus, "DR Modifiers");
		return calc;
	}

	magDR(): DamageCalculation {
		return this.enduranceDR();
	}

	physDR() : DamageCalculation {
		const calc = this.enduranceDR();
		return calc.merge(this.armorDR());
	}

	armorDR() : DamageCalculation {
		const calc= new DamageCalculation(null);
		const situation = {
			user: this.persona.user.accessor,
			target: this.persona.user.accessor,
		};
		const armor = this.persona.armorDR();
		const armorBonus = this.persona.getBonuses("armor-dr").total(situation);
		const armorString = "Armor DR";
		calc.add("base", -Math.abs(armor), armorString);
		calc.add("base", -armorBonus, "Armor Modifiers");
		return calc;
	}

	strDamageBonus() : number {
		return this.strength * 2;
	}

	lukCriticalResist() : number {
		return Math.floor(this.luck / 5);
	}

	lukCriticalBoost() : number {
		return Math.floor((this.luck + 2) / 5);
	}

	instantDeathBonus() : number {
		return Math.floor((this.luck + 1) / 5);
	}

	instantDeathResist() : number {
		return Math.floor((this.luck + 3) / 5);
	}

	instantDeathDefense() : number {
		const defenseBoost = this.instantDeathResist();
		return defenseBoost + PersonaCombatStats.BASE_INSTANT_DEATH_DEFENSE;
	}

	ailmentDefense(): number {
		const defenseBoost = this.ailmentResist();
		return defenseBoost + PersonaCombatStats.BASE_AILMENT_DEFENSE;
	}

	ailmentResist(): number {
		const luckAilmentResist=  Math.floor((this.luck + 3) / PersonaCombatStats.AILMENT_RESIST_DIVISOR);
		return luckAilmentResist;
	}

	ailmentBonus(): number {
		return Math.floor((this.luck + 4) / PersonaCombatStats.AILMENT_RESIST_DIVISOR);
	}

	magDamageBonus() : number {
		return this.magic * 2;
	}

	getPhysicalVariance() : number {
		return 2 + Math.round(this.strength / 5);
	}

	getMagicalVariance() : number {
		return 2 + Math.round(this.magic / 5);
	}

	unspentStatPoints() : number {
		const persona = this.persona;
		const total = Object.values(this.combatStats.stats).reduce( (a,x) => a+x, 0);
		const baseStatPoints = 5;
		const expected_total = persona.level * PersonaCombatStats.STAT_POINTS_PER_LEVEL + baseStatPoints;
		return expected_total - total;
	}

	#autoSpendPoints(pointsToSpend: number = this.persona.unspentStatPoints) : StatGroup {
		const persona = this.persona;
		const favored = this.combatStats.preferred_stat;
		const disfavored = this.combatStats.disfavored_stat;
		const tarotName = persona.tarot?.name;
		const stIncreases : StatGroup = {
			str: 0,
			mag: 0,
			end: 0,
			agi: 0,
			luk: 0
		};

		if (!tarotName) {
			PersonaError.softFail(`No Tarot Card for ${persona.source.name}`);
			return  stIncreases;
		}
		const stblk : StatGroup = {
			...this.combatStats.stats
		};
		let statsToBeChosen = pointsToSpend;
		// let statsToBeChosen = this.STAT_POINTS_PER_LEVEL;
		while (statsToBeChosen > 0) {
			const slist = (Object.keys(stblk) as PersonaStatType[])
				.filter(( st) => PersonaCombatStats.canRaiseStat(st, stblk))
				.map( st => {
					let weight = 1;
					if (favored == st) {
						weight *= 1.5;
					}
					if (disfavored == st) {
						weight *= 0.80;
					}

					return {
						weight,
						item: st
					};
					// if (favored && st == favored) {
					// 	return [st,st, st, st];
					// }
					// if (disfavored && st == disfavored) {
					// 	return [st, st];
					// }
					// return [st,st, st];
				});
			const totalStatPoints = Object.values(stblk).reduce ((acc, x) => acc + x, 0);
			const rng = new SeededRandom(`${persona.name}${tarotName}${totalStatPoints}`);
			if (slist.length == 0) {
				throw new PersonaError(`All stats unselectable for ${persona.source.name}`);
			}
			// const stat = rng.randomArraySelect(slist)!;
			const stat = rng.weightedChoice(slist);
			if (stat) {
				// console.log(`${stat} chosen`);
				stblk[stat] += 1;
				stIncreases[stat] += 1;
				statsToBeChosen -= 1;
			}
		}
		return stIncreases;
	}

	canRaiseStat(st: PersonaStatType, statBlock: StatGroup = this.combatStats.stats) : boolean {
		return statBlock[st] < PersonaCombatStats.maxStatAmount(statBlock);
	}

	static canRaiseStat(st: PersonaStatType, statBlock: StatGroup) : boolean {
		return statBlock[st] < PersonaCombatStats.maxStatAmount(statBlock);
	}

	static canLowerStat(st: PersonaStatType, statBlock: StatGroup) : boolean {
		return statBlock[st] > PersonaCombatStats.minStatAmount(statBlock);
	}

	static minStatAmount(statBlock: StatGroup) : number {
		const MaxStatGap = this.MAX_STAT_GAP;
		const maxStat = Object.values(statBlock).reduce ( (a, x) => Math.max(a, x));
		return Math.max(this.MIN_STAT_VAL, maxStat - MaxStatGap);
	}

	static maxStatAmount(statBlock: StatGroup): number {
		const totalPoints = Object.values(statBlock).reduce ( (a, x) => a+x, 0);
		const MaxStatGap = Math.max(this.MAX_STAT_GAP, Math.floor(totalPoints/ 10)) ;
		const minStat = Object.values(statBlock).reduce ( (a, x) => Math.min(a, x));
		return Math.min(this.MAX_STAT_VAL, minStat + MaxStatGap);
	}

	async autoSpendStatPoints() : Promise<StatGroup> {
		const increases = this.#autoSpendPoints();
		const stats = this.persona.source.system.combat.personaStats.stats;
		for (const k of Object.keys(stats)) {
			const stat = k as keyof typeof increases;
			stats[stat] += increases[stat];
		}
		await this.persona.source.update({
			"system.combat.personaStats.stats": stats,
		});
		return increases;
	}

}

export type StatGroup = Record<PersonaStatType, number>;

type PersonaStatType = keyof ValidAttackers["system"]["combat"]["personaStats"]["stats"];
