import { PToken } from "./persona-combat.js";
import { PersonaCombat } from "./persona-combat.js";
import { PersonaCombatant } from "./persona-combat.js";

export class EngagementChecker {


	static isEngagedByAnyFoe(subject: PersonaCombatant, combat: PersonaCombat) : boolean {
		return this.getAllEngagedEnemies(subject, combat).length > 0;
	}

	static isEngaging(subject: PersonaCombatant, target: PersonaCombatant, combat: PersonaCombat) : boolean {
		if (subject == target) {return false;}
		if (!subject.actor || !subject.actor.isAlive()) {return false;}
		if (!target.actor || !target.actor.isAlive()) {return false;}
		if (!target.actor  || target.actor.hasStatus("charmed")) {return false;}
		if (!subject.actor || !subject.actor.canEngage()) {return false;}
		const inMelee = this.listOfCombatantsInMelee(subject, combat);
		return inMelee.includes(target);
	}

	static isEngagedBy(subject: PersonaCombatant, target: PersonaCombatant, combat: PersonaCombat) : boolean {
		return this.isEngaging(target, subject, combat);
	}

	static getAllEngagedEnemies(subject: PersonaCombatant, combat: PersonaCombat) : PersonaCombatant[] {
		const meleeList = this.listOfCombatantsInMelee(subject, combat);
		return meleeList.filter( tok =>
			!PersonaCombat.isSameTeam(tok, subject)
			&& tok.actor?.canEngage() == true
		);
	}

	static listOfCombatantsInMelee(subject: PersonaCombatant, combat: PersonaCombat) : PersonaCombatant[] {
		const engagedList : Set<typeof subject>= new Set();
		const checkList = [subject];
		while (checkList.length > 0) {
			const checkedToken = checkList.pop()!;
			for (const comb of combat.validEngagementCombatants) {
				if (!comb.token.actor?.isAlive()) {continue;}
				const token  = comb.token as PToken;
				if ( this.isWithinEngagedRange(checkedToken.token as PToken, token)
					&& !engagedList.has(comb)
				) {
					if (comb != subject)  {
						engagedList.add(comb);
						checkList.push(comb);
					}
				}
			}
		}
		return Array.from(engagedList);
	}

	static isWithinEngagedRange(subject: PToken, target:PToken) : boolean {
		const mapUnits = subject.parent.dimensions.distance;
		return canvas.grid.measurePath([subject, target]).distance <= mapUnits;
	}

}

