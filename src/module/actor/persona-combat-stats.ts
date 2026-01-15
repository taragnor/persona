import { PersonaError } from "../persona-error.js";
import { SeededRandom } from "../utility/seededRandom.js";
import { Persona } from "../persona-class.js";
import {PersonaStat} from "../../config/persona-stats.js";
import {Calculation} from "../utility/calculation.js";

export class PersonaCombatStats {

	persona : Persona;
	static AILMENT_RESIST_DIVISOR = 5 as const;
	static INSTANT_DEATH_RESIST_DIVISOR = 5 as const;
	static INSTANT_DEATH_BONUS_DIVISOR = 5 as const;
	static INSTANT_DEATH_ATTACK_DIVISOR = 5 as const;
	static STAT_POINTS_PER_LEVEL = 3 as const;
	static INIT_DIVISOR = 3 as const;
	static MINIMUM_MAX_STAT_GAP = 10 as const;
	static MAX_STAT_VAL = 99 as const;
	static MIN_STAT_VAL = 1 as const;
	static DEFENSE_DIVISOR = 3 as const;
	static BASE_INSTANT_DEATH_DEFENSE = 20 as const;
	static BASE_DEFENSE = 4 as const;
	static BASE_AILMENT_DEFENSE = 18 as const;
	static INSTANT_DEATH_DIVISOR = 5 as const;
	static CRITICAL_HIT_DIVISOR = 5 as const;
	static FAVORED_STAT_WEIGHT_INCREASE = 2.0 as const;
	static DISFAVORED_STAT_WEIGHT_DECREASE = 0.5 as const;
	static FAVORED_TAROT_STAT_WEIGHT_INCREASE = 1.33 as const;
	static DISFAVORED_TAROT_STAT_WEIGHT_DECREASE = 0.8 as const;
	static MAX_STAT_DIVISOR_WILD = 7 as const;
	static MAX_STAT_DIVISOR_CUSTOM = 10 as const;

	constructor (persona: Persona) {
		this.persona = persona;
	}

	get combatStats() {
		return this.persona.source.system.combat.personaStats;
	}

	getStatValue(stat: PersonaStat) : number {
		const permaBonus = this.combatStats.permanentStatsBonuses[stat];
		const situation = {
			user: this.persona.user.accessor,
		};
		const modBonuses = this.persona
			.getBonuses(stat)
			.total(situation);
		const statTotal = Math.round( permaBonus + this.getBaseStatValue(stat) + modBonuses);
		return Math.min(99, statTotal);
	}

	getBaseStatValue(stat: PersonaStat) : number {
		return this.combatStats.stats[stat];
	}

	get strength() : number { return this.getStatValue("str");}
	get magic() : number { return this.getStatValue("mag"); }
	get endurance() : number { return this.getStatValue("end"); }
	get agility(): number { return this.getStatValue("agi"); }
	get luck(): number { return this.getStatValue("luk");}

	baseMagDefense() : Calculation {
		const calc = new Calculation(PersonaCombatStats.BASE_DEFENSE);
		const subCalc = new Calculation();
		subCalc.add(0, this.endurance, `${this.persona.displayedName} Endurance`);
		subCalc.add(0, this.agility, `${this.persona.displayedName} Agility`);
		subCalc.mult(1, 1/(PersonaCombatStats.DEFENSE_DIVISOR * 2), `Defense Divisor`);
		return calc.add(0, subCalc, "Endurance Mod");
	}

	baseWill() : Calculation {
		const calc = new Calculation(PersonaCombatStats.BASE_DEFENSE, 2);
		const subCalc = new Calculation();
		subCalc.add(0, this.luck, `${this.persona.displayedName} Luck`);
		subCalc.mult(1, 1/PersonaCombatStats.DEFENSE_DIVISOR, `Defense Divisor`);
		return calc.add(0, subCalc, "Luck Modifier");
	}

	baseWpnDefense() : Calculation {
		const calc = new Calculation(PersonaCombatStats.BASE_DEFENSE, 2);
		const subCalc = new Calculation();
		subCalc.add(0, this.agility, `${this.persona.displayedName} Agility`);
		subCalc.mult(1, 1/PersonaCombatStats.DEFENSE_DIVISOR, `Defense Divisor`);
		return calc.add(0, subCalc, "Agility Modifier");
	}

	baseWpnAttackBonus() : Calculation {
		const calc = new Calculation(0, 2);
		const subCalc = new Calculation();
		subCalc.add(0, this.strength, `${this.persona.displayedName} Strength`);
		subCalc.add(0, this.agility, `${this.persona.displayedName} Agility`);
		subCalc.mult(1, 1/(PersonaCombatStats.DEFENSE_DIVISOR * 2), `Attack Divisor`);
		return calc.add(0, subCalc, "Strength/Agility Modifier");
	}

	baseMagAttackBonus(): Calculation {
		const calc = new Calculation(0, 2);
		const subCalc = new Calculation();
		subCalc.add(0, this.magic, `${this.persona.displayedName} Magic`);
		subCalc.add(0, this.agility, `${this.persona.displayedName} Agility`);
		subCalc.mult(1, 1/(PersonaCombatStats.DEFENSE_DIVISOR * 2), `Attack Divisor`);
		return calc.add(0, subCalc, "Magic Modifer") ;
	}

	baseAilmentAtkBonus(): Calculation {
		return this.ailmentBonus();
	}

	baseDeathAtkBonus() : Calculation {
		const calc = new Calculation(0, 2);
		calc.add(0, this.luck + 2, `${this.persona.displayedName} Luck + 2`);
		calc.mult(1, 1/PersonaCombatStats.INSTANT_DEATH_ATTACK_DIVISOR, `Instant Kill Attack Divisor`);
		return calc;
	}

	baseInit() : Calculation {
		const calc = new Calculation(0, 2);
		return calc
			.add(0, this.agility + 1, `${this.persona.displayedName} Agility + 1`)
			.mult(1, 1/PersonaCombatStats.INIT_DIVISOR, `Initiative Divisor`);
	}

	baseEnduranceDR() : number{
		return Math.floor(this.endurance);
	}

	lukCriticalResist() : Calculation {
		const calc = new Calculation(0, 2);
		return calc
			.add(0, this.luck + 0, `${this.persona.displayedName} Luck`)
			.mult(1, 1/PersonaCombatStats.CRITICAL_HIT_DIVISOR, `Critical Hit Divisor`);
	}

	lukCriticalBoost() : Calculation {
		const calc = new Calculation(0, 2);
		return calc
			.add(0, this.luck + 1, `${this.persona.displayedName} Luck + 1`)
			.mult(1, 1/PersonaCombatStats.CRITICAL_HIT_DIVISOR, `Critical Hit Divisor`);
	}

	instantDeathBonus() : Calculation {
		const calc = new Calculation(0, 2);
		calc.add(0, this.luck + 2, `${this.persona.displayedName} Luck + 2`);
		calc.mult(1, 1/PersonaCombatStats.INSTANT_DEATH_BONUS_DIVISOR, `Instant Kill Attack Divisor`);
		return calc;
	}

	instantDeathResist() : Calculation {
		const calc = new Calculation(0, 2);
		calc.add(0, this.luck + 3, `${this.persona.displayedName} Luck + 3`);
		calc.mult(1, 1/PersonaCombatStats.INSTANT_DEATH_RESIST_DIVISOR, `Instant Kill Defense Divisor`);
		return calc;
	}

	instantDeathDefense() : Calculation {
		const calc = new Calculation(PersonaCombatStats.BASE_INSTANT_DEATH_DEFENSE, 2);
		return calc.add(0, this.instantDeathResist(), "Instant DeathResist");
	}

	ailmentDefense(): Calculation {
		const calc = new Calculation(PersonaCombatStats.BASE_AILMENT_DEFENSE, 2);
		return calc.add(0, this.ailmentResist(), "Ailment Resist");
	}

	private ailmentResist(): Calculation {
		const calc = new Calculation(0, 2);
		calc.add(0, this.luck + 4, `${this.persona.displayedName} Luck + 3`);
		calc.mult(1, 1/PersonaCombatStats.AILMENT_RESIST_DIVISOR, `Ailment resist Divisor`);
		return calc;
	}

	private ailmentBonus(): Calculation {
		const calc = new Calculation(0, 2);
		calc.add(0, this.luck + 2, `${this.persona.displayedName} Luck + 4`);
		calc.mult(1, 1/PersonaCombatStats.AILMENT_RESIST_DIVISOR, `Ailment resist Divisor`);
		return calc;
	}

	getPhysicalVariance() : number {
		return 2 + Math.floor(this.strength / 5);
	}

	getMagicalVariance() : number {
		return 2 + Math.floor(this.magic / 5);
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
		const isCustomPersona = persona.isCustomPersona;
		const favored = [
			this.combatStats.preferred_stat,
			this.combatStats.preferred_stat2,
		];
		const tarotFavored = [
			persona?.tarot?.system?.preferred_stat ?? "",
		];
		const tarotDisfavored = [
			persona?.tarot?.system?.disfavored_stat ?? "",
		];
		const disfavored = [
			this.combatStats.disfavored_stat,
			this.combatStats.disfavored_stat2,
		];
		const stIncreases : StatGroup = {
			str: 0,
			mag: 0,
			end: 0,
			agi: 0,
			luk: 0
		};
		const stblk : StatGroup = {
			...this.combatStats.stats
		};
		let statsToBeChosen = pointsToSpend;
		while (statsToBeChosen > 0) {
			const slist = (Object.keys(stblk) as PersonaStatType[])
				.filter(( st) => PersonaCombatStats.canRaiseStat(st, stblk, isCustomPersona))
				.map( st => {
					let weight = 1;
					weight = favored.reduce( (acc, x)=> x == st ? acc * PersonaCombatStats.FAVORED_STAT_WEIGHT_INCREASE : acc, weight);
					weight = disfavored.reduce( (acc, x)=> x == st ? acc * PersonaCombatStats.DISFAVORED_STAT_WEIGHT_DECREASE : acc, weight);
					weight = tarotFavored.reduce( (acc, x)=> x == st ? acc * PersonaCombatStats.FAVORED_TAROT_STAT_WEIGHT_INCREASE : acc, weight);
					weight = tarotDisfavored.reduce( (acc, x)=> x == st ? acc * PersonaCombatStats.DISFAVORED_TAROT_STAT_WEIGHT_DECREASE : acc, weight);
					return {
						weight,
						item: st
					};
				});
			try {
				const seed = this._advancementSeed();
				const totalStatPoints = Object.values(stblk).reduce ((acc, x) => acc + x, 0);
				const rng = new SeededRandom(seed + String(totalStatPoints));
				if (slist.length == 0) {
					throw new PersonaError(`All stats unselectable for ${persona.source.name}`);
				}
				const stat = rng.weightedChoice(slist);
				if (stat) {
					stblk[stat] += 1;
					stIncreases[stat] += 1;
					statsToBeChosen -= 1;
				}
			} catch (e) {
				if (e instanceof Error) {
					PersonaError.softFail(e.message, e.stack);
					return stIncreases;
				}
			}
		}
		return stIncreases;
	}

	private _advancementSeed() : string {
		const sourceName = this.persona.source.name;
		const tarotName = this.persona.tarot?.name;
		if (!tarotName) {
			throw new PersonaError(`No Tarot Card for ${this.persona.source.name}`);
		}
		return `${sourceName}${tarotName}`;
	}

	canRaiseStat(st: PersonaStatType, statBlock: StatGroup = this.combatStats.stats) : boolean {
		return statBlock[st] < PersonaCombatStats.maxStatAmount(statBlock, this.persona.isCustomPersona);
	}

	static canRaiseStat(st: PersonaStatType, statBlock: StatGroup, isCustomPersona: boolean) : boolean {
		return statBlock[st] < PersonaCombatStats.maxStatAmount(statBlock, isCustomPersona);
	}

	static canLowerStat(st: PersonaStatType, statBlock: StatGroup, isCustomPersona: boolean) : boolean {
		return statBlock[st] > PersonaCombatStats.minStatAmount(statBlock, isCustomPersona);
	}

	static maxStatGap(statBlock: StatGroup, isCustomPersona: boolean): number {
		const totalPoints = Object.values(statBlock).reduce ( (a, x) => a+x, 0);
		const statGapDivisor = isCustomPersona ? this.MAX_STAT_DIVISOR_CUSTOM : this.MAX_STAT_DIVISOR_WILD;
		const MaxStatGap = Math.max(this.MINIMUM_MAX_STAT_GAP, Math.floor(totalPoints / statGapDivisor)) ;
		return MaxStatGap;
	}

	static minStatAmount(statBlock: StatGroup, isCustomPersona: boolean) : number {
		const maxStatGap = this.maxStatGap(statBlock, isCustomPersona);
		const maxStat = Object.values(statBlock).reduce ( (a, x) => Math.max(a, x));
		return Math.max(this.MIN_STAT_VAL, maxStat - maxStatGap);
	}

	static maxStatAmount(statBlock: StatGroup, isCustomPersona: boolean): number {
		const maxStatGap = this.maxStatGap(statBlock, isCustomPersona);
		const minStat = Object.values(statBlock).reduce ( (a, x) => Math.min(a, x));
		return Math.min(this.MAX_STAT_VAL, minStat + maxStatGap);
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
