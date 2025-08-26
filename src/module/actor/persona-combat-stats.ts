import { PersonaError } from "../persona-error.js";
import { SeededRandom } from "../utility/seededRandom.js";
import { ValidAttackers } from "../combat/persona-combat.js";
import { Persona } from "../persona-class.js";

export class PersonaCombatStats {

	static STAT_POINTS_PER_LEVEL = 3;
	static MAX_STAT_GAP =  10;

	static staminaDR(persona: Persona) : number{
		return Math.floor(persona.endurance / 2);
	}

	static strDamageBonus(persona: Persona) : number {
		return persona.strength;
	}

	static lukCriticalBoost(persona: Persona) : number {
		return 0;
	}

	static lukCriticalResist(persona: Persona) : number {
		return 0;
	}

	static lukInstantDeathBonus(persona: Persona) : number {
		return 0;
	}

	static lukInstantDeathResist(persona: Persona) : number {
		return 0;
	}

	static magDamageBonus(persona: Persona) : number {
		return persona.magic;
	}

	static getPhysicalVariance(persona:Persona) : number {
		return 1 + Math.round(persona.luck / 10);
	}

	static getMagicalVariance(persona:Persona) : number {
		return 1 + Math.round(persona.luck / 10);
	}

	static autoSpendPoints(persona: Persona, level: number) : StatGroup {
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
		const rng = new SeededRandom(`${persona.name}${tarotName}${level}`);
		let statsToBeChosen = this.STAT_POINTS_PER_LEVEL;
		while (statsToBeChosen > 0) {
			const slist = (Object.keys(stblk) as PersonaStatType[])
				.filter(( st) => PersonaCombatStats.canRaiseStat(st, stblk))
				.flatMap( st => {
					if (favored && st == favored) {
						return [st,st, st, st];
					}
					if (disfavored && st == disfavored) {
						return [st];
					}
					return [st,st];
				});
			if (slist.length == 0) throw new PersonaError(`All stats unselectable for ${persona.source.name}`);
			const stat = rng.randomArraySelect(slist)!;
			stblk[stat] += 1;
			stIncreases[stat] += 1;
			statsToBeChosen -= 1;
		}
		return stIncreases;
	}

	static canRaiseStat(st: PersonaStatType, statBlock: StatGroup) : boolean {
		return statBlock[st] < PersonaCombatStats.maxStatAmount(statBlock);
	}

	static maxStatAmount(statBlock: StatGroup): number {
		const MaxStatGap = this.MAX_STAT_GAP;
		const minStat = Object.values(statBlock).reduce ( (a, x) => Math.min(a, x));
		return minStat + MaxStatGap;
	}


}

type StatGroup = Record<PersonaStatType, number>;

type PersonaStatType = keyof ValidAttackers["system"]["combat"]["personaStats"]["stats"];
