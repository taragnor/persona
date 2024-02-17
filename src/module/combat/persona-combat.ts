import { EngagementChecker } from "./engageChecker.js";
import { Metaverse } from "../metaverse.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { HTMLTools } from "../utility/HTMLTools.js";

import { PersonaError } from "../persona-error.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { CombatResult } from "./combat-result.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { ModifierList } from "./modifier-list.js";
import { Situation } from "../preconditions.js";
import { AttackResult } from "./combat-result.js";
import { Usable } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";
import { PersonaRoll } from "../persona-roll.js";
import { UniversalTokenAccessor } from "../utility/db-accessor.js";
import { EngagementList } from "./engagementList.js";
import { Logger } from "../utility/logger.js";
import { OtherEffect } from "./combat-result.js";


export class PersonaCombat extends Combat<PersonaActor> {

	// engagedList: Combatant<PersonaActor>[][] = [];
	_engagedList: EngagementList;
	static customAtkBonus: number

	override async startCombat() {
		this._engagedList = new EngagementList(this);
		await this._engagedList.flushData();
		const x = await super.startCombat();
		await this.setEscalationDie(0);
		return x;
	}

	override get combatant() : Option<Combatant<ValidAttackers>>{
		return super.combatant as Option<Combatant<ValidAttackers>>;
	}

	async startCombatantTurn( combatant: Combatant<ValidAttackers> ){
		const actor = combatant.actor;
		if (!actor) return;
		if (!game.user.isGM) return;
		for (const effect of actor.effects) {
			if (effect.statuses.has("blocking")) {
				await effect.delete();
			}
			if (effect.statusDuration == "USoNT")  {
				await Logger.sendToChat(`Removed condition: ${effect.displayedName} at start of turn`, actor);
				await effect.delete();
			}
		}
		let startTurnMsg= `<u><h2> Start of ${combatant.token.name}'s turn</h2></u><hr>`;
		const debilitatingStatuses :StatusEffectId[] = [
			"sleep",
			"charmed",
			"frozen",
			"shock"
		];
		const debilitatingStatus = actor.effects.find( eff=> debilitatingStatuses.some( debil => eff.statuses.has(debil)));
		if (debilitatingStatus) {
			startTurnMsg += `${combatant.name} can't take actioins normally because of ${debilitatingStatus.name}`;
		}
		const burnStatus = actor.effects.find( eff=> eff.statuses.has("burn"));
		if (burnStatus) {
			const damage = burnStatus.potency;
			startTurnMsg += `${combatant.name} is burning and will take ${damage} damage at end of turn. (original Hp: ${actor.hp}`;
		}
		await Logger.sendToChat(startTurnMsg, actor);
	}

	async endCombatantTurn(combatant: Combatant<ValidAttackers>) {
		const actor = combatant.actor;
		if (!actor) return;
		if (!game.user.isOwner) return;
		const burnStatus = actor.effects.find( eff=> eff.statuses.has("burn"));
		if (burnStatus) {
			const damage = burnStatus.potency;
			await actor.modifyHP(-damage);
		}
		for (const effect of actor.effects) {
			switch (effect.statusDuration) {
				case "UEoNT":
					await Logger.sendToChat(`Removed condition: ${effect.displayedName} at end of turn`, actor);
					await effect.delete();
					break;
				case "save-normal":
					if (await PersonaCombat.rollSave(actor, {
						DC:11,
						label:effect.name
					})) {
						await Logger.sendToChat(`Removed condition: ${effect.displayedName} from saving throw`, actor);
						await effect.delete();
					}
					break;
				case "save-easy":
					if (await PersonaCombat.rollSave(actor, {
						DC: 6,
						label: effect.name
					})) {
						await Logger.sendToChat(`Removed condition: ${effect.displayedName} from saving throw`, actor);
						await effect.delete();
					}
					break;
				case "save-hard":
					if (await PersonaCombat.rollSave(actor, {
						DC:16,
						label:	effect.name
					})) {
						await Logger.sendToChat(`Removed condition: ${effect.displayedName} from saving throw`, actor);
						await effect.delete();
					}
					break;
			}
		}
	}

	get engagedList() : EngagementList {
		if (!this._engagedList)  {
			this._engagedList = new EngagementList(this);
		}
		return this._engagedList;
	}

	static async usePower(attacker: PToken, power: Usable) : Promise<CombatResult> {
		if (!attacker.actor.canPayActivationCost(power)) {
			ui.notifications.notify("You can't pay the activation cost for this power");
			return new CombatResult();
		}
		try {
			const targets= await this.getTargets(attacker, power);
			this.customAtkBonus = await HTMLTools.getNumber("Attack Modifier");
			const result = await  this.#usePowerOn(attacker, power, targets);
			await result.print();
			await result.toMessage(attacker, power);
			// await result.apply();
			return result;
		} catch(e) {
			console.log(e);
			throw e;
		}

	}

	static async #usePowerOn(attacker: PToken, power: Usable, targets: PToken[]) : Promise<CombatResult> {
		let i = 0;
		const result = new CombatResult();

		for (const target of targets) {
			const atkResult = await this.processAttackRoll( attacker, power, target, i==0);
			const this_result = await this.processEffects(atkResult);
			result.merge(this_result);
			i++;
		}
		const costs = await this.#processCosts(attacker, power, result.getOtherEffects(attacker));
		result.merge(costs);
		return result;
	}

	static async processAttackRoll( attacker: PToken, power: Usable, target: PToken, isActivationRoll: boolean) : Promise<AttackResult> {
		const combat = this.ensureCombatExists();
		const escalationDie = combat.getEscalationDie();
		const situation : Situation = {
			target: PersonaDB.getUniversalTokenAccessor(target),
			usedPower: PersonaDB.getUniversalItemAccessor(power),
			user: PersonaDB.getUniversalActorAccessor(attacker.actor),
			userToken: PersonaDB.getUniversalTokenAccessor(attacker),
			escalationDie,
			activationRoll: isActivationRoll,
			activeCombat:true,
		};
		const element = power.system.dmg_type;
		const resist = target.actor.elementalResist(element);
		const attackbonus= this.getAttackBonus(attacker, power);
		attackbonus.add("Custom modifier", this.customAtkBonus);
		const roll = new PersonaRoll("1d20", attackbonus, situation, `${target.document.name} (vs ${power.system.defense})`);
		await roll.roll();
		const naturalAttackRoll = roll.dice[0].total;
		situation.naturalAttackRoll = naturalAttackRoll;
		const baseData = {
			roll,
			attacker: PersonaDB.getUniversalTokenAccessor(attacker) ,
			target: PersonaDB.getUniversalTokenAccessor(target),
			power: PersonaDB.getUniversalItemAccessor(power)
		} satisfies Pick<AttackResult, "attacker" | "target"  | "power" | "roll">;

		switch (resist) {
			case "reflect": {
				return {
					result: "reflect",
					printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						...situation,
						naturalAttackRoll,
					},
					...baseData,
				};
			}
			case "block": {
				return {
					result: "block",
					printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						...situation,
						naturalAttackRoll,
					},
					...baseData,
				};
			}
			case "absorb" : {
				return {
					result: "absorb",
					printableModifiers: [],
					validAtkModifiers: [],
					validDefModifiers: [],
					critBoost: 0,
					situation: {
						...situation,
						naturalAttackRoll,
						hit: true,
						criticalHit: false,
						isAbsorbed: true,
					},
					...baseData,
				};
			}

		}
		const total = roll.total;
		const def = power.system.defense;
		const validAtkModifiers = attackbonus.list(situation);
		const printableModifiers = attackbonus.printable(situation);
		if (def == "none") {
			situation.hit = true;
			return {
				result: "hit",
				critBoost: 0,
				printableModifiers,
				validAtkModifiers,
				validDefModifiers: [],
				situation,
				...baseData,
			};
		}
		const critBoostMod = attacker.actor.critBoost();
		critBoostMod.add("Power Modifier", power.system.crit_boost);
		const critResist = target.actor.critResist().total(situation);
		critBoostMod.add("Enemy Critical Resistance", -critResist);
		if (resist == "weakness") {
			critBoostMod.add("weakness", 4);
		}
		if (target.actor.statuses.has("blocking")) {
			critBoostMod.add("defender blocking", -100);
		}
		const critBoost = critBoostMod.total(situation);
		const validDefModifiers= target.actor.getDefense(def).list(situation);
		situation.resisted = resist == "resist";
		situation.struckWeakness = resist == "weakness";

		if (total < target.actor.getDefense(def).total(situation)) {
			situation.hit = false;
			situation.criticalHit = false;
			return {
				result: "miss",
				printableModifiers,
				validAtkModifiers,
				validDefModifiers,
				critBoost,
				situation,
				...baseData,
			};
		}
		if (resist != "resist" && naturalAttackRoll + critBoost >= 20) {
			situation.hit = true;
			situation.criticalHit  = true;
			return {
				result: "crit",
				validAtkModifiers,
				validDefModifiers,
				printableModifiers,
				critBoost,
				situation,
				...baseData,
			};
		} else {
			situation.hit = true;
			situation.criticalHit = false;
			return {
				result: "hit",
				validAtkModifiers,
				validDefModifiers,
				printableModifiers,
				critBoost,
				situation,
				...baseData,
			}
		}
	}

	static async processEffects(atkResult: AttackResult) : Promise<CombatResult> {
		const CombatRes= new CombatResult();
		const {result, validAtkModifiers, validDefModifiers,  target, situation, } = atkResult;
		const attacker = PersonaDB.findToken(atkResult.attacker);
		const power = PersonaDB.findItem(atkResult.power);
		switch (result) {
			case "reflect":
				CombatRes.merge(await this.#usePowerOn(attacker, power, [attacker]));
				break;
			case "block":
				const blockRes = new CombatResult(atkResult);
				CombatRes.merge(blockRes);
				break;

		}
		CombatRes.merge(await this.processPowerEffectsOnTarget(atkResult));

		return CombatRes;
	}

	static async processPowerEffectsOnTarget(atkResult: AttackResult) : Promise<CombatResult> {
		const CombatRes= new CombatResult(atkResult);
		const {result, validAtkModifiers, validDefModifiers,   situation} = atkResult;
		const power = PersonaDB.findItem(atkResult.power);
		const attacker = PersonaDB.findToken(atkResult.attacker);
		const target = PersonaDB.findToken(atkResult.target);
		const relevantEffects : ConditionalEffect[] = power.getEffects().concat(attacker.actor.getEffects());
		for (let {conditions, consequences} of relevantEffects) {
			if (conditions.every(
				cond => ModifierList.testPrecondition(cond, situation, power))
			) {
				for (const cons of consequences) {
					let damageMult = 1;
					const absorb = situation.isAbsorbed && !cons.applyToSelf;
					const block = result == "block" && !cons.applyToSelf;
					const consTarget = cons.applyToSelf ? attacker: target;
					damageMult *= situation.resisted ? 0.5 : 1;
					switch (cons.type) {
						case "dmg-high":
							CombatRes.addEffect(atkResult, consTarget, {
								type: "dmg-high",
								amount: power.getDamage(attacker.actor, "high") * (absorb ? -1 : damageMult),
							});
							continue;
						case "dmg-low":
							CombatRes.addEffect(atkResult, consTarget, {
								type: "dmg-low",
								amount: power.getDamage(attacker.actor, "low") * (absorb ? -1 : damageMult),
							});
							continue;
						case "extraAttack" :
							//TODO: handle later
							continue;
						case "none":
							continue;
						case "addStatus": case "removeStatus":
							if (absorb || block) continue;
							CombatRes.addEffect(atkResult, consTarget, cons);
							break;
						case "dmg-mult":
							CombatRes.addEffect(atkResult, consTarget, cons);
							break;
						case "escalationManipulation":
							CombatRes.escalationMod += (cons.amount ?? 0);
							continue;
						case "modifier":
								continue;
						case "hp-loss":
								CombatRes.addEffect(atkResult, consTarget, {
									type: "hp-loss",
									amount: cons.amount ?? 0,
								});
							continue;
						default:
							CombatRes.addEffect(atkResult, consTarget, cons);
							break;
					}
				}
			}
		}
		return CombatRes;
	}

	static async #processCosts(attacker: PToken , power: Usable, costModifiers: OtherEffect[]) : Promise<CombatResult>
	{
		const res = new CombatResult();
		if (power.system.type == "power") {
			if (attacker.actor.system.type == "pc" && power.system.hpcost) {
				const hpcostmod = costModifiers.find(x=> x.type== "half-hp-cost") ? 0.5 : 1;
				res.addEffect(null, attacker, {
					type: "hp-loss",
					amount: power.system.hpcost * hpcostmod
				});
			}
			if (attacker.actor.system.type == "pc" && power.system.subtype == "magic" && power.system.slot >= 0){
				if (!costModifiers.find(x=> x.type == "save-slot")) {
					res.addEffect(null, attacker, {
						type: "expend-slot",
						amount: power.system.slot,
					});
				}
			}
			if (attacker.actor.system.type == "shadow") {
				switch(power.system.reqCharge) {
					case "none":
						break;
					case "always":
						res.addEffect(null, attacker, {
							type: "addStatus",
							statusName: "depleted",
							statusDuration:"combat",
						});
						break;
					case "not-enhanced":
						if (Metaverse.isEnhanced()) {
							break;
						}
						res.addEffect(null, attacker, {
							type: "addStatus",
							statusName: "depleted",
							statusDuration:"combat",
						});
						break;
					case "supercharged":
						res.addEffect(null, attacker, {
							type: "removeStatus",
							statusName: "supercharged",
						});
						break;
				}
			}
		}
		if (power.system.type == "consumable") {
			res.addEffect(null, attacker, {
				type: "expend-item",
				itemAcc: PersonaDB.getUniversalItemAccessor(power),
			});
		}
		return res;
	}

	static getAttackBonus(attacker: PToken, power:Usable): ModifierList {
		const actor = attacker.actor;
		if (power.system.type == "consumable") {
			const l = new ModifierList();
			l.add("Item Base Bonus", power.system.atk_bonus);
			return l;
		}
		if (power.system.subtype == "weapon") {
			const mod = actor.wpnAtkBonus();
			return mod.concat(new ModifierList(power.getModifier("wpnAtk")));
		}
		if (power.system.subtype == "magic") {
			const mod = actor.magAtkBonus();
			return mod.concat(new ModifierList(power.getModifier("magAtk")));
		}
		return new ModifierList();
	}

	static async getTargets(attacker: PToken, power: Usable): Promise<PToken[]> {
		const selected = Array.from(game.user.targets) as PToken[];
		const attackerType = attacker.actor.system.type;
		switch (power.system.targets) {
			case "1-engaged":
				this.checkTargets(1,1);
				return selected;
			case "1-nearby":
				this.checkTargets(1,1);
				return selected;
			case "all-enemies": {
				const combat= this.ensureCombatExists();
				const targets= combat.combatants.filter( x => {
					const actor = x.actor;
					if (!actor)  return false;
					return (x.actor.system.type != attackerType)
				});
				return targets.map( x=> x.token._object as PToken);
			}
			case "all-allies": {
				const combat= this.ensureCombatExists();
				const targets= combat.combatants.filter( x => {
					const actor = x.actor;
					if (!actor)  return false;
					return (x.actor.system.type == attackerType)
				});
				return targets.map( x=> x.token._object as PToken);
			}
			case "self": {
				return [attacker];
			}
			default:
				throw new Error(`targets ${power.system.targets} Not yet implemented`);
		}
	}

	static checkTargets(min: number, max: number) {
		const selected = Array.from(game.user.targets);
		if (selected.length == 0)  {
			const error = "Requires Target to be selected";
			ui.notifications.warn(error);
			throw new Error(error);
		}
		if (selected.length < min) {
			const error = "Too few targets selected";
			ui.notifications.warn(error);
			throw new Error(error);
		}
		if (selected.length > max) {
			const error = "Too many targets selected";
			ui.notifications.warn(error);
			throw new Error(error);
		}
	}

	static ensureCombatExists() : PersonaCombat {
		const combat = game.combat;
		if (!combat) {
			const error = "No Combat";
			throw new PersonaError(error);
		}
		return combat as PersonaCombat;
	}

	getEscalationDie() : number {
		return (this.getFlag("persona", "escalation") as number) ?? -1;
	}

	async incEscalationDie() : Promise<void> {
		this.setEscalationDie(Math.min(this.getEscalationDie() +1, 6));
	}

	async decEscalationDie() : Promise<void> {
		this.setEscalationDie(Math.max(this.getEscalationDie() - 1, 0));

	}

	async setEscalationDie(val: number) : Promise<void> {
		await this.setFlag("persona", "escalation", val);
	}

	isEngaged(subject: UniversalTokenAccessor<PToken>) : boolean {

		const tok = PersonaDB.findToken(subject);
		return EngagementChecker.isEngaged(tok, this);
		// const engagement = this.engagedList.findEngagement(c1);
		// return engagement
		// 	.map( id => this.combatants.get(id))
		// 	.some( (comb : Combatant<PersonaActor>) => comb?.actor?.type != c1.actor?.type );
	}

	isEngagedWith(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) : boolean {
		const t1 = PersonaDB.findToken(token1);
		const t2 = PersonaDB.findToken(token2);
		return EngagementChecker.isEngagedWith(t1, t2, this);
		// const c1 = this.getCombatantFromTokenAcc(token1);
		// const c2 = this.getCombatantFromTokenAcc(token2);
		// const engagement = this.engagedList.findEngagement(c1);
		// if (!engagement) return false;
		// return engagement.some( cId => cId == c2.id);
	}

	getCombatantFromTokenAcc(acc: UniversalTokenAccessor<PToken>): Combatant<PersonaActor> {
		const token = PersonaDB.findToken(acc);
		const combatant = this.combatants.find( x=> x?.actor?.id == token.actor.id);
		if (!combatant) {
			throw new PersonaError(`Can't find combatant for ${token.document.name}. are you sure this token is in the fight? `);
		}
		return combatant;
	}

	async setEngageWith(token1: UniversalTokenAccessor<PToken>, token2: UniversalTokenAccessor<PToken>) {
		const c1 = this.getCombatantFromTokenAcc(token1);
		const c2 = this.getCombatantFromTokenAcc(token2);
		await this.engagedList.setEngageWith(c1, c2);
	}

	/** returns pass or fail */
	static async rollSave (actor: ValidAttackers, {DC, label, askForModifier} :SaveOptions) : Promise<boolean> {
		// static async rollSave (actor: ValidAttackers, difficulty: number =11, label ?: string) : Promise<boolean> {
		const difficulty = DC ? DC : 11;
		const mods = actor.getSaveBonus();
		if (askForModifier) {
			const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
			mods.add("Custom modifier", customMod);
		}
		const situation : Situation = {
			user: PersonaDB.getUniversalActorAccessor(actor),
		}
		const labelTxt = `Saving Throw (${label ? label : ""})`;
		const roll = new PersonaRoll("1d20", mods, situation,labelTxt);
		await roll.roll();
		await roll.toModifiedMessage();
		return roll.total >= difficulty;
	}
}

type ValidAttackers = Subtype<PersonaActor, "pc"> | Subtype<PersonaActor, "shadow">;

export type PToken = Token<ValidAttackers>;

CONFIG.Combat.initiative = {
	formula : "@parent.init",
	decimals: 2
}

Hooks.on("preUpdateCombat" , async (combat: PersonaCombat, changes: Record<string, unknown>, diffObject: {direction?: number}) =>  {
	const prevActor = combat?.combatant?.actor
	if (prevActor && diffObject.direction && diffObject.direction > 0) {
		await combat.endCombatantTurn(combat.combatant)
	}

});

Hooks.on("updateCombat" , async (combat: PersonaCombat, changes: Record<string, unknown>, diffObject: {direction?: number}) =>  {
	if (changes.turn != undefined && diffObject.direction && diffObject.direction != 0) {
		const currentActor = combat?.combatant?.actor
		if (currentActor && diffObject.direction > 0) {
			await combat.startCombatantTurn(combat.combatant)
		}
		//new turn
		if (changes.round != undefined) {
			//new round
			if (diffObject.direction > 0 && game.user.isGM) {
				await combat.incEscalationDie();
			}
			if (diffObject.direction < 0 && game.user.isGM) {
				await combat.decEscalationDie();
			}
		}
	}

});

Hooks.on("deleteCombat", async (combat: PersonaCombat) => {
	for (const combatant of combat.combatants) {
		const actor = combatant.actor;
		if (!actor) continue;
		for (const effect of actor.effects) {
			if (effect.durationLessThan("expedition")) {
				await effect.delete();
			}
		}
	}
});


type SaveOptions = {
	label?: string,
	DC?: number,
	askForModifier?: boolean,
}
