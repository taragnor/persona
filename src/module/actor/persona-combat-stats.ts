import { PersonaError } from "../persona-error.js";
import { SeededRandom } from "../utility/seededRandom.js";
import { Persona } from "../persona-class.js";
import {PersonaStat} from "../../config/persona-stats.js";
import {Calculation} from "../utility/calculation.js";
import {HTMLTools} from "../utility/HTMLTools.js";

export class PersonaCombatStats {

  persona : Persona;
  static PERCENT_PADDING = 10 as const; //padding onto stats when determining percentage difference;
  static STAT_POINTS_PER_LEVEL = 3 as const;
  static INIT_DIVISOR = 3 as const;
  static MINIMUM_MAX_STAT_GAP = 10 as const;
  static MAX_STAT_VAL = 99 as const;
  static MIN_STAT_VAL = 1 as const;
  static MAX_STAT_DIVISOR_WILD = 5.5 as const;
  static MAX_STAT_DIVISOR_CUSTOM = 8 as const;

  static STAT_DEVIATION = {
    "very-low": 0.15,
    "low": 0.333,
    "medium": 0.666,
    "high" : 1.2,
    "very-high": 1.6,
  } as const;

  constructor (persona: Persona) {
    this.persona = persona;
  }

  get combatStats() {
    return this.persona.source.system.combat.personaStats;
  }

  mhpCalculation() {
    const user = this.persona.user;
    const sit ={user: user.accessor};
    try {
      if (user.system == undefined) {return new Calculation().eval();}
      const lvlbase = user.baseClassHP;
      const calc = new Calculation(lvlbase);
      const persona = this.persona;
      const nonMultbonuses = persona.getBonusesIgnoreAuras("maxhp");
      const newForm = persona.getBonusesIgnoreAuras("maxhpMult-new");
      const hpAdjustPercent = user.hpAdjustPercent();
      const hpAdjust = user.system.hp_adjust;
      calc.mult(0, hpAdjustPercent,`HP Adjust (${hpAdjust})`);
      const multmods = persona.getBonusesIgnoreAuras("maxhpMult");
      if (user.isPC() || user.isNPCAlly()) {
        const ArmorHPBoost = user.equippedItems().find(x=> x.isOutfit())?.armorHPBoost ?? 0;
        if (ArmorHPBoost > 0)
        {
          calc.add(0, ArmorHPBoost, "Armor HP Bonus");
        }
      }
      calc.add(0, user.system.combat.bonusHP ?? 0, "Permanent Bonus HP");
      calc.mult(0, newForm, "Mod List");
      calc.mult(0, multmods, "Old Form Mods", true);
      calc.add(0, nonMultbonuses, "Adds");
      const mhp = calc.eval(sit);
      // console.log(`MHP: ${mhp.total}`);
      return mhp;
    }	 catch(e) {
      PersonaError.softFail(`Error in calculating ${user.name} MHP`, e);
    }
    const mhp = new Calculation().eval(sit);
    return mhp;
  }

  mmpCalculation() {
    const user = this.persona.user;
    if (user.isShadow()) {return new Calculation().eval();}
    try {
      const lvlmaxMP = user.class.getClassMMP(user.level);
      const x = new Calculation(lvlmaxMP);
      const persona = this.persona;
      const sit ={user: user.accessor};
      const mpAdjustPercent = user.mpAdjustPercent();
      const mpAdjust = user.system.mp_adjust;
      const bonuses = persona.getBonusesIgnoreAuras("maxmp");
      const maxMult = persona.getBonusesIgnoreAuras("maxmpMult");
      const nonMultMPBonus = user.system.combat.bonusMP ?? 0;
      x.mult(0, mpAdjustPercent, `MP adjust (${mpAdjust})`);
      x.add(0, bonuses, "additive bonuses");
      x.mult(0, maxMult, "Multiplier Bonuses" , true);
      x.add(0, nonMultMPBonus, "Permanent Bonus MP");
      return x.eval(sit);

    } catch {
      return new Calculation().eval();
    }

  }

  getStatValue(stat: PersonaStat) : number {
    const permaBonus = this.combatStats.permanentStatsBonuses[stat];
    const situation = {
      user: this.persona.user.accessor,
    };
    const modBonuses = this.persona
      .getBonusesIgnoreAuras(stat)
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

  baseInit() : Calculation {
    const calc = new Calculation(0, 2);
    return calc
      .add(0, this.agility + 1, `${this.persona.displayedName} Agility + 1`)
      .mult(1, 1/PersonaCombatStats.INIT_DIVISOR, `Initiative Divisor`);
  }

  baseEnduranceDR() : number{
    return Math.floor(this.endurance);
  }

  getPhysicalVariance() : number {
    return 2 + Math.floor(this.strength / 5);
  }

  getMagicalVariance() : number {
    return 2 + Math.floor(this.magic / 5);
  }

  unspentStatPoints() : number {
    const total = Object.values(this.combatStats.stats).reduce( (a,x) => a+x, 0);
    const expected_total = this.totalStatPoints();
    return expected_total - total;
  }

  private statPointsPerLevel() : number {
    return PersonaCombatStats.STAT_POINTS_PER_LEVEL;
  }

  private baseStatPoints() : number {
    const persona = this.persona;
    // if (persona.isCustomPersona || persona.source.isNPCAlly()) {
    if (persona.isCustomPersona) {
      return 5;
    }
    const sl = persona.startingLevel;
    switch (true) {
      case (sl < 20) :return 2;
      case (sl < 40): return 5;
      case (sl < 60): return 8;
      case (sl < 80): return 12;
      default: return 16;
    }
  }

  private totalStatPoints() : number {
    const expected_total = this.persona.level * this.statPointsPerLevel() + this.baseStatPoints();
    return Math.max(5, Math.round(expected_total));

  }

  private statDeviation() : number {
    return PersonaCombatStats.STAT_DEVIATION[this.combatStats.statDeviation ?? "medium"];
  }

  private adjustedStatDeviation(totalPts: number) : number {
    const lvl = Math.floor(totalPts / PersonaCombatStats.STAT_POINTS_PER_LEVEL);
    return 1 + (this.statDeviation() * this._adjustment(lvl));
  }

  private _adjustment(lvl: number) : number {
    if (lvl <= 20) {return 1.5;}
    if (lvl <= 50) {return 1;}
    if (lvl <= 80) {return 0.80;}
    return 0.5;
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
      const totalStatPoints = Object.values(stblk).reduce ((acc, x) => acc + x, 0);
      const slist = (Object.keys(stblk) as PersonaStatType[])
        .filter(( st) => PersonaCombatStats.canRaiseStat(st, stblk, isCustomPersona))
        .map( st => {
          let weight = 1;
          const statDeviation = this.adjustedStatDeviation(totalStatPoints);
          weight = favored.reduce( (acc, x)=> x == st ? acc * statDeviation: acc, weight);
          weight = disfavored.reduce( (acc, x)=> x == st ? acc / statDeviation : acc, weight);
          weight = tarotFavored.reduce( (acc, x)=> x == st ? acc * statDeviation : acc, weight);
          weight = tarotDisfavored.reduce( (acc, x)=> x == st ? acc / statDeviation: acc, weight);
          return {
            weight,
            item: st
          };
        });
      try {
        const seed = this._advancementSeed();
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

  /** returns the percentage of how much bigger one stat is than the other, returning negative if the defenseStat is larger.*/
  static statComparison(attackStat: number, defenseStat: number) : number {
    const PERCENT_PADDING = this.PERCENT_PADDING;
    if (defenseStat > attackStat) {return -this.statComparison(defenseStat, attackStat);}
    return (attackStat + PERCENT_PADDING)  / (defenseStat + PERCENT_PADDING);
  }
}

export type StatGroup = Record<PersonaStatType, number>;

type PersonaStatType = keyof ValidAttackers["system"]["combat"]["personaStats"]["stats"];

export const STAT_DEVIATION_LOCTABLE = HTMLTools.createLocalizationObject( Object.keys(PersonaCombatStats.STAT_DEVIATION), "persona.persona.combatStats.deviation") as Record<keyof typeof PersonaCombatStats.STAT_DEVIATION, LocalizationString>;
