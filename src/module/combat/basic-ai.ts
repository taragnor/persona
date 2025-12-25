import {PersonaDB} from "../persona-db.js";
import {AttackResult} from "./combat-result.js";
import {AIAction, PersonaAI} from "./persona-ai.js";

export class BasicAI extends PersonaAI {

   override recordCombatResult(atkResult: AttackResult): void {
   }

	get engaged() : boolean {
      const tokenAcc = PersonaDB.getUniversalTokenAccessor(this.token);
      return this.combat.isEngagedByAnyFoe(tokenAcc);
	}

	highestCostUsableActions(actions: AIAction[]) :  AIAction[] {
		const maxEnergyCost = actions
			.map (action => action.power)
			.reduce ( (acc, pwr) => Math.max(acc, pwr.energyCost(this.persona)),  -5);
		return actions.filter (  act => act.power.energyCost(this.persona) >= maxEnergyCost -2);
	}


	noChargeAction(actionList: AIAction[]) : N<AIAction> {
		const trappedInEngagement = this.engaged && !this.sitData.canEscapeEngaged;
		const highCost = this.highestCostUsableActions(actionList);
		const situationIsDire = (this.persona.user.hp / this.persona.user.mhp) < 0.5;
		if (trappedInEngagement) {
			const highCostUseful = this.usefulActionsWhileEngaged(highCost);
			if (highCostUseful.length > 0) {
				return this.makeFinalChoice(highCostUseful);
			}
			const generalUsefuLEngagedActions = this.usefulActionsWhileEngaged(actionList);
			if (generalUsefuLEngagedActions.length > 0) {
				return this.makeFinalChoice(generalUsefuLEngagedActions);
			}
		}
		if (!trappedInEngagement || !situationIsDire) {
			if (highCost.length > 0) {
				return this.makeFinalChoice(highCost);
			}
			return this.makeFinalChoice(actionList);
		}
		return null;
	}

	override getAction(): AIAction | null {
		const usableActions = this.getPossibleMainActions();
		const chargeAblePowers = this.powersRequiringCharge();
		if (usableActions.length == 0) {return null;}
		if (chargeAblePowers.length == 0)  {
			const action = 	this.noChargeAction(usableActions);
			if (action) {return action;}
		}
		return null;
	}




}

