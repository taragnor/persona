import { PToken } from "./persona-combat";
import { PersonaCombat } from "./persona-combat";

export class EngagementChecker {
	// static isEngaged(subject: PToken, combat: PersonaCombat): boolean {
	// 	const myAllegiance = subject.actor!.getAllegiance();
	// 	const engageArray = Array.from(this.getEngagedList(subject, combat));
	// 	// const output = engageArray. map ( x=> `${x.name}: ${x.actor!.getAllegiance()} ${x.actor!.isCapableOfAction()}` );
	// 	return engageArray.some( tok =>
	// 		tok.actor!.getAllegiance() != myAllegiance && tok.actor!.isCapableOfAction()
	// 	)
	// }

	// static isEngagedWith(subject: PToken, target: PToken, combat: PersonaCombat) : boolean {
	// 	if (subject == target) return true;
	// 	return this.getEngagedList(subject, combat).has(target);
	// }

	static isEngagedByAnyFoe(subject: PToken, combat: PersonaCombat) : boolean {
		return this.getAllEngagedEnemies(subject, combat).length > 0;
	}

	static isEngaging(subject: PToken, target: PToken, combat: PersonaCombat) : boolean {
		if (subject == target) return false;
		if (!subject.actor.canEngage()) return false;
		const inMelee = this.getTokensInMelee(subject, combat);
		return inMelee.has(target);
	}

	static isEngagedBy(subject: PToken, target: PToken, combat: PersonaCombat) : boolean {
		return this.isEngaging(target, subject, combat);
	}

	static getAllEngagedEnemies(subject: PToken, combat: PersonaCombat) : PToken[] {
		const myAllegiance = subject.actor!.getAllegiance();
		const meleeList = Array.from(this.getTokensInMelee(subject, combat));
		return meleeList.filter( tok =>
			tok.actor.getAllegiance() != myAllegiance
			&& tok.actor.canEngage() == true
		);
	}

	static getTokensInMelee(subject: PToken, combat: PersonaCombat) : Set<PToken> {
		const engagedList : Set<PToken>= new Set();
		const checkList = [subject];
		while (checkList.length > 0) {
			const checkedToken = checkList.pop()!;
			for (const comb of combat.combatants.contents) {
				if (!comb.token) continue;
				const token  = comb.token as PToken;
				if ( this.isWithinEngagedRange(checkedToken, token)
					&& !engagedList.has(token)
				) {

					if (token != subject)  {
						engagedList.add(token);
						checkList.push(token);
					}
				}
			}
		}
		return engagedList;
	}

	static isWithinEngagedRange(subject: PToken, target:PToken) : boolean {
		const mapUnits = subject.parent.dimensions.distance;
		if (canvas?.grid?.measurePath) {
			//V12
			return canvas.grid.measurePath([subject, target]).distance <= mapUnits;
		}
		return canvas.grid.measureDistance(subject, target, {gridSpaces:true}) <= mapUnits;
	}

}

