import { PersonaError } from "../persona-error.js";
import { SeededRandom } from "../utility/seededRandom.js";
import { ValidAttackers } from "../combat/persona-combat.js";
import { Persona } from "../persona-class.js";

export class PersonaCombatStats {

	persona : Persona;
	static STAT_POINTS_PER_LEVEL = 3 as const;
	static MAX_STAT_GAP =  10 as const;
	static MAX_STAT_VAL = 99 as const;
	static MIN_STAT_VAL = 1 as const;
	static DEFENSE_DIVISOR = 1.5 as const;
	static BASE_DEFENSE = 5 as const;

	constructor (persona: Persona) {
		this.persona = persona;
	}

	get combatStats() {
		return this.persona.source.system.combat.personaStats;
	}

	get strength() : number { return this.combatStats.stats.str; }
	get magic() : number { return this.combatStats.stats.mag; }
	get endurance() : number { return this.combatStats.stats.end; }
	get agility(): number { return this.combatStats.stats.agi; }
	get luck(): number { return this.combatStats.stats.luk; }

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
		return 0;
	}

	baseInit() : number {
		return Math.floor(this.agility);
	}

	staminaDR() : number{
		return Math.floor(this.endurance);
	}

	strDamageBonus() : number {
		return this.strength * 2;
	}

	lukCriticalResist() : number {
		return Math.floor(this.luck / 5);
	}

	lukInstantDeathBonus() : number {
		return Math.floor((this.luck + 1) / 5);
	}

	lukCriticalBoost() : number {
		return Math.floor((this.luck + 2) / 5);
	}

	lukInstantDeathResist() : number {
		return Math.floor((this.luck + 3) / 5);
	}

	lukAilmentResist(): number {
		return Math.floor((this.luck + 3) / 5);
	}

	lukAilmentBonus(): number {
		return Math.floor((this.luck + 4) / 5);
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
