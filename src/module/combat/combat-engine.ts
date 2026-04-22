import {OtherEffect} from "../../config/consequence-types.js";
import {DamageType} from "../../config/damage-types.js";
import {Defense} from "../../config/defense-types.js";
import {ModifierTarget, NonDeprecatedModifierType} from "../../config/item-modifiers.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {PowerTag} from "../../config/power-tags.js";
import {SocialLinkIdOrTarot} from "../../config/precondition-types.js";
import {PersonaCombatStats} from "../actor/persona-combat-stats.js";
import {ConditionalEffectC} from "../conditionalEffects/conditional-effect-class.js";
import {ConsequenceProcessor} from "../conditionalEffects/consequence-processor.js";
import {PersonaItem} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaRoller, RollBundle} from "../persona-roll.js";
import {TriggeredEffect} from "../triggered-effect.js";
import {sleep} from "../utility/async-wait.js";
import {Calculation} from "../utility/calculation.js";
import {Helpers} from "../utility/helpers.js";
import {CanceledDialgogError, HTMLTools} from "../utility/HTMLTools.js";
import {TimeLog} from "../utility/logger.js";
import {AttackResult, CombatResult} from "./combat-result.js";
import {AILMENT_LEVELS, DamageCalculation, INSTANT_KILL_LEVELS, InstantKillLevel} from "./damage-calc.js";
import {FinalizedCombatResult} from "./finalized-combat-result.js";
import {ModifierList} from "./modifier-list.js";
import {CombatOptions, PersonaCombat, PToken} from "./persona-combat.js";
import {PersonaTargetting, TargettingError} from "./persona-targetting.js";

export class CombatEngine {
	combat: U<PersonaCombat>;
	customAtkBonus: number = 0;
	CRIT_MAX = 10 as const;
	static LUCK_DIFF_MULTIPLIER = (1/6);
	startTime: number;

  static BASE_DEFENSE_DMG_ATTACK = 4 as const;
  static BASE_DEFENSE_INSTANT_KILL = 20 as const;
  static BASE_DEFENSE_AILMENT = 18 as const;
	static BASE_WEAPON_CRIT_BOOST = 2 as const;
	static BASE_MAGIC_CRIT_BOOST = 1 as const;

	constructor (combat: U<PersonaCombat> = game.combat as U<PersonaCombat>) {
		this.combat = combat;
	}

	 static getTokenFromActor(actor: ValidAttackers) : PToken {
			let token : PToken | undefined;
			if (actor.token) {
				 token = actor.token as PToken;
			} else {
				 const combat= game.combat as U<PersonaCombat>;
				 const combToken = combat?.getPToken(actor);
				 if (combToken) { return combToken;}
				 token = game.scenes.current.tokens.find(tok => tok.actorId == actor.id) as PToken;
				 if (token) {return token;}
				 // const tokens = actor._dependentTokens.get(game.scenes.current)!;
				 //THIS IS PROBABLY A bad idea to iterate over weakset
				 // token = Array.from(tokens)[0];
				 token = actor.getDependentTokens()
						.find( tok => tok.parent == game.scenes.current) as U<PToken>;
			}

		if (!token) {
			throw new PersonaError(`Can't find token for ${actor.name}: ${actor.id}` );
		}
		return token;
	}

  static async usePower(actor: ValidAttackers, power: UsableAndCard, presetTargets ?: PToken[], options : CombatOptions = {}) {
    try {
      Helpers.ownerCheck(actor);
      Helpers.pauseCheck();
      const attacker = this.getTokenFromActor(actor);
      const combat = game.combat as U<PersonaCombat>;
      const engine = combat ? combat.combatEngine : new CombatEngine(undefined);
      return await engine.usePower(attacker, power, presetTargets, options );
    } catch (e) {
      switch (true) {
        case e instanceof CanceledDialgogError: {
          break;
        }
        case e instanceof TargettingError: {
          break;
        }
        case e instanceof Error: {
          console.error(e);
          console.error(e.stack);
          PersonaError.softFail("Problem with Using Item or Power", e, e.stack);
          break;
        }
        default: break;
      }
    }
  }

  async usePower(attacker: PToken, power: UsableAndCard, presetTargets ?: PToken[], options : CombatOptions = {}) : Promise<FinalizedCombatResult> {
    Helpers.ownerCheck(attacker.actor);
    Helpers.pauseCheck();
    this.setPendingResult();
    TimeLog.reset();
    this.startTime = Date.now();
    if (attacker instanceof foundry.canvas.placeables.Token) {
      throw new Error('Actual token found instead of token document');
    }
    if (!options.ignorePrereqs && !await this.checkPowerPreqs(attacker, power)) {
      return new CombatResult().finalize();
    }
    try {
      const targets = presetTargets ? presetTargets :  PersonaTargetting.getTargets(attacker, power);
      this.ensureCombatCheck(power, attacker, targets);
      await this.handlePlayerInputModifier(options);
      const result = new CombatResult();
      result.merge(await this.usePowerOn(attacker, power, targets, 'standard', options));
      const costs = this.#processCosts(attacker, power, result.getOtherEffects(attacker.actor));
      result.merge(costs);
      const finalizedResult = result.finalize();
      if (options.simulated) { return finalizedResult;}
      if (!power.isOpener(attacker.actor))  {
        await attacker.actor.expendAction();
      }
      await attacker.actor.removeStatusesOfType("out-of-turn-action");
      await finalizedResult.toMessage(power.name, attacker.actor);
      await this.postActionCleanup(attacker, finalizedResult);
      return finalizedResult;
    } catch(e) {
      if (e instanceof CanceledDialgogError) {
        this.clearPendingResult();
        throw e;
      }
      console.log(e);
      this.clearPendingResult();
      throw e;
    }
  }

	/** throws error if there's no combat*/
	ensureCombatCheck(power: UsableAndCard, attacker: PToken, targets: PToken[]) {
		const selfOnly = targets.every( target => target.actor == attacker.actor);
		const targetsShadows = targets.some( target => target.actor.system.type == 'shadow' );
		if (!power.isSkillCard()
			&& targetsShadows
			&& !selfOnly) {
			this.ensureCombatExists();
		}
	}

  setPendingResult() {
    if (PersonaCombat.combat) {
      PersonaCombat.combat._resolvingAttack = true;
    }
  }

  clearPendingResult() {
    if (PersonaCombat.combat) {
      PersonaCombat.combat._resolvingAttack = false;
    }
  }

	async handlePlayerInputModifier(options: CombatOptions): Promise<void> {
		if (options.askForModifier) {
			this.customAtkBonus = await HTMLTools.getNumber('Attack Modifier');
		} else {
			this.customAtkBonus = 0;
		}
	}

  async postActionCleanup(attacker: PToken, result: FinalizedCombatResult ) {
    await attacker.actor.onFinishAction();
    await sleep(1250); //wait for extra action status?
    if (PersonaCombat.combat && !PersonaCombat.combat.isSocial) {
      await PersonaCombat.combat.postActionCleanup(attacker, result);
    }
    this.clearPendingResult();
  }

	async usePowerOn(attacker: PToken, power: UsableAndCard, targets: PToken[], rollType : AttackRollType, options: CombatOptions = {}) : Promise<CombatResult> {
		const result = new CombatResult();
		for (const target of targets) {
			result.merge(await this.usePowerOnTarget(attacker, power, target, rollType, options));
		}
		this.computeResultBasedEffects(result);
		return result;
	}

	async usePowerOnTarget(attacker: PToken, power: UsableAndCard, target: PToken, rollType : AttackRollType, options: CombatOptions) : Promise<CombatResult> {
		const result = new CombatResult();
		const num_of_attacks = this.getNumOfAttacks(power);
		for (let atkNum = 0; atkNum < num_of_attacks; ++atkNum) {
			rollType = atkNum > 0 ? 'iterative': rollType;
			const atkResult = await this.attackRollProcess( attacker, power, target, rollType == 'standard' && atkNum==0 ? 'activation' : rollType, options);
      if (atkResult.activationRoll) {
        result.activationRoll = atkResult.activationRoll;
      }
			const this_result = this.processEffects(atkResult);
			result.merge(this_result);
			const secondary = await this.handleSecondaryAttacks(this_result, atkResult, power, attacker, target, rollType, options);
			result.merge(secondary);
			Hooks.callAll('onUsePower', power, attacker, target);
		}
		return result;
	}

	async handleSecondaryAttacks(CR: CombatResult, atkResult: AttackResult, power: UsableAndCard, attacker: PToken, _target: PToken, _rollType: AttackRollType, options: CombatOptions  ): Promise<CombatResult> {
		const result = new CombatResult;
		if (atkResult.result == 'reflect') {
			result.merge(await this.usePowerOn(attacker, power, [attacker], 'reflect'));
		}

		if (!power.isSkillCard()) {
			// const extraAttacks= await this.execExtraAttacks(CR, power, rollType, attacker, target, options);
			// result.merge(...extraAttacks);
			const extraPowerEffects= await this.execSubPowers(CR, atkResult, options);
			result.merge(...extraPowerEffects);
		}
		return result;
	}

	getNumOfAttacks(power: UsableAndCard) : number {
		if (!power.isPower()) { return 1;}
		const min = power.system.attacksMin ?? 1;
		const max = power.system.attacksMax ?? 1;
		const num_of_attacks = Math.floor(min + (Math.random() * (max - min+1)));
		return num_of_attacks;
	}

	// async execExtraAttacks(CR: CombatResult, power: Usable, rollType: AttackRollType,attacker: PToken, target: PToken, options: CombatOptions ) {
	// 	const ret : CombatResult[] = [];
    //note extra attacks were removed as a mechanic
		//const extraAttacks = CR.findEffects('extraAttack');
		//for (const extraAttack of extraAttacks)
		//{
		//	const bonusRollType = typeof rollType != 'number' ? 0: rollType+1;
		//	const mods = new ModifierList();
		//	//TODO BUG: Extra attacks keep the main inputted modifier
		//	if (extraAttack.iterativePenalty) {
		//		mods.add('Iterative Penalty', (bonusRollType + 1) * extraAttack.iterativePenalty);
		//	}
		//	const newOptions = {
		//		...options,
		//		modifiers: mods,
		//	};
		//	if (bonusRollType < extraAttack.maxChain) {
		//		const extra = await this.usePowerOn(attacker, power, [target], bonusRollType, newOptions);
		//		ret.push(extra);
		//	}
		//}
		// return ret;
	// }

	/** executes powers which trigger off other powers via consequence */
	async execSubPowers(CR : CombatResult, atkResult: AttackResult, options: CombatOptions) : Promise<CombatResult[]> {
		const extraPowers : CombatResult[] = [];
		const execPowers = CR.findEffects('use-power');
		for (const usePower of execPowers) {
			//TODO BUG: Extra attacks keep the main inputted modifier
			if (!this.combat) {continue;}
      if (!usePower.owner) {
        PersonaError.softFail("Can't find new Attacker for extra power execution", usePower);
        continue;
      }
      const newAttackerActor = PersonaDB.findActor(usePower.owner) as ValidAttackers;
			const newAttacker = this.combat.getPToken(newAttackerActor);
			const execPower = PersonaDB.allPowers().get( usePower.powerId);
			if (execPower && newAttacker) {
				const altTargets= PersonaCombat.getAltTargets(newAttacker, atkResult.situation, usePower.target );
				const newTargets = PersonaTargetting.getTargets(newAttacker, execPower, altTargets);
				const extraPower = await this.usePowerOn(newAttacker, execPower, newTargets, 'standard', options);
				extraPowers.push(extraPower);
			}
		}
		return extraPowers;
	}

	computeResultBasedEffects(result: CombatResult) {
		//TODO: Put code to check for miss all targets in ehere
		return result;
	}

	private getBaseSituation(attacker: Persona, target: Persona, usableOrCard: UsableAndCard, rollData: AttackRollData) {
		const baseProtoSituation = {
			attacker: attacker.user.accessor,
			target: target.user.accessor,
			usedPower: usableOrCard.accessor,
			user: attacker.user.accessor,
			rollTags: rollData.rollTags,
			naturalRoll: rollData.roll.dice[0].total,
			rollTotal: rollData.roll.total,
		} satisfies Situation;
		const baseSituation = {
			...baseProtoSituation,
      addedTags: this.determineAddedPowerTags(attacker, target, usableOrCard, baseProtoSituation),
			rollType: rollData.rollType,
      DC: undefined,
		} satisfies SituationComponent.RollParts.PreRoll;
		return baseSituation;
	}

  private determineAddedPowerTags(attacker: Persona, target: Persona, usableOrCard: UsableAndCard, situation: Situation) : PowerTag[] {
    const targetActor = target.user;
    const attackerActor = attacker.user;
    const trigSit = {
      trigger : "get-added-power-tags",
      usedPower: usableOrCard.accessor,
      target: targetActor.accessor,
      user: attackerActor.accessor,
      attacker: attackerActor.accessor,
      triggeringCharacter: attackerActor.accessor,
      triggeringUser: game.user,
      addedTags: "addedTags" in situation ? situation.addedTags ?? [] : [],
    } satisfies TriggeredSituation.Select<"get-added-power-tags">;
    const consList = TriggeredEffect.onTrigger_consequences(trigSit, attackerActor);
    const tags = consList
      .filter( cons=> cons.type == "combat-effect"
        && cons.combatEffect == "add-power-tag-to-attack")
      .map (cons => PersonaItem.resolveTag(cons.powerTag));
    if (tags.length > 0) {
      const tagNames= tags.map ( tag=> tag instanceof PersonaItem ? tag.name : tag);
      console.log(`Adding Tag: ${tagNames.join()}`);
    }
    return tags;
  }

	private generateRollTags(rollType: AttackRollType): NonNullable<AttackResult["situation"]['rollTags']> {
		const rollTags: AttackResult["situation"]["rollTags"]= ['attack'];
		switch (rollType) {
			case "activation":
				rollTags.push("activation");
				break;
			case "iterative":
				rollTags.push("secondary-attack");
				break;
			case "reflect":
				rollTags.push("reflected-attack");
				break;
		}
		const activationRoll = rollType == 'activation';
		if (activationRoll) {
			rollTags.push('activation');
		}
		return rollTags;
	}

	private storeActivationRoll(attackRollData: AttackRollData) {
		if (this.combat
			&& !this.combat.isSocial
			&& attackRollData.rollType == "activation"
    ) {
		}
	}

	private getRollNameGenFn(attacker: Persona, power: Usable, target: Persona)  : (rollB: RollBundle) => string{
		return (rollB : RollBundle) => {
			const cssClass= (!target.user.isPC()) ? 'gm-only' : '';
			const defenseStr =`<span class="${cssClass}">(${rollB?.DC ?? 0})</span>`;
			const rollName =  `${attacker.combatName} (${power.name}) ->  ${target.combatName} vs. ${power.targettedDefenseLocalized()} ${defenseStr}`;
			return rollName;
		};
	}

	private getBaseAttackResult(roll: RollBundle, attacker: Persona, target:Persona, power: Usable ): Pick<AttackResult, 'attacker' | 'target'  | 'power' | 'roll'>  {
		const baseData = {
			roll,
			attacker: attacker.token ? PersonaDB.getUniversalTokenAccessor(attacker.token): null,
			target: target.token ? PersonaDB.getUniversalTokenAccessor(target.token) : null,
			power: PersonaDB.getUniversalItemAccessor(power)
		} satisfies Pick<AttackResult, 'attacker' | 'target'  | 'power' | 'roll'>;
		return baseData;
	}

	static withinRange(range: U<CalculatedRange>, roll: AttackRollData) : boolean {
		if (!range) {return false;}
		return range.possible
			&& !roll.rollTags.includes("secondary-attack")
			&& roll.natural >= range.low
			&& roll.natural <= range.high;
	}

	generateAttackSituation (attacker: Persona, target: Persona, power: Usable, rollData: AttackRollData, rollTotal: number, _options: CombatOptions = {}): ProtoResultAttackSituation {
		const baseSituation = this.getBaseSituation(attacker, target, power, rollData);
		const def = power.system.defense;
		const defenseCalc = target.getDefense(def).eval(baseSituation);
		const defenseVal = def != 'none' ? defenseCalc.total: 0;
		const partialSituation = {
			...baseSituation,
			naturalRoll: rollData.natural,
			rollTotal: rollTotal,
			DC: defenseVal,
			rollType: rollData.rollType,
		} ;
		const {ailmentRange, instantKillRange, critRange} = CombatEngine.calculateRanges(attacker, target, power, partialSituation);
		const withinAilmentRange = CombatEngine.withinRange(ailmentRange, rollData);
		const withinCritRange = CombatEngine.withinRange(critRange, rollData);
		const withinInstantKillRange = CombatEngine.withinRange(instantKillRange, rollData);
		const protoSituation = {
      ...partialSituation,
      ailmentRange, instantKillRange, critRange,
      withinAilmentRange,
      withinInstantKillRange,
      withinCritRange,
      attackerPersona: attacker,
      targetPersona: target,
    } satisfies ProtoResultAttackSituation;
		return protoSituation;
	}

	makeRollBundle (rollData: AttackRollData, attacker: Persona, target: Persona, power: Usable, situation: SituationTypes.PreRoll, options: RollOptions ) : RollBundle {
		const attackBonus = this.getAttackBonus(attacker, power, target, options);
		const rollName = this.getRollNameGenFn(attacker, power, target);
		const bundle = new RollBundle(rollName, rollData.roll, attacker.user.isPC(), attackBonus, situation);
		return bundle;
	}

  async makeAttackRoll( rollType: AttackRollData["rollType"], options : CombatOptions) : Promise<AttackRollData> {
    const roll = await (options.setRoll ? new Roll(`0d1+${options.setRoll}`).roll():  new Roll('1d20').roll());
    const rollTags = this.generateRollTags(rollType);
    rollTags.pushUnique('attack');
    PersonaRoller.hideAnimation(roll);
    const attackRollData : AttackRollData = {
      roll,
      rollType,
      rollTags,
      natural: roll.total,
    };
    if (!options.simulated) {
      this.storeActivationRoll(attackRollData);
    }
    return attackRollData;
  }

	private async attackRollProcess ( attackerToken: PToken, power: UsableAndCard, targetToken: PToken, rollType: AttackRollType, options: CombatOptions = {}) : Promise<AttackResult> {
		const attacker = attackerToken.actor.persona();
		const target = targetToken.actor.persona();
		const rollData = await this.makeAttackRoll(rollType, options);
		if (power.isSkillCard()) {
			return this.processSkillCard(attacker, power, target, rollData);
		}
		const baseSituation = this.getBaseSituation(attacker, target, power, rollData);
		const rollBundle = this.makeRollBundle(rollData, attacker, target, power, baseSituation, options );
		const situation = this.generateAttackSituation(attacker, target, power, rollData, rollBundle.total, options);
		rollBundle.DC = situation?.DC;
		return this.generateAttackResult(attacker, target, power, rollBundle, situation);
	}

  private generateAttackResult(attacker: Persona, target: Persona, power: Usable, rollBundle: RollBundle, situation: ProtoResultAttackSituation): AttackResult {
    const addonAttackResultData = {
      ailmentRange: situation.ailmentRange,
      instantKillRange: situation.instantKillRange,
      critRange: situation.critRange,
      situation,
    };
    const {result, resisted, struckWeakness} = this.determineAttackResult(attacker, target, power, rollBundle, situation);
    const baseData = this.getBaseAttackResult(rollBundle, attacker, target, power);
    const situationFull : AttackResult["situation"] = {
      ...situation,
      result,
      withinAilmentRange : situation.withinAilmentRange ?? false,
      withinInstantKillRange: situation.withinInstantKillRange ?? false,
      withinCritRange: situation.withinCritRange ?? false,
      resisted,
      struckWeakness,
    };
    const attackResult : AttackResult = {
      ...baseData,
      ...addonAttackResultData,
      situation: situationFull,
      result,
      hitWeakness : struckWeakness,
      hitResistance : resisted,
    };
    if ( situation.rollTags.includes("activation") && rollBundle.natural > 0) {
      attackResult.activationRoll = rollBundle.natural;
    }
    return attackResult;
  }

	private determineAttackResult(attacker: Persona, target: Persona, power: Usable, _roll: RollBundle, situation: ProtoResultAttackSituation) : AttackResultData {
		const result = this.getBaseResult(attacker, target,power, situation);
		const resultSituation = {
			...situation,
			...result,
		};
		const override = this.checkOverride(attacker, target, power, resultSituation);
		return override ?? result;
	}

	private checkOverride(attacker : Persona, target: Persona, power: Usable, resultSituation: AttackResult["situation"]) : N<AttackResultData> {
    const trigSit ={
      ...resultSituation,
      trigger: "on-use-power",
      triggeringUser: game.user,
      triggeringCharacter: attacker.user.accessor,
    } as const satisfies TriggeredSituation.Select<"on-use-power">;
		const overrideResult = TriggeredEffect.onTrigger(trigSit, attacker.user)
		.globalOtherEffects.filter( eff=> eff.type == "set-roll-result");
		const rank = this.rankAttackResult;
		if (overrideResult.length) {
			const finalResult = overrideResult
				.reduce( (acc : typeof r | null, r) => {
					const p1 = r?.priority ?? Infinity;
					const p2 = acc?.priority ?? Infinity;
					if (p1 != p2) {
						return p1 < p2 ? r : acc;
					}
					if (rank(r) < rank(acc) ) {
						return r;
					}
					return acc;
				}, null);
			if (!finalResult) {return null;}
			if (PersonaSettings.debugMode()) {
				console.debug(`Override to ${finalResult.result}`);
			}
			return this.getWeaknessSitRep(attacker, target, power, finalResult.result, resultSituation);
		}
		return null;
	}

	private rankAttackResult( this:void,  data: UN<{ result: AttackResultData["result"] , priority?: number}>) : number {
		const result = data?.result ?? null;
		switch (result) {
			case "fumble": return -1;
			case "miss": return 0;
			case "hit": return 1;
			case "crit": return 2;
			case "block": return 4;
			case "reflect": return 5;
			case "absorb": return 5;
			case null: return Infinity;
			default:
				result satisfies never;
				return -666;
		}
	}

  static hasAddedTag (situation: Situation, tag: PowerTag) : boolean {
    if ("addedTags" in situation) {
      return PersonaItem.hasTag(situation.addedTags ?? [], tag);
    }
    return false;
  }

  static hasPierce(attacker: Persona, power: Usable, situation: U<Situation>) {
		const pierce = power.hasTag('pierce', attacker) ||
      (situation ? CombatEngine.hasAddedTag(situation, "pierce") : false);
    return pierce;
  }

	private getWeaknessSitRep (attacker: Persona, target: Persona, power: Usable, result: AttackResultData["result"] , situation : Situation) : Pick<AttackResult["situation"], "result" | "resisted" | "struckWeakness">  {
		const element = power.getDamageType(attacker);
		const resistance = target.elemResist(element);
		const pierce = CombatEngine.hasPierce(attacker, power, situation);
		switch (result) {
			case "fumble":
			case "reflect":
			case "block":
			case "absorb":
				return {result, resisted: false, struckWeakness: false};
			case "miss":
				return {
					result,
					resisted: !pierce && resistance  == "resist",
					struckWeakness: false,
				};
			case "hit":
			case "crit":
				return {
					result,
					resisted: !pierce && resistance  == "resist",
					struckWeakness : resistance == "weakness",
				};
			default:
				result satisfies never;
				PersonaError.softFail(`Odd result ${result as string}`);
		}
		return {result, resisted: false, struckWeakness: false};
	}

	private getBaseResult(attacker: Persona, target: Persona, power: Usable, situation: ProtoResultAttackSituation) : AttackResultData {
		const testNullify = this.checkAttackNullifiers(attacker, power, target, situation);
		if (testNullify) {
			return this.getWeaknessSitRep(attacker, target, power, testNullify, situation);
		}
		const def = power.system.defense;
		if (def == 'none') {
			if (this.checkCritical(attacker, target, power, situation)) {
				return this.getWeaknessSitRep(attacker, target, power, "crit", situation);
			} else {
				return this.getWeaknessSitRep(attacker, target, power, "hit", situation);
			}
		}
		if (this.checkFumble(attacker, target, power, situation)) {
			return this.getWeaknessSitRep(attacker, target, power, "fumble", situation);
		}
		if (this.checkMiss(attacker, target, power, situation)) {
			return this.getWeaknessSitRep(attacker, target, power, "miss", situation);
		}
		if (this.checkCritical(attacker, target, power, situation)) {
			return this.getWeaknessSitRep(attacker, target, power, "crit", situation);
		}
		return this.getWeaknessSitRep(attacker, target, power, "hit", situation);
	}

	private checkCritical( attacker: Persona, target: Persona,  power: Usable, situation: ProtoResultAttackSituation): boolean {
		const canCrit = typeof situation.rollType == 'number' || situation.rollType == 'iterative' ? false : true;
		return !!(
			situation.withinCritRange
			&& situation.rollTotal >= (situation.DC ?? 0)
			&& !target.user.hasStatus('blocking')
			&& !power.hasTag('no-crit', attacker )
			&& canCrit
		);
	}

	private checkMiss( attacker: Persona, _target: Persona,  power: Usable, situation: ProtoResultAttackSituation) : boolean {
		const naturalAttackRoll = situation.naturalRoll;
		const rageOrBlind = attacker.user.hasStatus('rage') || attacker.user.hasStatus('blind');
		const autoHit = situation.rollType == "reflect" && !power.isInstantDeathAttack() && !power.isAilment();
		const Mod20 = naturalAttackRoll == 20 ? 3 : 0;
		if (!autoHit &&
			(naturalAttackRoll == 1
				|| (situation.rollTotal+Mod20) < situation.DC!
				|| (rageOrBlind && naturalAttackRoll % 2 == 1)
			)
		) {
			return true;
		}
		return false;
	}

	private checkFumble( _attacker: Persona, _target: Persona,  _power: Usable, _situation: ProtoResultAttackSituation) : boolean {
		return false;
		//testing program based solution
		// if (
		// 	power.isWeaponSkill()
		// 	&& power.getDamageType(attacker) == "physical"
		// 	&& situation.naturalRoll == 1
		// ) {return true;}
		// return false;
	}

	checkAttackNullifiers(attacker : Persona , power :Usable, target: Persona, situation: ProtoResultAttackSituation ): N<AttackResult["result"]> {
		if (power.hasTag("theurgy", attacker)) {return null;}
		const element = power.getDamageType(attacker);
		const resist = target.elemResist(element);
		const pierce = CombatEngine.hasPierce(attacker, power, situation);
		switch (resist) {
			case 'reflect': {
				return situation.rollType != "reflect" ? "reflect" : "block";
			}
			case 'block': {
				if (!pierce) {return "block";}
        break;
			}
			case 'absorb' : {
				if (!pierce) {return "absorb";}
        break;
			}
		}
		if (target.user.hasStatus('phys-shield') && this.canBeReflectedByPhysicalShield(power, attacker)) {
			return situation.rollType != "reflect" ? "reflect" : "block";
		}
		if (target.user.hasStatus('magic-shield') && this.canBeReflectedByMagicShield(power, attacker)) {
			return situation.rollType != "reflect" ? "reflect" : "block";
		}
		return null;
	}


	canBeReflectedByPhysicalShield(power: UsableAndCard, attacker: Persona): boolean {
		if (power.isSkillCard()) {return false;}
		const dtype = power.getDamageType(attacker);
		switch (dtype) {
			case 'physical':
			case 'gun':
				return true;
			default:
				return false;
		}
	}

	canBeReflectedByMagicShield(power: UsableAndCard, attacker: Persona) : boolean {
		if (power.isSkillCard()) {return false;}
		const dtype = power.getDamageType(attacker);
		const reflectable : DamageType[] = ["fire", "wind", "light", "dark", "cold", "lightning"];
		if (reflectable.includes(dtype)) {
			return true;
		}
		const isAilmentOrInstantKill = power.system.defense == "ail" || power.system.defense == "kill";
		if (power.isMagicSkill() && power.system.damageLevel == "none" && isAilmentOrInstantKill) {
			return true;
		}
		return false;
	}

	processEffects(atkResult: AttackResult) : CombatResult {
		const CombatRes = new CombatResult();
		const {result } = atkResult;
		switch (result) {
			case 'reflect': {
				const reflectRes = new CombatResult(atkResult);
				const targetActor = atkResult.target ? PersonaDB.findToken(atkResult.target)?.actor : PersonaDB.findActor(atkResult.situation.target);
				const power = PersonaDB.findItem(atkResult.power);
				const attacker = PersonaDB.findToken(atkResult.attacker!);
				if ( targetActor.hasStatus('magic-shield') && this.canBeReflectedByMagicShield(power, attacker.actor.persona())) {
					const cons : SourcedConsequence = {
						type: "combat-effect",
						combatEffect: 'removeStatus',
						owner: targetActor.accessor,
						statusName: 'magic-shield',
						source: power.accessor,
						realSource: undefined,
						applyTo: "target",
					};
					reflectRes.addEffect(atkResult, targetActor, cons, atkResult.situation );
				}
				if (targetActor.hasStatus('phys-shield') && this.canBeReflectedByPhysicalShield(power, attacker.actor.persona())) {
					const cons : SourcedConsequence = {
						type: "combat-effect",
						combatEffect: 'removeStatus',
						owner: targetActor.accessor,
						statusName: 'phys-shield',
						source: power.accessor,
						realSource: undefined,
						applyTo: "target",
					};
					reflectRes.addEffect(atkResult, targetActor, cons, atkResult.situation);
				}
				CombatRes.merge(reflectRes);
				return CombatRes; }
			case 'block': {
				const blockRes = new CombatResult(atkResult);
				CombatRes.merge(blockRes);
				return CombatRes; }
			case 'hit':
			case 'miss':
			case 'crit':
			case "fumble":
			case 'absorb':
				break;
			default:
				result satisfies never;
				PersonaError.softFail(`Unknown hit result ${result as string}`);
		}
		const powerEffects = this.processPowerEffectsOnTarget(atkResult);
		CombatRes.merge(powerEffects);
		return CombatRes;
	}

	async processSkillCard( attacker: Persona, usableOrCard: UsableAndCard, target: Persona, rollData: AttackRollData) : Promise<AttackResult> {
		const situation = this.getBaseSituation(attacker, target, usableOrCard, rollData);
		const r = await new Roll('1d20').roll();
		const emptyList = new ModifierList();
		const roll = new RollBundle('Activation Roll Skiill Card', r, attacker.user.isPC(), emptyList, situation);
		const combatRollSituation = {
      ...situation,
      naturalRoll: r.total,
      rollType: "standard",
      rollTags: [],
      rollTotal: r.total,
      withinAilmentRange: false,
      withinCritRange: false,
      withinInstantKillRange: false,
      resisted: false,
      struckWeakness: false,
      DC: 0,
      result: "hit",
      addedTags: [],
      attackerPersona: attacker,
      targetPersona: attacker,
    } satisfies AttackResult["situation"];
		const res : AttackResult = {
			result: 'hit',
			target: target.token ? PersonaDB.getUniversalTokenAccessor(target.token): null,
			attacker: attacker.token ? PersonaDB.getUniversalTokenAccessor(attacker.token): null,
			power: usableOrCard.accessor,
			critRange: undefined,
			ailmentRange: undefined,
			instantKillRange: undefined,
			situation: combatRollSituation,
			roll,
			// printableModifiers: []
		};
		return res;
	}

  static getStatModifier( attackStat: number, defenseStat: number, bonusMult = 1) : Calculation {
    const calc = new Calculation();
    const comparison =  PersonaCombatStats.statComparison(attackStat, defenseStat);
    const sign = Math.sign(comparison);
    let diffPercent = Math.abs(comparison) - 1;
    switch (true) {
      case diffPercent > 1 : {
        const over = diffPercent - 1;
        const mod = Math.floor(over * 100 / 25 * bonusMult); //each 25% over 100% counts as a +1 modifier;
        diffPercent = 1;
        calc.add(0, mod * sign , `(Over 100%) stat diff ${attackStat} vs ${defenseStat}`);
      }
      // eslint-disable-next-line no-fallthrough
      case diffPercent >= 0.1: {
        const over = diffPercent;
        const mod = Math.floor(over * 100 / 10 * bonusMult); //each 10% counts as a +1 modifier up to 100%;
        diffPercent = 0.1;
        calc.add(0, mod * sign, `(Under 100%) stat diff ${attackStat} vs ${defenseStat}`);
      }
      // eslint-disable-next-line no-fallthrough
      case diffPercent > 0 : {
        const mod = 1; //the larger score gets an automatic +1 mod
        calc.add(0, mod * sign, "Greater Stat Modifier");
      }
    }
    return calc;
  }

   getStatModifier (attacker: Persona, target: Persona, power: Usable) : Calculation {
    const attackStat = CombatEngine.getAttackStat(attacker, power);
    const defenseStat =CombatEngine.getDefenseStat(target, power);
     return CombatEngine.getStatModifier(attackStat, defenseStat);
  }

  getAttackBonus(attacker: Persona, power: Usable, target: Persona | undefined, options : CombatOptions = {}) : Calculation {
    const attackBonus = target ? this.getStatModifier(attacker, target, power) : new Calculation();
    if (target) {
      const bonuses = this.getAttackRollModifiers(attacker, target, power);
      attackBonus.merge(bonuses);
    }
		// const attackBonus = this.getBaseAttackBonus(attacker, power);
		attackBonus.add(1, this.customAtkBonus ?? 0, 'Custom modifier');
		const defense = this.getDefenderAttackModifiers(target, power.system.defense, power);
		attackBonus.add(1, defense, "Defense Mods");
		if (options.modifiers) {
			attackBonus.add(1, options.modifiers, "Extra Mods");
		}
		return attackBonus;
	}

  private static getAttackStat(attacker: Persona, power: Usable) : number {
    switch (power.system.defense) {
      case "none": return 0;
      case "fort": return attacker.combatStats.agility;
      case "ref": return attacker.combatStats.agility;
      case "kill": return attacker.combatStats.luck;
      case "ail": return attacker.combatStats.luck;
    }
  }

  private static getDefenseStat(target: Persona, power: Usable) : number {
    switch (power.system.defense) {
      case "none": return 0;
      case "fort": return target.combatStats.agility;
      case "ref": return target.combatStats.agility;
      case "kill": return target.combatStats.luck;
      case "ail": return target.combatStats.luck;
    }
  }

  getAttackRollModifiers(attacker: Persona, target: Persona, power: Usable)  : Calculation {
    const calc = new Calculation();
    const mods : NonDeprecatedModifierType[] = ["allAtk"];
    switch (power.system.defense) {
      case "fort":
        mods.push("magAtk");
        break;
      case "ref":
        mods.push("wpnAtk");
        break;
      case "kill":
        calc.add(1, CombatEngine.baseInstantKillBonus(power), "Base Instant Kill bonus");
        // mods.push("instantDeathRange");
        break;
      case "ail":
        calc.add(1, CombatEngine.baseAilmentAttackBonus(power), "Base Ailment bonus");
        // mods.push("afflictionRange");
        break;
      case "none":
        break;
      default:
        power.system.defense satisfies never;
    }
    if (power.system.defense == "kill") {
    }
    const atkAndDefenderMods = CombatEngine.getAttackerAndDefenderModifiers(mods, attacker, target, power);
    calc.add(1, atkAndDefenderMods, "Unified Mods");
    // Debug(atkAndDefenderMods);
    // console.log(atkAndDefenderMods);
    return calc;
  }

	getDefenderAttackModifiers(target: Persona | undefined, defense : Defense, power: Usable) : ModifierList {
		if (!target || defense == "none") {return new ModifierList();}
		const vectors : ModifierTarget[] = ['allAtk'];
		if (power.isMagicSkill())  {
			vectors.push("magAtk");
		}
		if (power.isWeaponSkill())  {
			vectors.push("wpnAtk");
		}
		const defenseMod = new ModifierList(
			PersonaItem.getModifier(
				target.defensiveModifiers(),
				['allAtk']
			)
		);
		return defenseMod;
	}

	processPowerEffectsOnTarget(atkResult: AttackResult) : CombatResult {
		const {situation} = atkResult;
		const power = PersonaDB.findItem(atkResult.power);
		const attacker = atkResult.attacker ? PersonaDB.findToken(atkResult.attacker).actor : PersonaDB.findActor(atkResult.situation.attacker);
		const target = atkResult.target ? PersonaDB.findToken(atkResult.target).actor : PersonaDB.findActor(atkResult.situation.target);
		const attackerEffects= attacker.getEffects(['passive']);
		const defenderEffects = target.getEffects(['defensive']);
		const powerEffects= power.getEffects(attacker, {CETypes: ['on-use', 'passive']});
    const extraTagEffects = (situation.addedTags ?? [])
    .flatMap ( tag => tag instanceof PersonaItem ? tag.getEffects(null ) : []);
		const sourcedEffects = [...attackerEffects];
		const eqTest = (a: ConditionalEffectC, b: ConditionalEffectC) => a.equals(b);
		sourcedEffects.pushUniqueS(eqTest, ...defenderEffects);
		sourcedEffects.pushUniqueS(eqTest, ...powerEffects);
    sourcedEffects.pushUniqueS(eqTest, ...extraTagEffects);
		const CombatRes = new CombatResult(atkResult);
		const consequences = sourcedEffects.flatMap( eff => eff.getActiveConsequences(situation));
		const res = ConsequenceProcessor.consequencesToResult(consequences, power,  situation, atkResult);
		CombatRes.merge(res);
		if (PersonaSettings.debugMode() && game.user.isGM) {
			console.debug(res);
		}
		return CombatRes;
	}

	static defaultSituation(  attackerPersona: Persona, targetPersona: Persona, power: Usable) {
		const actorAcc = attackerPersona.user.accessor;
		const sit = {
			user: actorAcc,
			attacker: actorAcc,
			target: targetPersona.user.accessor,
			usedPower: power.accessor,
		} as const satisfies Situation;
		return sit;
	}

	static calculateRanges( attackerPersona: Persona, targetPersona: Persona, power: Usable, situation: N<Situation>) {
		const ailmentRangeRaw = CombatEngine.calculateAilmentRange(attackerPersona, targetPersona, power, situation);
		const instantKillRangeRaw = CombatEngine.calculateInstantDeathRange(attackerPersona, targetPersona, power, situation);
		const critRangeRaw = CombatEngine.calculateCriticalRange(attackerPersona, targetPersona, power, situation);
		if (PersonaSettings.debugMode()) {
      // this.rangesDebugStats([ailmentRangeRaw, instantKillRangeRaw, critRangeRaw]);
		}
		const ailmentRange = this.constrainRange(ailmentRangeRaw);
		const instantKillRange = this.constrainRange(instantKillRangeRaw);
		const critRange = this.constrainRange(critRangeRaw);
		return {ailmentRange, instantKillRange, critRange};
	}

  static rangesDebugStats( ranges : U<CalculatedRange>[]) {
    ranges
      .filter( range => range != undefined)
      .forEach( range=> console.debug(range));
  }

	static constrainRange(range: U<CalculatedRange> ) {
		if (range == undefined) {return undefined;}
		if (range.low > 23) {return undefined;}
		if (range.low > 20) {range.low = 20;}
		return {
			...range,
			low: Math.max(1, range.low),
			high: Math.min(20, range.high),
		};
	}

	static luckDiff( attackerPersona: Persona, targetPersona: Persona) : Calculation {
    return this.getStatModifier(attackerPersona.combatStats.luck, targetPersona.combatStats.luck, 0.5);
	}

	static calculateAilmentRange( attackerPersona: Persona, targetPersona: Persona, power: Usable, situation: N<Situation>) : U<CalculatedRange> {
		if (!situation) {
			situation = this.defaultSituation(attackerPersona, targetPersona, power);
		}
		if (power.targetsDefense == "ail") {
			return {
				high: 20,
				low: 1,
				possible: true,
				steps: [],
				type: "ailment",
			};
		}
		const luckDiff = this.luckDiff(attackerPersona, targetPersona);
		const baseRangeData = this.calculateBaseAilmentRange(power);
		if (!baseRangeData)  { return undefined; }
		const {high, modifier, locType}= baseRangeData;
		const mods = this.getAttackerAndDefenderModifiers("afflictionRange", attackerPersona, targetPersona, power);
		const calc =  new Calculation(0, 3);
		calc.add(1, mods, "Attacker And Defender Ailment Mods");
		calc.add(0, modifier, `Chance ${locType} modifier`);
		calc.add(1, luckDiff, "Luck Difference Mod");
		const calcResolved = calc.eval(situation);
		const {total, steps} = calcResolved;
		const ailmentRange = {
			high,
			low: high - total,
			steps,
		};
		if (!ailmentRange) {return undefined;}
		if (ailmentRange.low > ailmentRange.high) {return undefined;}
		return {
			type: "ailment",
			...ailmentRange,
			possible: ailmentRange.low <= ailmentRange.high
		};
	}

	static getAttackerAndDefenderModifiers(modName: MaybeArray<NonDeprecatedModifierType>, attackerPersona: Persona, targetPersona: Persona, power: Usable) {
		const attackerMods = attackerPersona.getBonuses(modName, power);
		const targetDefense = targetPersona.getDefensiveBonuses(modName) ;
		return attackerMods.concat(targetDefense);
	}

  static getBaseDefense(defense: Defense) : number {
    switch (defense) {
      case "fort": return this.BASE_DEFENSE_DMG_ATTACK;
      case "ref": return this.BASE_DEFENSE_DMG_ATTACK;
      case "kill": return this.BASE_DEFENSE_INSTANT_KILL;
      case "ail": return this.BASE_DEFENSE_AILMENT;
      case "none": return 0;
    }
  }

	static calculateCriticalRange(  attackerPersona: Persona, targetPersona: Persona, power: Usable, situation?: N<Situation>) : U<CalculatedRange> {
		const powerMod = power.baseCritBoost();
		if (!situation) {
			situation = this.defaultSituation(attackerPersona, targetPersona, power);
		}
		const luckDiff = this.luckDiff(attackerPersona, targetPersona);
		const mods = this.getAttackerAndDefenderModifiers("criticalBoost", attackerPersona, targetPersona, power);
		const resist = this.getAttackerAndDefenderModifiers("critResist", attackerPersona, targetPersona, power);
		const calc = new Calculation(0, 3);
		calc.add(0, powerMod, "Base Critical");
		calc.add(1, mods, "Critical Boost");
		calc.subtract(1, resist, "Critical Resist");
		calc.add(1, luckDiff, "Luck Difference Mod");
		const {total, steps} = calc.eval(situation);
		const high =20;
		const low = high - total;
		return {
			high,
			low: low > -10 ? Math.max(low, 11): low,
			steps,
			type: "critical",
			possible: total > -3,
		};
	}

	static calculateInstantDeathRange(  attackerPersona: Persona, targetPersona: Persona, power: Usable, situation?: N<Situation>) : U<CalculatedRange> {
		if (power.targetsDefense == "kill") {
			return {
				low: 6,
				high: 20,
				steps: [],
				possible: true,
				type: "instantKill",
			};
		}
		const baseRangeData = this.calculateBaseInstantKillRange(power);
		if (!baseRangeData)  { return undefined; }
		const {high, modifier, locType}= baseRangeData;

		if (!situation) {
			situation = this.defaultSituation(attackerPersona, targetPersona, power);
		}
		const luckDiff = this.luckDiff(attackerPersona, targetPersona);
		if (!power.canDealDamage()) {return {low: 6, high: 99, steps: [], possible: true, type: "instantKill"};}
		const mods = this.getAttackerAndDefenderModifiers("instantDeathRange", attackerPersona, targetPersona, power);
		const calc= new Calculation(0, 3);
		calc.add(1, mods, "Attacker and Defender mods");
		// calc.add(1, killDefense,  "Defense Mods");
		calc.add(1, luckDiff, "Luck Difference Mod");
		calc.add(0, modifier, `Instant Kill Chance ${locType} modifier`);

		const {total, steps} = calc.eval(situation);
		if (PersonaSettings.debugMode()) {
			console.debug(steps);
		}
		const deathRange = {
			high,
			low: high - total,
			steps,
		};
		if (deathRange) {
			deathRange.low = Math.max(deathRange.low, 6);
		}
		if (deathRange.low > deathRange.high) {return undefined;}
		return {
			...deathRange,
			steps,
			possible: deathRange.low <= deathRange.high,
			type: "instantKill",
		};
	}

	async checkPowerPreqs(attacker: PToken, power: UsableAndCard) : Promise<boolean> {
		const combat = this.combat;
		if (combat && !combat.turnCheck(attacker)) {
			if (!game.user.isGM) {
				ui.notifications.warn("It's not your turn!");
				return false;
			} else {
				if (!await HTMLTools.confirmBox('Out of turn Action', "It's not your turn, act anyway?")) {
					return false;
				}
			}
		}
		if (!attacker.actor.persona().canPayActivationCost(power)) {
			ui.notifications.notify("You can't pay the activation cost for this power");
			return false;
		}
		if (!attacker.actor.persona().canUsePower(power, true)) {
			ui.notifications.notify("You can't Use this power");
			return false;
		}
		return true;
	}

	#processPowerCost (attacker: PToken, situation: Situation, power: Power, _costModifiers: OtherEffect[]) : CombatResult {
		const res = new CombatResult();
		if (power.system.subtype == 'social-link') {
			if (power.system.inspirationId) {
				res.addEffect(null, attacker.actor, {
					type:'inspiration-cost',
					amount: power.system.inspirationCost,
					socialLinkIdOrTarot: power.system.inspirationId as SocialLinkIdOrTarot,
					source: power.accessor,
					owner: attacker.actor.accessor,
					realSource: undefined,
					applyTo: "attacker",
				}, situation);
			}
		}
		if (!attacker.actor.isShadow() && power.hpCost()) {
			const deprecatedConvert = DamageCalculation.convertToNewFormConsequence({
				type: 'hp-loss',
				damageType: 'none',
				amount: power.modifiedHpCost(attacker.actor.persona()),
				source: power.accessor,
				owner: attacker.actor.accessor,
				realSource: undefined,
				applyTo: "attacker",
			}, power.getDamageType(attacker.actor));
			res.addEffect(null, attacker.actor, deprecatedConvert, situation );
		}
		if (!attacker.actor.isShadow()
			&& power.system.subtype == 'magic'
			&& power.mpCost(attacker.actor.persona()) > 0) {
			res.addEffect(null, attacker.actor, {
				type: 'alter-mp',
				subtype: 'direct',
				amount: -power.mpCost(attacker.actor.persona()),
				source: power.accessor,
				owner: attacker.actor.accessor,
				realSource: undefined,
				applyTo: "attacker",
			}, situation);
		}
		if (attacker.actor.isShadow()) {
			const ecost = power.energyCost(attacker.actor.persona());
			if (power.energyCost(attacker.actor.persona()) > 0) {
				res.addEffect(null, attacker.actor, {
					type: "combat-effect",
					combatEffect: 'alter-energy',
					amount: -ecost,
					source: power.accessor,
					owner: attacker.actor.accessor,
					realSource: undefined,
					applyTo: "attacker",
				}, situation);
			}
		}
		const cooldown = power.getCooldown(attacker.actor);
		if (power.isPower() && cooldown > 0) {
			res.addEffect(null, attacker.actor, {
				type: "combat-effect",
				combatEffect: 'set-cooldown',
				powerId: power.id,
				durationRounds: cooldown,
				source: power.accessor,
				owner: attacker.actor.accessor,
				realSource: undefined,
				applyTo: "attacker",
			}, situation);

		}
		return res;
	}

	#processCosts(attacker: PToken , usableOrCard: UsableAndCard, _costModifiers: OtherEffect[]) : CombatResult {
		const situation = {
			user: attacker.actor.accessor,
			attacker: attacker.actor.accessor,
			usedPower: usableOrCard.accessor,
      target: attacker.actor.accessor,
		} satisfies Situation;
		const res = new CombatResult();
		switch (usableOrCard.system.type) {
			case 'power': {
				const power  = usableOrCard as Power;
				res.merge(this.#processPowerCost(attacker, situation, power, _costModifiers));
				break;
			}
			case 'skillCard':
			case 'consumable' :{
				const consumable = usableOrCard as Consumable;
				if (consumable.isSkillCard()
					|| consumable.system.subtype == 'consumable') {
					res.addEffect(null, attacker.actor, {
						type: 'expend-item',
						source: usableOrCard.accessor,
						owner: attacker.actor.accessor,
						realSource: undefined,
						applyTo: "attacker",
					}, situation);
				}
				break;
			}
			default:
				usableOrCard.system satisfies never;
		}
		return res;
	}

	ensureCombatExists() : PersonaCombat {
		if (this.combat) {return this.combat;}
		return PersonaCombat.ensureCombatExists();
	}

	static calculateBaseAilmentRange(power: Usable):  U<{high: number, modifier: number, locType: string}> {
		const chance  = AILMENT_RANGE_BY_POWER[power.system.ailmentChance];
		if (power.targetsDefense == "ail") {return undefined;}
		if (!chance) {return undefined;}
		return {
			...chance,
			locType: game.i18n.localize(AILMENT_LEVELS[power.system.ailmentChance]),
		};
	}


	static calculateBaseInstantKillRange(power: Usable):  U<{high: number, modifier: number, locType: string}> {
		if (!power.isInstantDeathAttack()) {return undefined ;}
		if (power.targetsDefense == "kill") {
			return {
				modifier: +1000,
				high: 20,
				locType: game.i18n.localize(INSTANT_KILL_LEVELS[power.system.instantKillChance]),
			};
		};
		const chance = INSTANT_KILL_RANGE_BY_POWER[power.system.instantKillChance];
		if (!chance) {return undefined;}
		return {
			...chance,
			locType: game.i18n.localize(INSTANT_KILL_LEVELS[power.system.instantKillChance]),
		};
	}

	private static baseAilmentAttackBonus(power: Usable) : number {
		if (power.targetsDefense != "ail") {return 0;}
		const boost = AILMENT_BONUS_LEVELS[power.system.ailmentChance] ?? 0;
		if (power.system.ailmentChance == "always") {
			ui.notifications.notify(`${this.name} Ailment Always not allowed on ailment targetting powers, treating as High`);
		}
		return boost;
	}

	private static baseInstantKillBonus(power: Usable): number {
		if (!power.isInstantDeathAttack()) {return 0;}
		const boost = INSTANT_KILL_CRIT_BOOST[power.system.instantKillChance] ?? 0;
		return boost;
	}

  static isAnyHit(situation: Situation) : U<boolean> {
    if (!("result" in situation)) {return undefined;}
    if (situation.result) {
      return (situation.result == "hit" || situation.result == "crit" || situation.result == "absorb");
    }
    if ("combatOutcome" in situation) {
      return situation.combatOutcome == "win";
    }
    if ("hit" in situation) {
      return !!situation.hit;
    }
    return false;
  }

	static isFumble( situation: Situation) : U<boolean> {
    if (!("result" in situation)) {return undefined;}
		return situation.result == "fumble";
	}

	static isMiss(situation: Situation) : U<boolean>{
    if (!("result" in situation)) {return undefined;}
		return situation.result == "miss";
	}

	static isCrit(situation: Situation) : U<boolean> {
    if (!("result" in situation)) {return undefined;}
		return situation.result == "crit";
	}

}

export type AttackRollType = 'activation' | 'standard' | 'reflect' | 'iterative' | number; //number is used for bonus attacks

type CalculatedRange = {
	high: number,
	low: number,
	steps: string[],
	possible: boolean,
	type: "instantKill" | "ailment" | "critical",
}

const INSTANT_KILL_RANGE_BY_POWER = {
	'none': undefined,
	'low': {modifier: 1, high: 20},
	'medium': {modifier: 3, high: 20},
	'high': {modifier: 5, high: 20},
	'always':{modifier: 14, high: 20},
} as const;

const AILMENT_RANGE_BY_POWER = {
	'none': undefined,
	'low': {modifier: 1, high: 18},
	'medium': {modifier: 3, high: 18},
	'high': {modifier: 8, high: 20},
	'always':{modifier: 20, high: 20},
} as const;


const AILMENT_BONUS_LEVELS : Record <InstantKillLevel, number> = {
	always: 11,//treat as always
	high: 9,
	medium: 7,
	low: 5,
	none: 0,
};

const INSTANT_KILL_CRIT_BOOST : Record< InstantKillLevel, number>= {
	always: 1000,
	high: 10,
	medium: 7,
	low: 4,
	none: 0,
};

type AttackRollData = {
	roll: Roll,
	rollType: AttackRollType,
	rollTags: SituationComponent.RollParts.PreRollCore["rollTags"],
	natural: number,
}

type ProtoResultAttackSituation = Omit<SituationComponent.RollParts.PreRoll & SituationComponent.RollParts.CombatReportPart, "resisted" | "struckWeakness" | "result"> ;

type AttackResultData = {
	result: AttackResult["result"],
	struckWeakness: boolean,
	resisted: boolean,
}

