import { PToken } from "./persona-combat";
import { PersonaCombat } from "./persona-combat";

export class EngagementChecker {
	static isEngaged(subject: PToken, combat: PersonaCombat): boolean {
		const myAllegiance = subject.actor.getAllegiance();
		const engageArray = Array.from(this.getEngagedList(subject, combat));
		const output = engageArray. map ( x=> `${x.name}: ${x.actor.getAllegiance()} ${x.actor.isCapableOfAction()}` );
		return engageArray.some( tok =>
			tok.actor.getAllegiance() != myAllegiance && tok.actor.isCapableOfAction()
		)
	}

	static isEngagedWith(subject: PToken, target: PToken, combat: PersonaCombat) : boolean {
		return this.getEngagedList(subject, combat).has(target);
	}

	static getEngagedList(subject: PToken, combat: PersonaCombat) : Set<PToken> {
		const engagedList : Set<PToken>= new Set();
		const checkList = [subject];
		while (checkList.length > 0) {
			const checkedToken = checkList.pop()!;
			for (const comb of combat.combatants.contents) {
				if (!comb.token) continue;
				const token  = comb.token._object as PToken;
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

	static isWithinEngagedRange(subject: PToken, target:PToken) {
		const mapUnits = subject.scene.dimensions.distance;
		return canvas.grid.measureDistance(subject, target, {gridSpaces:true}) <= mapUnits;

	}

}

