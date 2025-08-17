import { PC } from "../module/actor/persona-actor";
import { NPCAlly } from "../module/actor/persona-actor";

export class LevelUpCalculator {
	static levelsGained(actor: PC | NPCAlly, newXPValue: number) : number {
		const currLevel = actor.personalELevel;
		const eLevel = this.getEffectiveLevel(newXPValue);
		const levelsGained = Math.max(0, eLevel - currLevel);
		return levelsGained;
	}

	static getEffectiveLevel(xpTotal: number) : number {
		for (let EL= 0; EL <= 100; EL += 1) {
			if (xpTotal < this.minXPForEffectiveLevel(EL))
				return EL-1;
		}
		return 100;
	}

	static XPForNextLevel(actor: PC | NPCAlly): number {
		const currLvl = actor.personalELevel;
		const xpForCurrent = this.minXPForEffectiveLevel(currLvl);
		const xpForNext = this.minXPForEffectiveLevel(currLvl+1);
		return xpForNext - xpForCurrent;
	}

	static XPTable : Map<number, number> = new Map();
	//** uses 1-100 scale
	static minXPForEffectiveLevel( eLevel: number) : number {
		if (this.XPTable.has(eLevel)) {
			return this.XPTable.get(eLevel)!;
		}
		if (eLevel <= 1)
			return 100;
		let xp = (eLevel == 1) ? 100 : ( 1.1 * this.minXPForEffectiveLevel(eLevel-1));
		xp = Math.round(xp);
		this.XPTable.set(eLevel, xp);
		return xp;
	}
	static async converterFromOldSystem( actor: PC | NPCAlly): Promise<void> {
		if (actor.system.personaleLevel != 0) return;
		const baseLvl = actor.system.combat.classData.level;
	}

}

