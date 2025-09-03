export class GrowthCalculator {
  totalTable = new Map<number, number>;
  growthTable = new Map<number, number>;

	 _growthAcceleration: number;
	 _initial: number;
	 _growthRate : number;
	 _initialGrowth : number;

	 constructor (growth_rate: number, initial: number, initialGrowth: number, growthAcceleration : number = 0) {
			this._growthRate = growth_rate;
			this._initial = initial;
			this._initialGrowth = initialGrowth;
			this._growthAcceleration = growthAcceleration;
			this.resetCache();
	 }

  valueAt(lvl: number) {
    return Math.round(this.#valueAt(lvl));

  }

  resetCache(): void {
    const initial = this._initial;
    this.totalTable = new Map();
    this.growthTable = new Map();
    this.totalTable.set(1, initial);
    this.totalTable.set(0, initial);
    this.growthTable.set(0, this._initialGrowth);
    this.growthTable.set(1, this._initialGrowth);
  }

  #valueAt	(lvl: number) : number {
    lvl = Math.floor(lvl); //ensure whole numbers
    if (Number.isNaN(lvl)) {
      throw new Error("NaN level can't compute");
    }
    if (lvl < 0)
    {throw new Error("Can't calc negative values");}
    if (this.totalTable.has(lvl)) {
      return this.totalTable.get(lvl)!;
    }
    const valAtLastLevel = this.#valueAt(lvl-1);
    const ValAtNewLevel = valAtLastLevel + this.#growthAt(lvl);
    this.totalTable.set(lvl, ValAtNewLevel);
    return ValAtNewLevel;
  }

  #growthAt (lvl: number) : number {
    const val = this.growthTable.get(lvl);
    if (val) {return val;}
    const GrowthAtLastLevel = this.#growthAt(lvl - 1);
    const XPNeeded = this.growthRate(lvl) * GrowthAtLastLevel;
    this.growthTable.set(lvl, XPNeeded);
    return XPNeeded;
  }

	 growthRate(lvl: number) : number {
			return this._growthRate + (lvl * this._growthAcceleration);
	 }

  printMilestones(xp_growth ?: number, initialGrowth ?: number) {
    if (xp_growth) {
      this._growthRate = xp_growth;
      this.resetCache();
    }
    if (initialGrowth) {
      this._initialGrowth = initialGrowth;
      this.resetCache();
    }
    for (let lvl = 1; lvl <= 105; lvl+=10) {
      const XPNeeded = this.valueAt(lvl);
      console.log(` ${lvl} : ${XPNeeded}`);
    }
  }

}
