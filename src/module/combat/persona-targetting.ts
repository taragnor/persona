import { PersonaActor } from "../actor/persona-actor.js";
import {ConditionalEffectC} from "../conditionalEffects/conditional-effect-class.js";
import {ConditionalEffectPrinter} from "../conditionalEffects/conditional-effect-printer.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {TriggeredEffect} from "../triggered-effect.js";
import {randomSelect} from "../utility/array-tools.js";
import {PersonaCombat, PersonaCombatant, PToken} from "./persona-combat.js";

export class PersonaTargetting {
  power : UsableAndCard;

  constructor (usable: UsableAndCard) {
    this.power = usable;
  }

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
    const filteredTargets = baseTargets
    .filter( target => {
			const situation : Situation = {
				user: attacker.actor.accessor,
				attacker: attacker.actor.accessor,
				target: target.actor.accessor,
				usedPower: power.accessor,
			};
      return power.targeting().targetMeetsTargettingConditions(attacker.actor, target.actor, situation);
    });

    if (filteredTargets.length == 0) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const reasons = baseTargets
        .map( target => {
          const situation : Situation = {
            user: attacker.actor.accessor,
            attacker: attacker.actor.accessor,
            target: target.actor.accessor,
            usedPower: power.accessor,
          };
          const reasons = power.targeting().targetMeetsTargettingConditions_getReasons(attacker.actor, target.actor, situation);
          return [target.name, reasons];
        }) as [string, string[]][];
      const reasonsObj : Record<string, string[]> = Object.fromEntries(reasons);
      throw new TargettingError("No valid targets", reasonsObj);
    }
    const challengeFilter = filteredTargets
    .filter( target => this.challengeFilter(attacker, target));
    if (challengeFilter.length == 0) {
      throw new TargettingError("No valid targets: Challenge Filter");
    }
    return challengeFilter;
  }

  // targetMeetsTargettingConditions(user: ValidAttackers, target: ValidAttackers, situation?: Situation) : boolean {
  //   if (target.hasStatus('protected') && user != target) {return false;}
  //   const usable = this.power;
  //   if (usable.isSkillCard()) {
  //     return target.persona().powerLearning.canLearnNewSkill();
  //   }
  //   if (!usable.system.validTargetConditions) {return true;}
  //   const conditions  = usable.validTargetConditions(user);
  //   const sit = situation ? situation : {
  //     attacker : user.accessor,
  //     user: user.accessor,
  //     target: target.accessor,
  //     usedPower: usable.accessor,
  //   } as const;
  //   const precond= testPreconditions(conditions, sit);
  //   if (!precond) {return false;}
  //   const triggerSit = {
  //     ...sit,
  //     trigger: "check-legal-target",
  //     triggeringUser: game.user.id,
  //     triggeringCharacter: user.accessor,
  //     addedTags: "addedTags" in sit && sit.addedTags ? sit.addedTags : [],
  //     usedPower: usable.accessor,
  //     user: user.accessor,
  //     target: target.accessor,
  //     attacker : user.accessor,
  //   } satisfies Situation;
  //   const triggerCheck = TriggeredEffect.onTrigger_cancelCheck(triggerSit, user);
  //   if (triggerCheck) {return false;}
  //   return true;
  // }

  targetMeetsTargettingConditions(user: ValidAttackers, target: ValidAttackers, situation?: Situation) : boolean {
    return this.targetMeetsTargettingConditions_getReasons(user, target, situation).length == 0;
  }

  targetMeetsTargettingConditions_getReasons(user: ValidAttackers, target: ValidAttackers, sit ?: Situation): FailReason[] {
    const reasons = [
      ...this.targetPassesPowerTargettingConditions_getReasons(user, target, sit),
      ...this.targetPassesTargetCheckTrigger_getReasons(user, target, sit),
    ];
    return reasons;
  }

  private targetPassesPowerTargettingConditions_getReasons(user: ValidAttackers, target: ValidAttackers, situation?: Situation) : FailReason[] {
    const usable = this.power;
    if (usable.isSkillCard()) {
      if(!target.persona().powerLearning.canLearnNewSkill()) {
        return [`${target.name} can't learn new skill`];
      }
      return [];
    }
    if (!usable.system.validTargetConditions) {return [];}
    const conditions  = usable.validTargetConditions(user);
    const retArr = [];
    const sit = situation ? situation : {
      attacker : user.accessor,
      user: user.accessor,
      target: target.accessor,
      usedPower: usable.accessor,
    } as const;
    const failed = ConditionalEffectC.failedPreconditions(conditions, sit);
    for (const cond of failed) {
      retArr.push( `Target Condition Fail: ${ConditionalEffectPrinter.printConditional(cond)}`);
    }
    return retArr;
  }

  // private targetPassesTargetCheckTrigger(user: ValidAttackers, target: ValidAttackers, situation?: Situation): boolean {
  //   return this.targetPassesTargetCheckTrigger_getReasons(user, target,situation).length == 0;
  // }

  private targetPassesTargetCheckTrigger_getReasons(user: ValidAttackers, target: ValidAttackers, sit ?: Situation) : FailReason[] {
    const triggerSit = {
      ...sit,
      trigger: "check-legal-target",
      triggeringUser: game.user.id,
      triggeringCharacter: user.accessor,
      addedTags: sit && "addedTags" in sit && sit.addedTags ? sit.addedTags : [],
      usedPower: this.power.accessor,
      user: user.accessor,
      target: target.accessor,
      attacker : user.accessor,
    } satisfies Situation;
    const triggerCheck = TriggeredEffect.onTrigger_cancelCheck_getReasons(triggerSit, user);
    return triggerCheck;
  }


  static getDefaultPowerTargets(attacker: ValidAttackers, power: UsableAndCard): PToken[] {
    const targets = power.targets();
    const attackerType = attacker.getAllegiance();
    const selected = this.targettedPTokens();
    switch (targets) {
      case '1-random-enemy': {
        const list = PersonaCombat.getAllEnemiesOf(attacker)
        .filter(target => power.targeting().targetMeetsTargettingConditions(attacker, target.actor));
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
        .filter(target => power.targeting().targetMeetsTargettingConditions(attacker, target.actor));
      }
      case 'all-dead-allies': {
        const combat = PersonaCombat.ensureCombatExists();
        const targets = combat.validCombatants(this.getToken(attacker))
        .filter( x => {
          const actor = x.actor;
          if (!actor) {return false;}
          if ((actor).isAlive()) {return false;}
          if ((actor).isFullyFaded()) {return false;}
          return ((x.actor).getAllegiance() == attackerType);
        });
        return targets.map( x=> x.token);
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
				.map( x=> x.token)
				.filter(target => power.targeting().targetMeetsTargettingConditions(attacker, target.actor));
				;
			}
			case 'everyone': {
				const combat = PersonaCombat.ensureCombatExists();
        const attackerToken = combat.getCombatantByActor(attacker)?.token;
				return combat.validCombatants(attackerToken as PToken)
				.filter( x=> x?.actor?.isAlive())
				.map( x=> x.token)
				.filter(target => power.targeting().targetMeetsTargettingConditions(attacker, target.actor));
			}
			case 'everyone-even-dead': {
				const combat= PersonaCombat.ensureCombatExists();
        const attackerToken = combat.getCombatantByActor(attacker)?.token;
				return combat.validCombatants(attackerToken as PToken)
				.filter( x=> x.actor && !x.actor.isFullyFaded())
				.map( x=> x.token)
				.filter(target => power.targeting().targetMeetsTargettingConditions(attacker, target.actor));
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

  static getValidTargetsFor(usable: UsableAndCard, user: PersonaCombatant,  possibleTargets?: PersonaCombatant[], situation ?: Situation) : PersonaCombatant[] {
    const userActor = user.token.actor;
    if (!userActor) {return [];}
    if (possibleTargets == undefined) {
      const comb = (PersonaCombat.combat ?
        PersonaCombat.combat.combatants.contents :
        []) ?? [];
      possibleTargets = comb.filter( x=> PersonaCombat.isPersonaCombatant(x));
    }
    return possibleTargets
      .filter( comb =>  {
        const targetActor = comb.token.actor;
        if (!targetActor) {return false;}
        if (!PersonaCombat.isPersonaCombatant(comb)) {return false;}
          return this.isValidTargetFor( usable, user, comb, situation);
      });
  }

  getValidTargetsFor( user: PersonaCombatant, situation ?: Situation, possibleTargets?: PersonaCombatant[]) : PersonaCombatant[] {
    return PersonaTargetting.getValidTargetsFor(this.power, user, possibleTargets, situation);
  }

  static isValidTargetFor(usable: UsableAndCard, user: PersonaCombatant, target: PersonaCombatant, situation?:Situation): boolean {
    const userActor = user.token.actor;
    const targetActor = target.token.actor;
    if (!userActor || !targetActor) {return false;}
    if (!usable.targeting().isValidTargetFor(userActor, targetActor, situation))
    {return false;}
    const targetChallenged = targetActor.hasStatus('challenged');
    const userChallenged = userActor.hasStatus('challenged');
    if (userChallenged) {
      if (!targetChallenged) {return false;}
      if (target.parent && !target.parent.isInChallengeWith(user, target))
      {return false;}
    } else {
      if (targetChallenged) {return false;}
    }
    return true;
  }

  isValidTargetFor(user: ValidAttackers, target: ValidAttackers, baseSit?: Situation): boolean {
    const power = this.power;
    if (power.isSkillCard()) {return target.isPCLike();}
    const situation = !baseSit ? {
      user : user.accessor,
      attacker: user.accessor,
      target: target.accessor,
      usedPower: power.accessor,
    }: {
      ...baseSit as SituationTypes.UserOnlySituation, //put this in so it wouldn't be fussy about types
      user : user.accessor,
      attacker: user.accessor,
      target: target.accessor,
      usedPower: power.accessor,
    } satisfies Situation;
    const targets = power.targets();
    switch (targets) {
      case '1-engaged':
      case '1-nearby':
      case '1d4-random':
      case '1d4-random-rep':
      case '1d3-random':
      case '1d3-random-rep':
        if (!target.isAlive()) {return false;}
        break;
      case '1-nearby-dead':
        if (target.isAlive()) {return false;}
        break;
      case 'self':
        if (user != target) {return false;}
        break;
      case '1-random-enemy':
      case 'all-enemies':
        if (PersonaCombat.isSameTeam(user, target)) {return false;}
        if (!target.isAlive()) {return false;}
        break;
      case 'all-allies':
        if (!PersonaCombat.isSameTeam(user, target)) {return false;}
        if (!target.isAlive()) {return false;}
        break;
      case 'all-dead-allies':
        if (!PersonaCombat.isSameTeam(user, target)) {return false;}
        if (target.isAlive()) {return false;}
        break;
      case 'all-others':
        if (user == target) {return false;}
        if (target.isAlive()) {return false;}
        break;
      case 'everyone':
        if (!target.isAlive()) {return false;}
        break;
      case 'everyone-even-dead':
        break;
      default:
        targets satisfies never;
    }
    return this.targetMeetsTargettingConditions(user, target, situation);
    // return testPreconditions(power.validTargetConditions(user), situation);
  }

}

export class TargettingError extends Error {

  reasons: Record<string,string[]>;

	constructor (errormsg: string, reasons: Record<string,string[]> = {}) {
		super(errormsg);
		ui.notifications.warn(errormsg);
    this.reasons = reasons;
	}

  reasonsStr() : string {
    return Object.entries(this.reasons)
      .map( ([actorName, reasons]) => `${actorName}: ${reasons.join(", ")}`)
      .join("\n");
  }

}

type FailReason = string;
