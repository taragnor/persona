import { PC } from "../module/actor/persona-actor.js";
import { NPCAlly } from "../module/actor/persona-actor.js";


export class LevelUpCalculator {
	static LEVEL_GROWTH_RATE = 1.125;
	static SHADOWS_TO_KILL_TO_LEVEL = 10;

	static XPTable : Map<number, number> = new Map();
	static XPToAdvanceTable: Map<number, number> = new Map();
	static XP_FOR_LEVEL_1 = 50;

	static levelsGained(actor: PC, newXPValue: number) : number {
		const currLevel = actor.personalELevel;
		const eLevel = this.getEffectiveLevel(newXPValue);
		const levelsGained = Math.max(0, eLevel - currLevel);
		return levelsGained;
	}

	static getEffectiveLevel(xpTotal: number) : number {
		for (let EL= 0; EL <= 100; EL += 1) {
			if (xpTotal < this.minXPForEffectiveLevel(EL))
				{return EL-1;}
		}
		return 100;
	}

	//** uses 1-100 scale
	static minXPForEffectiveLevel( eLevel: number) : number {
		eLevel = Math.floor(eLevel);
		if (Number.isNaN(eLevel)) {
			throw new Error("NaN level can't compute XP");
		}
		if (this.XPTable.has(eLevel)) {
			return this.XPTable.get(eLevel)!;
		}
		// console.log(`Computing XP for level ${eLevel}`);
		if (eLevel <= 1) {
			if (eLevel < 1) {
				this.XPTable.set(eLevel, 0);
				return 0;
			}
			this.XPTable.set(eLevel, this.XP_FOR_LEVEL_1);
			return this.XP_FOR_LEVEL_1;
		}
		const XPReqForLastLevel = this.minXPForEffectiveLevel(eLevel-1);
		const XPReqForNewLevel = XPReqForLastLevel + this.XPRequiredToAdvanceToLevel(eLevel);
		const xp = Math.round(XPReqForNewLevel);
		this.XPTable.set(eLevel, xp);
		return xp;
	}

	static XPRequiredToAdvanceToLevel(eLevel: number) : number {
		const val = this.XPToAdvanceTable.get(eLevel);
		if (val)
			{return val;}
		if (eLevel <= 1) {
			if (eLevel < 1) {
				this.XPToAdvanceTable.set(eLevel, 0);
				return 0;
			}
			this.XPToAdvanceTable.set(eLevel, this.XP_FOR_LEVEL_1);
			return this.XP_FOR_LEVEL_1;
		}
		const XPRequiredForLastLevel = this.XPRequiredToAdvanceToLevel(eLevel - 1);
		let XPNeeded = this.LEVEL_GROWTH_RATE * XPRequiredForLastLevel;
		XPNeeded = Math.round(XPNeeded);
		this.XPToAdvanceTable.set(eLevel, XPNeeded);
		return XPNeeded;
	}

	//static async converterFromOldSystem( actor: PC | NPCAlly): Promise<void> {
	//	if (actor.system.personaleLevel != 0) return;
	//	//TODO: finish this
	//	const eLevel = this.getElevelOfOldSystem(actor);
	//}

	static getElevelOfOldSystem(actor : PC | NPCAlly) : number {
		const baseLvl = actor.system.combat.classData.level;
		const incrementals = actor.numOfIncAdvances();
		const maxIncrementals = actor.maxIncrementalAdvances();
		const effectiveAdds = Math.round((incrementals / maxIncrementals) * 10) / 10;
		const effectiveLevel =  effectiveAdds + baseLvl;
		return effectiveLevel;

	}

	static shadowXPValue(shadowELevel: number) : number {
		const XPValue = this.XPRequiredToAdvanceToLevel(shadowELevel + 1 ) / this.SHADOWS_TO_KILL_TO_LEVEL;
		return Math.round(XPValue);

	}


	static resetCache(): void {
		this.XPTable = new Map();
		this.XPToAdvanceTable = new Map();

	}

	static printMilestones(xp_growth ?: number) {
		if (xp_growth) {
			this.LEVEL_GROWTH_RATE = xp_growth;
			this.resetCache();
		}
		for (let lvl = 1; lvl < 100; lvl+=10) {
			const XPNeeded = this.XPRequiredToAdvanceToLevel(lvl);
			console.log(` ${lvl} : ${XPNeeded}`);
		}

	}

}

//@ts-expect-error adding to global scope
window.LevelUpCalculator = LevelUpCalculator;

