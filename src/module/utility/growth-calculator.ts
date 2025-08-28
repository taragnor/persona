export class GrowthCalculator {
	totalTable = new Map<number, number>;
	growthTable = new Map<number, number>;

	initial: number;
	growthRate : number;
	initialGrowth : number;

	constructor (growth_rate: number, initial: number, initialGrowth: number) {
		this.growthRate = growth_rate;
		this.initial = initial;
		this.initialGrowth = initialGrowth;
		this.resetCache();
	}

	valueAt(lvl: number) {
		return Math.round(this.#valueAt(lvl));

	}

	resetCache(): void {
		const initial = this.initial;
		this.totalTable = new Map();
		this.growthTable = new Map();
		this.totalTable.set(1, initial);
		this.totalTable.set(0, initial);
		this.growthTable.set(0, this.initialGrowth);
		this.growthTable.set(1, this.initialGrowth);
	}

	#valueAt	(lvl: number) : number {
		lvl = Math.floor(lvl); //ensure whole numbers
		if (Number.isNaN(lvl)) {
			throw new Error("NaN level can't compute");
		}
		if (lvl < 0)
			throw new Error("Can't calc negative values");
		if (this.totalTable.has(lvl)) {
			return this.totalTable.get(lvl)!;
		}
		const XPReqForLastLevel = this.#valueAt(lvl-1);
		const XPReqForNewLevel = XPReqForLastLevel + this.#growthAt(lvl);
		this.totalTable.set(lvl, XPReqForNewLevel);
		return XPReqForNewLevel
	}

	#growthAt (lvl: number) : number {
		const val = this.growthTable.get(lvl);
		if (val)
			return val;
		const XPRequiredForLastLevel = this.#growthAt(lvl - 1);
		let XPNeeded = this.growthRate * XPRequiredForLastLevel;
		this.growthTable.set(lvl, XPNeeded);
		return XPNeeded;


	}

	printMilestones(xp_growth ?: number, initialGrowth ?: number) {
		if (xp_growth) {
			this.growthRate = xp_growth;
			this.resetCache();
		}
		if (initialGrowth) {
			this.initialGrowth = initialGrowth;
			this.resetCache();
		}
		for (let lvl = 1; lvl <= 105; lvl+=10) {
			const XPNeeded = this.valueAt(lvl);
			console.log(` ${lvl} : ${XPNeeded}`);
		}
	}

}
