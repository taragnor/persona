import { AttackResult } from "./combat-result.js";
import { PersonaCombatant, PToken } from "./persona-combat.js";
import { PersonaCombat } from "./persona-combat.js";
import {Persona} from "../persona-class.js";
import {PersonaError} from "../persona-error.js";
import {randomSelect} from "../utility/array-tools.js";

export abstract class PersonaAI {
   persona: Persona;
   token: PToken;
   combatant: PersonaCombatant;
   combat: PersonaCombat;
	sitData: AISituationData;

   constuctor(combatant: PersonaCombatant, combat: PersonaCombat) {
      if (!combatant.actor) {
         throw new Error("Persona AI requires a combatnat with a token");
      }
      this.combatant = combatant;
      this.persona = combatant.actor.persona();
      this.token = combatant.token as PToken;
      this.combat= combat;
   }

   abstract recordCombatResult(atkResult : AttackResult) : void;
   abstract getAction(Data: AISituationData ) : AIAction | null;

	getPossibleMainActions() : AIAction[] {
		const powers =  this.getPossiblePowers();
		const actions : AIAction[] = [];
		for (const power of powers) {
			const targetSets= this.calculatePotentialTargetsOfPower(power);
			for (const targets of targetSets) {
				actions.push( {
					targets,
					power,
				});
			}
	}
		return actions.filter(action => !this.isUselessAction(action));
	}

	getPossiblePowers() : Power[] {
		const {persona} = this;
      const powers = this.persona.powers.concat(this.persona.basicPowers);
      const usablePowers = powers
			.filter( pwr => persona.canUsePower(pwr));
		return usablePowers;

	}

	powersRequiringCharge() : Power[] {
		const {persona} = this;
      const powers = this.persona.powers.concat(this.persona.basicPowers);
      const chargeAblePowers = powers.filter (pwr => pwr.energyRequired(persona) > persona.user.energy);
		return chargeAblePowers;
	}

	usefulActionsWhileEngaged( actionList: AIAction[]): AIAction[] {
		return actionList.filter( action => {
			if (this.powerSuffersEngagementPenalty(action.power, action.targets)) {return false;}
			return true;
		});
	}

	makeFinalChoice( actionList: AIAction[]) : AIAction {
		return randomSelect(actionList);
	}

	powerSuffersEngagementPenalty (pwr: Power, targets: PersonaCombatant[]) {
		if (pwr.getDamageType(this.persona) == "healing") {
			return false;
		}
		const engagedFoes = this.combat.getAllEngagedEnemies(this.combatant);
		if (pwr.system.targets == "1-random-enemy") {return false;}
		for (const target of targets) {
			if (!engagedFoes.includes(target)) {return true;}
		}
		return false;
	}

	get livingFoes() : PersonaCombatant[]{
		return this.combat.getLivingFoes(this.combatant);
	}

	get alliesAndSelf() : PersonaCombatant[] {
		return this.combat.getAllies(this.combatant, true);
	}

	calculatePotentialTargetsOfPower(pwr: Power) : PersonaCombatant[][] {
		switch (pwr.system.targets) {
			case "all-enemies":
				return [this.livingFoes];
			case "1-engaged":
			case "self":
				return [[this.combatant]];
			case "1-nearby":
			case "1-random-enemy":
				if (this.isHarmfulPower(pwr)) {
					return this.livingFoes.map( foe=> [foe]);
				}
				return this.alliesAndSelf.map(ally => [ally]);
			case "all-allies":
				return [this.alliesAndSelf];
			case "all-others":
				return [
					[...this.alliesAndSelf,
						...this.livingFoes
					].filter (c=> c != this.combatant)
				];
			case "everyone":
				return [
					[...this.alliesAndSelf,
						...this.livingFoes
					]
				];
			default:
				break;
		}
		PersonaError.softFail(`Targetting mode ${pwr.system.targets} is not supported by AI`);
		return [];
	}

	isHarmfulPower(pwr: Power) : boolean {
		switch (pwr.system.targets) {
			case "all-enemies":
			case "1-random-enemy":
			case "all-others":
			case "everyone":
				return true;
			case "all-allies":
			case "self":
			case "all-dead-allies":
				return false;
			default:
				break;
		}
		const damageType = pwr.getDamageType(this.persona);
		if (damageType == "healing") {
			return false;
		}
		if (pwr.hasTag("resurrection")) { return false;}
		if (damageType != "none") {
			return true;
		}
		if (pwr.hasTag("buff")) {return false;}
		if (pwr.hasTag("debuff")) {return true;}
		if (pwr.hasTag("ailment")) {return true;}
		if (pwr.hasTag("instantKill")) {return true;}
		if (pwr.hasTag("status-removal")) {return false;}
		return true;
	}

	isUselessAction(action: AIAction) : boolean {
		const {power, targets} = action;
		//check for things like healiong already full health or applying statuses to those that already have them
		return false;
	}

}

export class NullAI extends PersonaAI {
   override recordCombatResult(_atkResult: AttackResult): void {
   }

   override getAction(): AIAction  | null{
      return null;
   }

}


export type AIAction = {
   power: Power,
   targets: PersonaCombatant[],

}

type AISituationData = {
	canEscapeEngaged?: boolean;
};
