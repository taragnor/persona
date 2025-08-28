import { PersonaError } from "../persona-error.js";
import { SeededRandom } from "../utility/seededRandom.js";
import { ValidAttackers } from "../combat/persona-combat.js";
import { Persona } from "../persona-class.js";

export class PersonaCombatStats {

	static STAT_POINTS_PER_LEVEL = 3;
	static MAX_STAT_GAP =  10;
	static MAX_STAT_VAL = 99;
	static MIN_STAT_VAL = 1;

	static staminaDR(persona: Persona) : number{
		return Math.floor(persona.endurance);
	}

	static strDamageBonus(persona: Persona) : number {
		return persona.strength;
	}

	static lukCriticalBoost(persona: Persona) : number {
		return Math.floor((persona.luck + 2) / 5);
	}

	static lukCriticalResist(persona: Persona) : number {
		return Math.floor(persona.luck / 5);
	}

	static lukInstantDeathBonus(persona: Persona) : number {
		return Math.floor((persona.luck + 1) / 5);
	}

	static lukInstantDeathResist(persona: Persona) : number {
		return Math.floor((persona.luck + 3) / 5);
	}

	static magDamageBonus(persona: Persona) : number {
		return persona.magic * 2;
	}

	static getPhysicalVariance(persona:Persona) : number {
		return 1 + Math.round(persona.strength / 5);
	}

	static getMagicalVariance(persona:Persona) : number {
		return 1 + Math.round(persona.magic / 5);
	}

	static unspentStatPoints(persona: Persona) : number {
		const total = Object.values(persona.combatStats.stats).reduce( (a,x) => a+x, 0);
		const baseStatPoints = 5;
		const expected_total = persona.level * this.STAT_POINTS_PER_LEVEL + baseStatPoints;
		return expected_total - total;
	}

	static autoSpendPoints(persona: Persona, pointsToSpend: number = persona.unspentStatPoints) : StatGroup {
		const favored = persona.combatStats.preferred_stat;
		const disfavored = persona.combatStats.disfavored_stat;
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
			...persona.combatStats.stats
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


}

export type StatGroup = Record<PersonaStatType, number>;

type PersonaStatType = keyof ValidAttackers["system"]["combat"]["personaStats"]["stats"];
