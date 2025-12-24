import {OtherEffect} from "../../config/consequence-types.js";
import {DamageType} from "../../config/damage-types.js";
import {Defense} from "../../config/defense-types.js";
import {ModifierTarget} from "../../config/item-modifiers.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {AnyStringObject} from "../../config/precondition-types.js";
import {RollSituation} from "../../config/situation.js";
import {ConsequenceProcessor} from "../conditionalEffects/consequence-processor.js";
import {Consumable, PersonaItem, Power, Usable, UsableAndCard} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {RollBundle} from "../persona-roll.js";
import {getActiveConsequences} from "../preconditions.js";
import {TriggeredEffect} from "../triggered-effect.js";
import {removeDuplicates} from "../utility/array-tools.js";
import {sleep} from "../utility/async-wait.js";
import {Calculation} from "../utility/calculation.js";
import {Helpers} from "../utility/helpers.js";
import {CanceledDialgogError, HTMLTools} from "../utility/HTMLTools.js";
import {AttackResult, CombatResult} from "./combat-result.js";
import {DamageCalculation} from "./damage-calc.js";
import {FinalizedCombatResult} from "./finalized-combat-result.js";
import {ModifierList} from "./modifier-list.js";
import {CombatOptions, PersonaCombat, PToken, TargettingError} from "./persona-combat.js";
import {PersonaSFX} from "./persona-sfx.js";

export class CombatEngine {
	combat: U<PersonaCombat>;
	customAtkBonus: number = 0;
	CRIT_MAX = 10 as const;

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
			const tokens = actor._dependentTokens.get(game.scenes.current)!;
			//THIS IS PROBABLY A bad idea to iterate over weakset
			//@ts-expect-error not sure what type tokens are
			token = Array.from(tokens)[0];
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
			const combat= game.combat as U<PersonaCombat>;
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
		if (attacker instanceof foundry.canvas.placeables.Token) {
			throw new Error('Actual token found instead of token document');
		}
		if (!options.ignorePrereqs && !await this.checkPowerPreqs(attacker, power)) {
			return new CombatResult().finalize();
		}
		try {
			const targets = presetTargets ? presetTargets :  PersonaCombat.getTargets(attacker, power);
			const selfOnly = targets.every( target => target.actor == attacker.actor);
			const targetsShadows = targets.some( target => target.actor.system.type == 'shadow' );
			if (!power.isSkillCard()
				&& targetsShadows
				&& !selfOnly) {
				this.ensureCombatExists();
			}
			if (options.askForModifier) {
				this.customAtkBonus = await HTMLTools.getNumber('Attack Modifier');
			} else {
				this.customAtkBonus = 0;
			}
			const result = new CombatResult();
			if (!options.simulated) { await PersonaSFX.onUsePower(power);}
			result.merge(await this.usePowerOn(attacker, power, targets, 'standard', options));
			const costs = await this.#processCosts(attacker, power, result.getOtherEffects(attacker.actor));
			result.merge(costs);
			const finalizedResult = result.finalize();
			if (options.simulated) { return finalizedResult;}
			if (!power.isOpener())  {
				await attacker.actor.expendAction();
			}
			await attacker.actor.removeStatus('baton-pass');
			await finalizedResult.toMessage(power.name, attacker.actor);
			await sleep(750); //allopw bonus action statuses and such to be placed;
			await this.postActionCleanup(attacker, result);
			return finalizedResult;
		} catch(e) {
			if (e instanceof CanceledDialgogError) {
				throw e;
			}
			console.log(e);
			throw e;
		}
	}

	async postActionCleanup(attacker: PToken, result: CombatResult ) {
		await this.afterActionTriggered(attacker, result);
		await PersonaCombat.postActionCleanup(attacker, result);
	}

	async afterActionTriggered(attacker: PToken, combatResult: CombatResult) {
		const situation : Situation = {
			trigger: 'on-use-power',
			user: attacker.actor.accessor,
			usedPower: combatResult.power?.accessor,
			triggeringCharacter : attacker.actor.accessor,
			triggeringUser: game.user,
			combatResult,
		};
		await TriggeredEffect.execCombatTrigger('on-use-power', attacker.actor, situation);
	}

	async usePowerOn(attacker: PToken, power: UsableAndCard, targets: PToken[], rollType : AttackRollType, options: CombatOptions = {}, modifiers: ModifierList = new ModifierList()) : Promise<CombatResult> {
		let i = 0;
		const result = new CombatResult();
		for (const target of targets) {
			let num_of_attacks = 1;
			if (power.isPower()) {
				const min = power.system.attacksMin ?? 1;
				const max = power.system.attacksMax ?? 1;
				num_of_attacks = Math.floor(min + (Math.random() * (max - min+1)));
			}
			for (let atkNum = 0; atkNum < num_of_attacks; atkNum++) {
				rollType = atkNum > 0 ? 'iterative': rollType;
				const atkResult = await this.processAttackRoll( attacker, power, target, modifiers, rollType == 'standard' && i==0 ? 'activation' : rollType, options);
				const this_result = await this.processEffects(atkResult);
				result.merge(this_result);
				if (atkResult.result == 'reflect') {
					result.merge(await this.usePowerOn(attacker, power, [attacker], 'reflect'));
				}
				const extraAttacks = this_result.findEffects('extra-attack');
				for (const extraAttack of extraAttacks)
				{
					const bonusRollType = typeof rollType != 'number' ? 0: rollType+1;
					const mods = new ModifierList();
					//TODO BUG: Extra attacks keep the main inputted modifier
					if (extraAttack.iterativePenalty) {
						mods.add('Iterative Penalty', (bonusRollType + 1) * extraAttack.iterativePenalty);
					}
					if (bonusRollType < extraAttack.maxChain) {
						const extra = await this.usePowerOn(attacker, power, [target], bonusRollType, options, mods);
						result.merge(extra);
					}
				}
				const execPowers = this_result.findEffects('use-power');
				for (const usePower of execPowers) {
					//TODO BUG: Extra attacks keep the main inputted modifier
					if (!this.combat) {continue;}
					const newAttacker = this.combat.getPToken(usePower.newAttacker);
					const execPower = PersonaDB.allPowers().get( usePower.powerId);
					if (execPower && newAttacker) {
						const altTargets= PersonaCombat.getAltTargets(newAttacker, atkResult.situation, usePower.target );
						const newTargets = PersonaCombat.getTargets(newAttacker, execPower, altTargets);
						const extraPower = await this.usePowerOn(newAttacker, execPower, newTargets, 'standard', options);
						result.merge(extraPower);
					}
				}
				Hooks.callAll('onUsePower', power, attacker, target);
				i++;
			}
		}
		this.computeResultBasedEffects(result);
		return result;
	}

	computeResultBasedEffects(result: CombatResult) {
		//TODO: Put code to check for miss all targets in ehere
		return result;
	}

	private getBaseSituation(attacker: PToken, target: PToken, usableOrCard: UsableAndCard, rollTags: NonNullable<Situation['rollTags']>) {
		rollTags.pushUnique('attack');
		const combat= this.combat;
		const baseSituation = {
			target: target.actor.accessor,
			usedPower: PersonaDB.getUniversalItemAccessor(usableOrCard),
			user: PersonaDB.getUniversalActorAccessor(attacker.actor),
			rollTags,
			attacker: attacker.actor.accessor,
			activeCombat:combat ? Boolean(combat.combatants.find( x=> x.actor?.system.type != attacker.actor.system.type)): false ,
		} satisfies Situation;
		return baseSituation;
	}

	private generateRollTags(rollType: AttackRollType): NonNullable<Situation['rollTags']> {
		const rollTags: NonNullable<Situation['rollTags']> = ['attack'];
		const activationRoll = rollType == 'activation';
		if (activationRoll) {
			rollTags.push('activation');
		}
		return rollTags;
	}

	private storeActivationRoll(rollType: AttackRollType, roll: Roll) {
		if (this.combat
			&& !this.combat.isSocial
			&& rollType == "activation") {
			this.combat.lastActivationRoll = roll.total;
		}
	}

	private getRollName(attacker: PToken, power: Usable, target: PToken, defenseVal: number) {
		const cssClass= (!target.actor.isPC()) ? 'gm-only' : '';
		const defenseStr =`<span class="${cssClass}">(${defenseVal})</span>`;
		const rollName =  `${attacker.name} (${power.name}) ->  ${target.name} vs. ${power.targettedDefenseLocalized()} ${defenseStr}`;
		return rollName;
	}

	private getBaseAttackResult(roll: RollBundle, attacker: PToken, target:PToken, power: Usable ): Pick<AttackResult, 'attacker' | 'target'  | 'power' | 'roll'>  {
		const baseData = {
			roll,
			attacker: PersonaDB.getUniversalTokenAccessor(attacker) ,
			target: PersonaDB.getUniversalTokenAccessor(target),
			power: PersonaDB.getUniversalItemAccessor(power)
		} satisfies Pick<AttackResult, 'attacker' | 'target'  | 'power' | 'roll'>;
		return baseData;
	}

	private checkMiss(roll: RollBundle, attacker: PToken, target: PToken, situation: AttackResult["situation"] , power: Usable, rollType: AttackRollType, defenseVal: number) {
		const naturalAttackRoll = roll.dice[0].total;
		const rageOrBlind = attacker.actor.hasStatus('rage') || attacker.actor.hasStatus('blind');
		const autoHit = rollType == "reflect" && !power.isInstantDeathAttack() && !power.isAilment();
		const Mod20 = naturalAttackRoll == 20 ? 3 : 0;
		if (!autoHit &&
			(naturalAttackRoll == 1
				|| (roll.total+Mod20) < defenseVal
				|| (rageOrBlind && naturalAttackRoll % 2 == 1)
			)
		) {
			situation.hit = false;
			situation.criticalHit = false;
			return {
				result: 'miss',
				defenseValue: defenseVal,
				hitWeakness: situation.struckWeakness ?? false,
				hitResistance: situation.resisted ?? false,
				situation,
				...this.getBaseAttackResult(roll, attacker, target, power),
			} as const;
		}
	}

	static withinRange(range: U<CalculatedRange>, roll: Roll) : boolean {
		if (!range) {return false;}
		const naturalAttackRoll = roll.dice[0].total;
		return range.possible && naturalAttackRoll > range.low && naturalAttackRoll < range.high;
	}

	private getEffectiveCritBoost(attacker: Persona, target: Persona, situation: Situation, power: Usable) : {critBoost: number, critPrintable: string[]} {
		const critBoostMod = this.calcCritModifier(attacker, target, power, situation);
		const critMin = situation.resisted ? -999 : 0;
		const critResolved = critBoostMod.eval(situation);
		const critMax = critResolved.total < 100 ? this.CRIT_MAX : 100;
		const critBoost = Math.clamp(critResolved.total, critMin, critMax);
		const critPrintable = critResolved.steps;
		return { critBoost, critPrintable};
	}

	async processAttackRoll( attacker: PToken, usableOrCard: UsableAndCard, target: PToken, modifiers: ModifierList, rollType: AttackRollType, options: CombatOptions = {}) : Promise<AttackResult> {
		const attackerPersona = attacker.actor.persona();
		const targetPersona = target.actor.persona();
		const rollTags = this.generateRollTags(rollType);
		const baseSituation = this.getBaseSituation(attacker, target, usableOrCard, rollTags);
		const cardReturn = await this.processSkillCard(attacker, usableOrCard, target, baseSituation);
		if (cardReturn) {return cardReturn;}
		const power = usableOrCard as Usable;
		const element = power.getDamageType(attacker.actor);
		const resist = targetPersona.elemResist(element);
		const def = power.system.defense;
		const r = await (options.setRoll ? new Roll(`0d1+${options.setRoll}`).roll():  new Roll('1d20').roll());
		this.storeActivationRoll(rollType, r);
		const attackbonus = this.getAttackBonus(attackerPersona, power, target, modifiers);
		const roll = new RollBundle('Temp', r, attacker.actor.system.type == 'pc', attackbonus, baseSituation);
		const naturalAttackRoll = roll.dice[0].total;
		const defenseCalc = targetPersona.getDefense(def).eval(baseSituation);
		const defenseVal = def != 'none' ? defenseCalc.total: 0;
		const validDefModifiers = def != 'none' ? defenseCalc.steps: [];
		const rollName = this.getRollName(attacker, power, target, defenseVal);
		roll.setName(rollName);
		const baseData = this.getBaseAttackResult(roll, attacker, target, power);
		const total = roll.total;
		const situation : CombatRollSituation = {
			...baseSituation,
			naturalRoll: naturalAttackRoll,
			rollTotal: roll.total,
			withinAilmentRange: false,
			withinInstantKillRange: false,
		};
		const testNullify = this.processAttackNullifiers(attacker, power, target, baseData, situation, rollType);
		if (testNullify)  {
			return testNullify;
		}
		const resolvedAttackMods = attackbonus.eval(situation);
		const validAtkModifiers = resolvedAttackMods.steps;
		const ailmentRange = CombatEngine.calculateAilmentRange(attackerPersona, targetPersona, power, baseSituation);
		const instantKillRange = CombatEngine.calculateInstantDeathRange(attackerPersona, targetPersona, power, baseSituation);
		const {critBoost, critPrintable} = this.getEffectiveCritBoost(attackerPersona, targetPersona, situation, power);
		const addonAttackResultData = {
			ailmentRange,
			instantKillRange,
			critBoost, critPrintable,
			validAtkModifiers, validDefModifiers,
			situation,
		};
		if (def == 'none') {
			situation.hit = true;
			return {
				result: 'hit',
				...addonAttackResultData,
				...baseData,
			} satisfies AttackResult;
		}
		situation.resisted = resist == 'resist' && !power.hasTag('pierce');
		situation.struckWeakness = resist == 'weakness';
		const checkMiss = this.checkMiss(roll, attacker, target, situation, power, rollType, defenseVal);
		if (checkMiss) {
			return {
				...checkMiss,
				...addonAttackResultData,
			};
		}
		situation.withinAilmentRange = CombatEngine.withinRange(ailmentRange, r);
		situation.withinInstantKillRange = CombatEngine.withinRange(instantKillRange, r);
		const canCrit = typeof rollType == 'number' || rollType == 'iterative' ? false : true;
		const cancelCritsForInstantDeath = false;
		if (naturalAttackRoll + critBoost >= 20
			&& total >= defenseVal
			&& (!power.isMultiTarget() || naturalAttackRoll % 2 == 0)
			&& !target.actor.hasStatus('blocking')
			&& !power.hasTag('no-crit')
			&& canCrit
			&& !cancelCritsForInstantDeath
		) {
			situation.hit = true;
			situation.criticalHit  = true;
			return {
				result: 'crit',
				defenseValue: defenseVal,
				hitWeakness: situation.struckWeakness ?? false,
				hitResistance: situation.resisted ?? false,
				...addonAttackResultData,
				...baseData,
			};
		} else {
			situation.hit = true;
			situation.criticalHit = false;
			return {
				result: 'hit',
				defenseValue: defenseVal,
				hitWeakness: situation.struckWeakness ?? false,
				hitResistance: situation.resisted ?? false,
				...addonAttackResultData,
				...baseData,
			};
		}
	}

	canBeReflectedByPhysicalShield(power: UsableAndCard, attacker: ValidAttackers): boolean {
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

	canBeReflectedByMagicShield(power: UsableAndCard, attacker: ValidAttackers) : boolean {
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

	async processEffects(atkResult: AttackResult) : Promise<CombatResult> {
		const CombatRes = new CombatResult();
		const {result } = atkResult;
		switch (result) {
			case 'reflect': {
				const reflectRes = new CombatResult(atkResult);
				const targetActor = PersonaDB.findToken(atkResult.target).actor;
				const power = PersonaDB.findItem(atkResult.power);
				const attacker = PersonaDB.findToken(atkResult.attacker);
				if ( targetActor.hasStatus('magic-shield') && this.canBeReflectedByMagicShield(power, attacker.actor)) {
					const cons : SourcedConsequence = {
						type: "combat-effect",
						combatEffect: 'removeStatus',
						owner: targetActor.accessor,
						statusName: 'magic-shield',
						source: power,
						realSource: undefined,
						applyTo: "target",
					};
					await reflectRes.addEffect(atkResult, targetActor, cons, atkResult.situation );
				}
				if (targetActor.hasStatus('phys-shield') && this.canBeReflectedByPhysicalShield(power, attacker.actor)) {
					const cons : SourcedConsequence = {
						type: "combat-effect",
						combatEffect: 'removeStatus',
						owner: targetActor.accessor,
						statusName: 'phys-shield',
						source: power,
						realSource: undefined,
						applyTo: "target",
					};
					await reflectRes.addEffect(atkResult, targetActor, cons, atkResult.situation);
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
			case 'absorb':
				break;
			default:
				result satisfies never;
				PersonaError.softFail(`Unknown hit result ${result as string}`);
		}
		const powerEffects = await this.processPowerEffectsOnTarget(atkResult);
		CombatRes.merge(powerEffects);
		return CombatRes;
	}

	async processSkillCard( attacker: PToken, usableOrCard: UsableAndCard, target: PToken, situation: Situation) : Promise<AttackResult | null> {
		if (usableOrCard.system.type != 'skillCard') {
			return null;
		}
		const r = await new Roll('1d20').roll();
		const emptyList = new ModifierList();
		const roll = new RollBundle('Activation Roll Skiill Card', r, attacker.actor.system.type == 'pc', emptyList, situation);
		const combatRollSituation : CombatRollSituation = {
			...situation,
			naturalRoll: r.total,
			rollTags: [],
			rollTotal: r.total,
		};
		const res : AttackResult = {
			result: 'hit',
			target: PersonaDB.getUniversalTokenAccessor(target),
			attacker: PersonaDB.getUniversalTokenAccessor(attacker),
			power: usableOrCard.accessor,
			ailmentRange: undefined,
			instantKillRange: undefined,
			situation: combatRollSituation,
			roll,
			critBoost: 0,
			// printableModifiers: []
		};
		return res;
	}

	getAttackBonus(attackerP: Persona, power: Usable, target: PToken | undefined, modifiers ?: ModifierList) : Calculation {
		const attackBonus = this.getBaseAttackBonus(attackerP, power);
		attackBonus.add(1, this.customAtkBonus ?? 0, 'Custom modifier', "add");
		const defense = this.getDefenderAttackModifiers(target, power.system.defense, power);
		attackBonus.add(1, defense, "Defense MOds", "add");
		if (modifiers) {
			attackBonus.add(1, modifiers, "Extra Mods", "add");
		}
		return attackBonus;
	}

	getDefenderAttackModifiers(target: PToken | undefined, defense : Defense, power: Usable) : ModifierList {
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
				target.actor.persona().defensiveModifiers(),
				['allAtk']
			)
		);
		return defenseMod;
	}

	getBaseAttackBonus(attackerPersona: Persona, power:Usable): Calculation {
		let modList = new ModifierList();
		const calc = new Calculation(0, 3);
		// modList.add('Power attack modifier', power.system.atk_bonus);
		calc.add(1, power.system.atk_bonus,`${power.name} attack bonus`, "add");

		switch (power.system.defense) {
			case "none":
				return calc;
			case "ref": {// weapon attack
				calc.merge(attackerPersona.wpnAtkBonus());
				modList =  modList.concat(new ModifierList(power.getModifier('wpnAtk', attackerPersona.user)));
				break;
			}
			case "fort": //magic attack
				calc.merge(attackerPersona.magAtkBonus());
				modList = modList.concat(new ModifierList(power.getModifier('magAtk', attackerPersona.user)));
				break;
			case "kill": {
				calc.merge(attackerPersona.instantDeathAtkBonus());
				const ID_Bonus = power.baseInstantKillBonus();
				modList.add(`${power.displayedName.toString()} Bonus`, ID_Bonus);
				modList = modList.concat(new ModifierList(power.getModifier('instantDeathRange', attackerPersona.user)));
				break;
			}
			case "ail": {
				calc.merge(attackerPersona.ailmentAtkBonus());
				const Ail_Bonus = power.baseAilmentBonus();
				modList.add(`${power.displayedName.toString()} Bonus`, Ail_Bonus);
				modList = modList.concat(new ModifierList(power.getModifier('afflictionRange', attackerPersona.user)));
				break;
			}
			default:
				power.system.defense satisfies never;
		}
		modList =  modList.concat(new ModifierList(power.getModifier('allAtk', attackerPersona.user)));
		return calc.add(1, modList, "Mods", "add");
		// return modList;
	}

	async processPowerEffectsOnTarget(atkResult: AttackResult) : Promise<CombatResult> {
		const {situation} = atkResult;
		const power = PersonaDB.findItem(atkResult.power);
		const attacker = PersonaDB.findToken(atkResult.attacker);
		const target = PersonaDB.findToken(atkResult.target);
		const attackerEffects= attacker.actor.getEffects(['passive']);
		const defenderEffects = target.actor.getEffects(['defensive']);
		const powerEffects= power.getEffects(attacker.actor, {CETypes: ['on-use', 'passive']});
		const sourcedEffects =
		attackerEffects
		.concat(defenderEffects);
		sourcedEffects.pushUnique(...powerEffects);
		if (PersonaSettings.debugMode()) {
			const dupFree = removeDuplicates(sourcedEffects);
			if (dupFree.length > sourcedEffects.length) {
				console.warn("Duplicates Detected in effects");
				ui.notifications.warn("Duplicates detected in effects");
				console.debug("Effects printed to DLog");
				Debug("Effects", powerEffects, attackerEffects, defenderEffects);
			}
		}
		const CombatRes = new CombatResult(atkResult);
		const consequences = sourcedEffects.flatMap( eff => getActiveConsequences(eff, situation));
		const res = await ConsequenceProcessor.consequencesToResult(consequences, power,  situation, attacker.actor, target.actor, atkResult);
		CombatRes.merge(res);
		return CombatRes;
	}

	processAttackNullifiers(attacker : PToken , power :Usable, target: PToken, baseData: Pick<AttackResult, 'attacker' | 'target'  | 'power' | 'roll'>, situation: Situation & RollSituation, rollType: AttackRollType): AttackResult | null
	{
		const naturalAttackRoll = situation.naturalRoll;
		const element = power.getDamageType(attacker.actor);
		const targetP = target.actor.persona();
		const resist = targetP.elemResist(element);
		const pierce = power.hasTag('pierce');
		switch (resist) {
			case 'reflect': {
				return {
					result: rollType != 'reflect' ? 'reflect': 'block',
					// printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					ailmentRange: undefined,
					instantKillRange: undefined,
					situation: {
						hit: false,
						criticalHit: false,
						...situation,
					},
					...baseData,
				};
			}
			case 'block': {
				if (pierce) {return null;}
				return {
					result: 'block',
					ailmentRange: undefined,
					instantKillRange: undefined,
					// printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						hit: false,
						criticalHit: false,
						...situation,
					},
					...baseData,
				};
			}
			case 'absorb' : {
				if (pierce) {return null;}
				return {
					result: 'absorb',
					ailmentRange: undefined,
					instantKillRange: undefined,
					// printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						...situation,
						hit: true,
						criticalHit: false,
						isAbsorbed: true,
					},
					...baseData,
				};
			}
		}
		if (target.actor.hasStatus('phys-shield') && this.canBeReflectedByPhysicalShield(power, attacker.actor)) {
			return {
				result: rollType != 'reflect' ? 'reflect': 'block',
				// printableModifiers: [],
				ailmentRange: undefined,
				instantKillRange: undefined,
				validAtkModifiers: [],
				validDefModifiers: [],
				critBoost: 0,
				situation: {
					hit: false,
					criticalHit: false,
					...situation,
					naturalRoll: naturalAttackRoll,
				},
				...baseData,
			};
		}
		if (target.actor.hasStatus('magic-shield') && this.canBeReflectedByMagicShield(power, attacker.actor)) {
			return {
				result: rollType != 'reflect' ? 'reflect': 'block',
				// printableModifiers: [],
				ailmentRange: undefined,
				instantKillRange: undefined,
				validAtkModifiers: [],
				validDefModifiers: [],
				critBoost: 0,
				situation: {
					hit: false,
					criticalHit: false,
					...situation,
					naturalRoll: naturalAttackRoll,
				},
				...baseData,
			};
		}
		return null;
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

	static calculateAilmentRange( attackerPersona: Persona, targetPersona: Persona, power: Usable, situation: N<Situation>) : U<CalculatedRange> {
		if (!situation) {
			situation = this.defaultSituation(attackerPersona, targetPersona, power);
		}
		const baseRange = power.ailmentRange;
		if (!baseRange)  { return undefined; }
		const ailmentMods =
		attackerPersona.getBonuses('afflictionRange', power, attackerPersona)
		.concat(
			targetPersona.getBonuses('ail', power, attackerPersona)
		);
		const calc = attackerPersona.combatStats.ailmentBonus();
		calc.add(1, -targetPersona.combatStats.ailmentResist().eval(situation).total, "Target Ailment Resistance", "add");
		calc.add(1, ailmentMods, "Target Ailment Mods", "add");
		const calcResolved = calc.eval(situation);
		const {total, steps} = calcResolved;
		const ailmentRange = {
			...baseRange,
			steps,
		};
		if (PersonaSettings.debugMode()) {
			console.debug(steps);
		}
		if (!ailmentRange) {return undefined;}
		ailmentRange.low -= total;
		if (ailmentRange.low > ailmentRange.high) {return undefined;}
		return {
			...ailmentRange,
			possible: ailmentRange.low <= ailmentRange.high
		};
	}

	static calculateInstantDeathRange(  attackerPersona: Persona, targetPersona: Persona, power: Usable, situation?: N<Situation>) : U<CalculatedRange> {
		if (!situation) {
			situation = this.defaultSituation(attackerPersona, targetPersona, power);
		}
		if (!power.isInstantDeathAttack()) {return undefined
			;}
		if (!power.canDealDamage()) {return {low: 5, high: 99, steps: [], possible: true};}
		const instantDeathMods =
		attackerPersona.getBonuses('instantDeathRange', power, attackerPersona);
		const killDefense =
		targetPersona.getBonuses('kill').total(situation);
		const instantDeathBonus = attackerPersona.combatStats.instantDeathBonus();
		instantDeathBonus.add(1, -targetPersona.combatStats.instantDeathResist().eval(situation).total, "Target Mods", "add");
		instantDeathMods.add("Misc Mods to kill defense", -killDefense);
		instantDeathBonus.add(1, instantDeathMods, "MOds", "add");

		const resolved = instantDeathBonus.eval(situation);
		const {total, steps} = resolved;
		if (PersonaSettings.debugMode()) {
			console.debug(steps);
		}
		const deathRange = power.instantDeathRange;
		if (deathRange) {
			deathRange.low -= total;
			deathRange.low = Math.max(deathRange.low, 6);
		}
		if (!deathRange) {return undefined;}
		return {
			...deathRange,
			steps,
			possible: deathRange.low <= deathRange.high,
		};
	}

	calcCritModifier( attackerPersona: Persona, targetPersona: Persona, power: Usable, situation: Situation, ) : Calculation {
		const critBoostMod = power.critBoost(attackerPersona);
		const critResist = targetPersona.critResist().eval(situation).total;
		critBoostMod.add(1, -critResist, 'Enemy Critical Resistance',"add");
		return critBoostMod;
	}

	async checkPowerPreqs(attacker: PToken, power: UsableAndCard) : Promise<boolean> {
		const combat = this.combat;
		if (combat && !combat.turnCheck(attacker, power)) {
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
		if (!attacker.actor.persona().canUsePower(power)) {
			ui.notifications.notify("You can't Use this power");
			return false;
		}
		return true;
	}

	async #processCosts(attacker: PToken , usableOrCard: UsableAndCard, _costModifiers: OtherEffect[]) : Promise<CombatResult> {
		const situation : Situation = {
			user: attacker.actor.accessor,
			attacker: attacker.actor.accessor,
			usedPower: usableOrCard.accessor,
		};
		const res = new CombatResult();
		switch (usableOrCard.system.type) {
			case 'power': {
				const power  = usableOrCard as Power;
				if (power.system.subtype == 'social-link') {
					if (power.system.inspirationId) {
						await res.addEffect(null, attacker.actor, {
							type:'inspiration-cost',
							amount: power.system.inspirationCost,
							socialLinkIdOrTarot: power.system.inspirationId as unknown as AnyStringObject,
							source: usableOrCard,
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
						source: usableOrCard,
						owner: attacker.actor.accessor,
						realSource: undefined,
						applyTo: "attacker",
					}, power.getDamageType(attacker.actor));
					await res.addEffect(null, attacker.actor, deprecatedConvert, situation );
				}
				if (!attacker.actor.isShadow()
					&& power.system.subtype == 'magic'
					&& power.mpCost(attacker.actor.persona()) > 0) {
					await res.addEffect(null, attacker.actor, {
						type: 'alter-mp',
						subtype: 'direct',
						amount: -power.mpCost(attacker.actor.persona()),
						source: usableOrCard,
						owner: attacker.actor.accessor,
						realSource: undefined,
						applyTo: "attacker",
					}, situation);
				}
				if (attacker.actor.isShadow()) {
					const ecost = power.energyCost(attacker.actor.persona());
					if (power.energyCost(attacker.actor.persona()) > 0) {
						await res.addEffect(null, attacker.actor, {
							type: "combat-effect",
							combatEffect: 'alter-energy',
							amount: -ecost,
							source: usableOrCard,
							owner: attacker.actor.accessor,
							realSource: undefined,
							applyTo: "attacker",
						}, situation);
					}
				}
			}
				break;
			case 'skillCard':
			case 'consumable' :{
				const consumable = usableOrCard as Consumable;
				if (consumable.isSkillCard()
					|| consumable.system.subtype == 'consumable') {
					await res.addEffect(null, attacker.actor, {
						type: 'expend-item',
						source: usableOrCard,
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
}

type AttackRollType = 'activation' | 'standard' | 'reflect' | 'iterative' | number; //number is used for bonus attacks

type CombatRollSituation = AttackResult['situation'];

type CalculatedRange = {
	high: number,
	low: number,
	steps: string[],
	possible: boolean,
}

