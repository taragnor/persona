import { PersonaActor } from "../actor/persona-actor.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {randomSelect} from "../utility/array-tools.js";
import {PersonaCombat, PToken} from "./persona-combat.js";

export class PersonaTargetting {

  static targettedPTokens(): PToken[] {
    return Array.from(game.user.targets)
      .map(x=> x.document)
      .filter(x=> x.actor != undefined && x.actor instanceof PersonaActor && x.actor.isValidCombatant()) as PToken[];
  }

  static challengeFilter(attacker:PToken, target: PToken) : boolean{
    const combat= PersonaCombat.combat;
    const targetActor = target.actor;
    if (!combat) {return true;}
    const attackerActor = attacker.actor;
    const engagingTarget  = combat.isInMeleeWith(attacker, target) ?? false;
    if (attacker.id == target.id) {return true;}
    if (attackerActor.hasStatus('challenged') && !engagingTarget) {
      return false;
      // throw new TargettingError("Can't target non-engaged when challenged");
    }
    if (targetActor.hasStatus('challenged') && !engagingTarget) {
      return false;
      // throw new TargettingError("Can't target a challenged target you're not engaged with");
    }
    return true;
  }

	static getTargets(attacker: PToken, power: UsableAndCard, altTargets?: PToken[]): PToken[] {
    const baseTargets = altTargets != undefined ? altTargets : this.getDefaultPowerTargets(attacker.actor, power);
		// const selected = altTargets != undefined
		// 	? altTargets
		// 	: this.targettedPTokens();
    const filteredTargets = baseTargets
    .filter( target => {
			const situation : Situation = {
				user: attacker.actor.accessor,
				attacker: attacker.actor.accessor,
				target: target.actor.accessor,
				usedPower: power.accessor,
				activeCombat: !!PersonaCombat.combat,
			};
      return power.targetMeetsConditions(attacker.actor, target.actor, situation);
    });

    if (filteredTargets.length == 0) {
      throw new TargettingError("No valid targets");
    }

    const challengeFilter = filteredTargets
    .filter( target => this.challengeFilter(attacker, target));
    if (challengeFilter.length == 0) {
      throw new TargettingError("No valid targets");
    }
    return challengeFilter;

  }

  static getDefaultPowerTargets(attacker: ValidAttackers, power: UsableAndCard): PToken[] {
    const targets = power.isSkillCard() ? "self" : power.system.targets;
    const attackerType = attacker.getAllegiance();
    const selected = this.targettedPTokens();
    switch (targets) {
      case '1-random-enemy': {
        const list = PersonaCombat.getAllEnemiesOf(attacker)
        .filter(target => power.targetMeetsConditions(attacker, target.actor));
        return [randomSelect(list)];
      }
      case '1-engaged':
      case '1-nearby':
        this.checkTargets(1,1, selected, true);
        return selected;
      case '1-nearby-dead':
        this.checkTargets(1,1, selected, false);
        return selected;
      case 'all-enemies': {
        return PersonaCombat.getAllEnemiesOf(attacker)
        .filter(target => power.targetMeetsConditions(attacker, target.actor));
      }
      case 'all-dead-allies': {
        const combat = PersonaCombat.ensureCombatExists();
        const targets = combat.validCombatants(this.getToken(attacker))
        .filter( x => {
          const actor = x.actor;
          if (!actor) {return false;}
          if ((actor).isAlive()) {return false;}
          if ((actor).isFullyFaded()) {return false;}
          return ((x.actor as ValidAttackers).getAllegiance() == attackerType);
        });
        return targets.map( x=> x.token as PToken);
      }
      case 'all-allies': {
        if (PersonaCombat.combat) {
          return PersonaCombat.getAllAlliesOf(attacker);
        }
        return PersonaDB.activePCParty()
        .map( member => this.getToken(member));
      }
			case 'self': {
				return [this.getToken(attacker)];
			}
			case '1d4-random':
			case '1d4-random-rep':
			case '1d3-random-rep':
			case '1d3-random':
				throw new TargettingError('Targetting type not yet implemented');
			case 'all-others': {
				const combat= PersonaCombat.ensureCombatExists();
        const attackerToken = combat.getCombatantByActor(attacker)?.token;
				return combat.validCombatants(attackerToken as PToken)
				.filter( x=> x.actor != attacker
					&& x?.actor?.isAlive())
				.map( x=> x.token as PToken)
				.filter(target => power.targetMeetsConditions(attacker, target.actor));
				;
			}
			case 'everyone':{
				const combat= PersonaCombat.ensureCombatExists();
        const attackerToken = combat.getCombatantByActor(attacker)?.token;
				return combat.validCombatants(attackerToken as PToken)
				.filter( x=> x?.actor?.isAlive())
				.map( x=> x.token as PToken)
				.filter(target => power.targetMeetsConditions(attacker, target.actor));
			}
			case 'everyone-even-dead': {
				const combat= PersonaCombat.ensureCombatExists();
        const attackerToken = combat.getCombatantByActor(attacker)?.token;
				return combat.validCombatants(attackerToken as PToken)
				.filter( x=> x.actor && !x.actor.isFullyFaded())
				.map( x=> x.token as PToken)
				.filter(target => power.targetMeetsConditions(attacker, target.actor));
			}
			default:
				targets satisfies never;
				throw new TargettingError(`targets ${targets as string} Not yet implemented`);
		}

  }

  static getToken(actor: ValidAttackers) : PToken {
    const combat = PersonaCombat.combat;
    if (combat) {
      const comb = combat.getCombatantByActor(actor);
      if (comb) {return comb.token as PToken;}
    }
    const token = game.scenes.active.tokens.find(tok=> tok.actor == actor && tok.actorLink == true);
    if (token) {return token as PToken;}
    for (const scene of game.scenes) {
      const token = scene.tokens.find(tok=> tok.actor == actor && tok.actorLink == true);
      if (token) {return token as PToken;}
    }

    throw new PersonaError(`Can't find token for ${actor.name}`);
  }


	static checkTargets(min: number, max: number, targets: PToken[], aliveTargets: boolean) {
		if (!targets.every(x=> PersonaCombat.canBeTargetted(x))) {
			const error = 'Selection includes an untargettable target';
			throw new TargettingError(error);
		}
		const selected = targets
			.filter(x=> aliveTargets ? x.actor.isAlive() : (!x.actor.isAlive() && !x.actor.isFullyFaded()));
		if (selected.length == 0)  {
			const error = 'Requires Target to be selected';
			throw new TargettingError(error);
		}
		if (selected.length < min) {
			const error = 'Too few targets selected';
			ui.notifications.warn(error);
			throw new TargettingError(error);
		}
		if (selected.length > max) {
			const error = 'Too many targets selected';
			ui.notifications.warn(error);
			throw new TargettingError(error);
		}
	}

}

export class TargettingError extends Error {
	constructor (errormsg: string) {
		super(errormsg);
		ui.notifications.warn(errormsg);
	}
}

