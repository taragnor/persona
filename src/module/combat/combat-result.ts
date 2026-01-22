import { DAMAGETYPES } from "../../config/damage-types.js";
import { FinalizedCombatResult } from "./finalized-combat-result.js";
import { ConsequenceProcessed } from "./persona-combat.js";
import { ConsequenceAmount, NewDamageConsequence, SetFlagEffect } from "../../config/consequence-types.js";
import { DamageCalculation } from "./damage-calc.js";
import { RollSituation } from "../../config/situation.js";
import { PersonaItem} from "../item/persona-item.js";
import { PersonaAE, StatusDuration } from "../active-effect.js";
import { getSocialLinkTarget, multiCheckToArray } from "../preconditions.js";
import { Consequence } from "../../config/consequence-types.js";
import { SocialCardActionConsequence } from "../../config/consequence-types.js";
import { OtherEffect } from "../../config/consequence-types.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { ValidSound } from "../persona-sounds.js";
import { PersonaError } from "../persona-error.js";
import { PToken } from "./persona-combat.js";
import { RollBundle } from "../persona-roll.js";
import { PersonaCombat } from "./persona-combat.js";
import { PersonaDB } from "../persona-db.js";
import { PersonaActor } from "../actor/persona-actor.js";
import {ConsequenceAmountResolver} from "../conditionalEffects/consequence-amount.js";
import {ConsequenceTarget} from "../../config/precondition-types.js";
import {SocialActionExecutor} from "../social/exec-social-action.js";
import {ATTACK_RESULT} from "../../config/attack-result-config.js";

declare global {
	interface SocketMessage {
		"COMBAT_RESULT_APPLY" : {resultObj : string; sender: User["id"];}
		"COMBAT_RESULT_APPLIED": CombatResult["id"];
	}
}

export class CombatResult  {
	static lastId = 0;
	id : number;
	attacks: Map<AttackResult, ActorChange<ValidAttackers>[]> = new Map();
	escalationMod: number = 0;
	costs: ActorChange<ValidAttackers>[] = [];
	sounds: {sound: ValidSound, timing: "pre" | "post"}[] = [];
	globalOtherEffects: OtherEffect[] = [];

	constructor(atkResult ?: AttackResult | null) {
		this.id = ++CombatResult.lastId;
		if (atkResult) {
			this.attacks.set(atkResult, []);
			// this.attackResults.push(atkResult);
		}
	}

	finalize(): FinalizedCombatResult {
		return new FinalizedCombatResult(this);
	}

	findEffects<T extends OtherEffect["type"]>(effectType: T): (OtherEffect & {type:T})[] {
		const arr = [] as (OtherEffect & {type:T})[];
		for (const v of this.attacks.values()) {
			for (const eff of v.flatMap(chg => chg.otherEffects) ) {
				if (eff.type == effectType)
					{arr.push( eff as OtherEffect & {type:T});}
			}
		}
		for (const eff of this.costs.flatMap(chg => chg.otherEffects) ) {
			if (eff.type == effectType)
				{arr.push( eff as OtherEffect & {type:T});}
		}
		return arr;
	}


	addSound(sound: ValidSound, timing: this["sounds"][number]["timing"]) {
		this.sounds.push({sound, timing});
	}

	#getDamageCalc(cons: NewDamageConsequence, situation: Situation, effect: U<ActorChange<ValidAttackers>>) : U<DamageCalculation> {
		if (!effect) {return undefined;}
		let damageType = cons.damageType;
		if (damageType == "by-power") {
			if (!situation.usedPower) {
				PersonaError.softFail("Can't get situation: Used Power for determining damage type");
				return undefined;
			}
			if (!situation.attacker) {
				PersonaError.softFail("Can't get situation: attacker for determining damage type");
				return undefined;
			}
			const power = PersonaDB.findItem(situation.usedPower);
			if (power.isSkillCard()) {
				PersonaError.softFail("Skill Cards can't do damage");
				return undefined;
			}
			const attacker = PersonaDB.findActor(situation.attacker);
			if (!attacker) {
				PersonaError.softFail("Can't get attacker");
				return undefined;

			}
			damageType = power.getDamageType(attacker);
		}
		let damageCalc : DamageCalculation;
		if (damageType == undefined) {
			// eslint-disable-next-line no-debugger
			debugger;
			PersonaError.softFail("Damage Type is undefined on this consequence", cons, effect, situation);
			return undefined;
		}
		if (effect.damage[damageType]) {
			damageCalc = effect.damage[damageType]!;
		} else {
			damageCalc =  new DamageCalculation(damageType);
			effect.damage[damageType] = damageCalc;
		}
		return damageCalc;
	}

	#getEffect(target: ValidAttackers | undefined) : U<ActorChange<ValidAttackers>> {
		if (target) {
			return {
				actor: target.accessor,
				otherEffects: [],
				damage: {},
				addStatus: [],
				removeStatus: [],
			};
		}
		return undefined;
	}

	private addEffect_damage(
		cons: Readonly<ConsequenceProcessed["consequences"][number]["cons"]> & {type : "combat-effect", combatEffect:"damage"},
		situation: Situation,
		effect: ActorChange<ValidAttackers>,
		target: ValidAttackers,
	) {
		if (!target) {return;}
		switch  (cons.damageSubtype) {
			case "set-to-percent":
			case "set-to-const": {
				if (!effect) {return;}
				const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons);
				const amount = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, situation);
				if (amount == undefined) {
					PersonaError.softFail("Can't resolve Consequence Amount.", cons.amount);
					return;
				}
				effect.otherEffects.push( {
					type: "set-hp",
					subtype: cons.damageSubtype,
					value: amount,
				});
				break;
			}
			case "constant":
				// eslint-disable-next-line no-fallthrough
			default: {
				if (cons.amount != undefined && typeof cons.amount == "object") {
					const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons as typeof cons & {amount: ConsequenceAmount});
					const amount = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, situation);
					if (amount == undefined) {
						PersonaError.softFail(`ConsAmount is undefiend in Damage Effect ${cons.damageSubtype} of ${cons.realSource?.name}`);
						return;
					}
					cons = {
						...cons,
						amount : amount,
					};
				}
				const damageCalc = this.#getDamageCalc(cons, situation, effect);
				if (!damageCalc) {break;}
				damageCalc.addConsequence(cons, target);
				break;
			}
		}
	}

	 private addEffect_combatEffect( cons: Readonly<ConsequenceProcessed["consequences"][number]["cons"]> & {type: "combat-effect"}, effect: ActorChange<ValidAttackers>, target: U<ValidAttackers>, situation: Readonly<Situation>) {
			if (!target && situation.target) {
				 target = PersonaDB.findActor(situation.target);
			}
			switch (cons.combatEffect) {
				 case "damage":
						if (!effect || !target) {break;}
						this.addEffect_damage(cons, situation, effect, target);
						break;
				 case "addStatus": {
						if (!effect || !target) {break;}

					 let status_damage : number | undefined = undefined;
					 if (situation.attacker && situation.usedPower &&  cons.statusName == "burn") {
						 const power = PersonaDB.findItem(situation.usedPower);
						 if (power.system.type == "skillCard") {
							 PersonaError.softFail("Skill Card shouldn't be here");
							 break;
						 }
						 const attacker = PersonaDB.findActor(situation.attacker);
						 status_damage = attacker
							 ? (power as Usable)
							 .damage.getBurnDamage(power as Usable, attacker.persona(), target.persona())
							 : 0;
					 }
					 const id = cons.statusName;
					 if (id != "bonus-action") {
						 if (!target) {
							 PersonaError.softFail(`No Target for ${id}`);
							 break;
						 }
						 const duration = convertConsToStatusDuration(cons, target);
						 if (effect.addStatus.find( st => st.id == id && PersonaAE.durationLessThanOrEqualTo(duration, st.duration))) {
							 break;
						 }
						 effect.addStatus.push({
							 id,
							 potency: Math.abs(status_damage ?? cons.amount ?? 0),
							 duration,
						 });
					 }
					 break;
				 }
				case "removeStatus": {
					if (!effect) {break;}
					// const id = cons.statusName;
					const actor = PersonaDB.findActor(effect.actor);
					for (const id of multiCheckToArray(cons.statusName)) {
						if (actor.hasStatus(id)) {
							effect.removeStatus.push({
								id,
							});
						}
					}
					break;
				}
				case "extraAttack": {
					if (!effect) {break;}
					effect.otherEffects.push({
						type: "extra-attack",
						maxChain: cons.amount ?? 1,
						iterativePenalty: -Math.abs(cons.iterativePenalty ?? 0),
					});
					break;
				}
				case "extraTurn": {
					if (situation.usedPower) {
						const power = PersonaDB.findItem(situation.usedPower);
						if (power.isOpener()) {break;}
						if (power.isTeamwork()) {break;}
					}
					if (!effect) {break;}
					const combat = game.combat as PersonaCombat;
					if (!combat || combat.isSocial || combat.lastActivationRoll == undefined) {break;}
					effect.otherEffects.push({
						type: "extraTurn",
						activation: combat.lastActivationRoll
					});
					break;
				}
				case "scan":
					if (!effect) {break;}
					effect.otherEffects.push( {
						type: cons.combatEffect,
						level: cons.amount ?? 1,
						downgrade: cons.downgrade ?? false,
					});
					break;
				case "auto-end-turn":
					if (!effect) {break;}
					effect.otherEffects.push(cons);
					break;
				case "alter-theurgy": {
					if (!effect) {break;}
					const amount = ConsequenceAmountResolver.resolveConsequenceAmount(cons.amount ?? 0, situation) ?? 0;
					effect.otherEffects.push( {
						type: cons.combatEffect,
						subtype: cons.subtype,
						amount,
					});
					break;
				}
				case "alter-energy": {
					if (!effect) {break;}
					const amount = ConsequenceAmountResolver.resolveConsequenceAmount(cons.amount ?? 0, situation) ?? 0;
					effect.otherEffects.push( {
						type: cons.combatEffect,
						amount,
					});
					break;
				}
				case "apply-recovery":
					effect.otherEffects.push( {
						type: cons.combatEffect,
					});
					break;
				default:
					cons satisfies never;
			}
	 }

	async addEffect(atkResult: AttackResult | null | undefined, target: ValidAttackers | undefined, cons: Readonly<ConsequenceProcessed["consequences"][number]["cons"]>, situation : Readonly<Situation>) {
		if (!target && situation.target) {
			target = PersonaDB.findActor(situation.target);
		}
		const effect = this.#getEffect(target);
		switch (cons.type) {
			case "none":
				break;
			case "expend-item": {
				const item = cons.source;
				if (!effect) {
					const msg=`Can't expend item ${item?.name ?? "Unknown Item"} due to no effect present in combat result`;
					PersonaError.softFail(msg, item, cons);
					break;
				}
				if (! (item instanceof PersonaItem)) {
					const msg = "Illegal target for expend item";
					PersonaError.softFail(msg, item, cons);
					break;
				}
				if( !(item.isConsumable() || item.isSkillCard())) {
					const msg = "Illegal target for expend item";
					PersonaError.softFail(msg, item, cons);
					break;
				}
				const itemAcc =  item.accessor;
				effect.otherEffects.push( {
					type: "expend-item",
					itemAcc,
				});
				break;
			}
			case "expend-slot": {
				console.warn("Expend slot is unused and does nnothing");
				break;
			}
			case "modifier":
			case "modifier-new":
			case "raise-resistance":
			case "lower-resistance":
			case "raise-status-resistance":
				break;
			case "add-power-to-list":
			case "add-talent-to-list":
				break;
			case "other-effect":
				break;
			case "set-flag": {
				if (!effect) {break;}
				// const target = PersonaDB.findActor(situation.target);
				const dur = convertConsToStatusDuration(cons, target!);
				let embeddedEffects: readonly SourcedConditionalEffect[]= [];
				const source = cons.source;
				if (cons.flagState && cons.applyEmbedded && source && "getEmbeddedEffects" in source && source.getEmbeddedEffects != undefined) {
					const owner = cons.owner ? PersonaDB.findActor(cons.owner) : null;
					embeddedEffects = source.getEmbeddedEffects(owner);
				}
				effect.otherEffects.push( {
					type: "set-flag",
					flagId: cons.flagId ?? "",
					flagName: cons.flagState ? cons.flagName ?? "" : "",
					state: cons.flagState ?? true,
					duration: dur,
					embeddedEffects,
					clearOnDeath: cons.flagState ? cons.clearOnDeath : false,
				} satisfies SetFlagEffect);
				break;
			}
			case "inspiration-cost": {
				if (!effect) {break;}
				const socialTarget = getSocialLinkTarget(cons.socialLinkIdOrTarot, situation, undefined);
				if (!socialTarget) {break;}
				effect.otherEffects.push( {
					type: "inspiration-cost",
					amount: cons.amount ?? 1,
					linkId: socialTarget.id,
				});
				break;
			}
			case "display-msg":
				if (effect) {
					effect.otherEffects.push( {
						type: "display-message",
						newChatMsg: cons.newChatMsg ?? false,
						msg: cons.msg ?? "",
					});
				} else {
					this.globalOtherEffects.push({
						type: "display-message",
						newChatMsg: cons.newChatMsg ?? false,
						msg: cons.msg ?? "",
					});
				}
				break;
			case "use-power":  {
				if (!effect) {break;}
				if (!cons.actorOwner) {
					PersonaError.softFail("No actor owner for usepower ability");
					break;
				}
				effect.otherEffects.push( {
					newAttacker:  cons.actorOwner,
					type: cons.type,
					powerId : cons.powerId,
					target: cons.target,
				});
				break;
			}
			case "social-card-action": {
				//must be executed playerside as event execution is a player thing
				const otherEffect : Sourced<SocialCardActionConsequence> = {
					...cons
				};
				await SocialActionExecutor.execSocialCardAction(otherEffect, situation);
				if (!effect) {break;}
				effect.otherEffects.push( otherEffect);
				break;
			}
			case "dungeon-action":
				this.globalOtherEffects.push( {
					...cons
				});
				break;
			case "alter-mp":
				if (!effect) {break;}
				effect.otherEffects.push( {
					type: cons.type,
					amount: cons.amount ?? 0,
					subtype: cons.subtype
				});
				break;
			case "teach-power":
				if (!effect) {break;}
				effect.otherEffects.push( {
					...cons
				});
				break;
			case "add-creature-tag":
				break;
			case "combat-effect":
				if (!effect) {break;}
				this.addEffect_combatEffect(cons, effect, target, situation);
				// effect.otherEffects.push(cons);
				break;
			case "alter-fatigue-lvl":
				if (!effect) {break;}
				effect.otherEffects.push(cons);
				break;
			case "alter-variable": {
				const alterVarCons = {
					...cons,
					situation: situation,
				};
				if (cons.varType == "social-temp") {
					//social stuff must be executed player side
					if (cons.operator == "set-range") {
						const otherEffect : Sourced<SocialCardActionConsequence> & {cardAction: "set-temporary-variable"} = {
							...cons,
							type: "social-card-action",
							cardAction: "set-temporary-variable",
						};
						await SocialActionExecutor.execSocialCardAction(otherEffect, situation);
					}
					if (cons.operator != "set-range") {
						const amount = this.resolveConsequenceAmount(cons, situation, "value");
						const otherEffect : Sourced<SocialCardActionConsequence> & {cardAction: "set-temporary-variable"} = {
							...cons,
							type: "social-card-action",
							cardAction: "set-temporary-variable",
							variableId: cons.variableId,
							operator: cons.operator,
							value: amount,
						};
						await SocialActionExecutor.execSocialCardAction(otherEffect, situation);
					}
					break;
				}
				if (target) {
					effect?.otherEffects.push(alterVarCons);
				} else {
					this.globalOtherEffects.push(alterVarCons);
				}
				break;
			}
			case "perma-buff":
				if (!effect) {break;}
				effect.otherEffects.push(cons);
				break;
			case"gain-levels":
				if (!effect) {break;}
				effect.otherEffects.push(cons);
				break;
			case "play-sound":
				this.globalOtherEffects.push(cons);
				break;
			case "cancel":
				this.globalOtherEffects.push(cons);
				break;
			case "inventory-action": {
				if (!effect) {break;}
				const amount = this.resolveConsequenceAmount(cons, situation);
				if (cons.invAction == "add-card-item") {
					const treasureItem = "cardEventItem" in situation ? situation.cardEventItem : undefined;
						if (!treasureItem) {break;}
						effect.otherEffects.push( {
							...cons,
							amount,
							treasureItem,
						});
						break;
					}
				if (cons.invAction != "add-treasure") {
					const resolvedCons = {
						...cons,
						amount,
					};
					effect.otherEffects.push( resolvedCons);
				} else {
					const sourced2=  ConsequenceAmountResolver.extractSourcedFromField(cons, "treasureLevel");
					const treasureLevel = ConsequenceAmountResolver.resolveConsequenceAmount(sourced2, situation) ?? 0;
					const resolvedCons = {
						...cons,
						amount,
						treasureLevel,
					};
					effect.otherEffects.push( resolvedCons);
				}

				break;
			}
			case "set-roll-result":
				this.globalOtherEffects.push(cons);
				break;
			default: {
				cons satisfies never;
				throw new Error("Should be unreachable");
			}
		}
		if (!effect) {return;}
		if (atkResult == null) {
			CombatResult.mergeChanges(this.costs, [effect]);
			return;
		}
		if (!this.attacks.has(atkResult)) {
			this.attacks.set(atkResult, []);
		}
		const effects = this.attacks.get(atkResult)!;
		CombatResult.mergeChanges(effects, [effect]);
	}

	resolveConsequenceAmount<T extends Sourced<object> & {[K in S]: ConsequenceAmount}, S extends string = "amount">(cons: T, situation: Situation, field: S | "amount" = "amount") {
		const sourced = ConsequenceAmountResolver.extractSourcedFromField(cons, field as S);
		const amount = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, situation) ?? 1;
		return amount;
	}

	merge(...others: CombatResult[]) {
		for (const other of others) {
			this.escalationMod += other.escalationMod;
			CombatResult.mergeChanges( this.costs, other.costs);
			for (const [atkResult, changeArr] of other.attacks.entries()) {
				const myRes = this.attacks.get(atkResult);
				if (myRes) {
					CombatResult.mergeChanges(myRes, changeArr);
				} else {
					this.attacks.set(atkResult, changeArr);
				}
			}
			this.globalOtherEffects = this.globalOtherEffects.concat(other.globalOtherEffects);
		}
	}

	static mergeChanges(mainEffects: ActorChange<ValidAttackers>[], newEffects: ActorChange<ValidAttackers>[]) {
		for (const newEffect of newEffects) {
			const entry = mainEffects.find( change => PersonaDB.accessorEq(change.actor, newEffect.actor));
			if (!entry) {
				mainEffects.push(newEffect);
			} else {
				const index = mainEffects.indexOf(entry);
				mainEffects[index] = CombatResult.combineChanges(entry, newEffect);
			}
		}
	}

	getOtherEffects(actor : ValidAttackers): OtherEffect[] {
		const acc = actor.accessor;
		return Array
			.from(this.attacks.values())
			.flat()
			.filter(x => PersonaDB.accessorEq(x.actor, acc) && x.otherEffects.length > 0)
			.flatMap( x=> x.otherEffects);
	}


	emptyCheck(debug = false) : CombatResult | undefined {
		if (debug) {
			Debug(this);
		}
		const attacks = Array.from(this.attacks.entries());
		if (this.escalationMod == 0 && this.costs.length == 0 && attacks.length ==0 && this.globalOtherEffects.length == 0) {return undefined;}
		return this;
	}

	async toMessage(...args: Parameters<FinalizedCombatResult["toMessage"]>) : ReturnType<FinalizedCombatResult["toMessage"]> {
		const finalized = this.finalize();
		return finalized.toMessage(...args);
	}

	async autoApplyResult(): ReturnType<FinalizedCombatResult["autoApplyResult"]> {
		const finalized = this.finalize();
		return finalized.autoApplyResult();
	}

	/** combines other's data into initial*/
	static combineChanges (initial: ActorChange<ValidAttackers>, other: ActorChange<ValidAttackers>) : ActorChange<ValidAttackers> {
		return {
			actor: initial.actor,
			damage: this.combineDamage(initial.damage, other.damage),
			addStatus : initial.addStatus.concat(other.addStatus),
			removeStatus : initial.removeStatus.concat(other.removeStatus),
			otherEffects: initial.otherEffects.concat(other.otherEffects)
		};
	}

	/** note this is a destructive merge, original will be changed */
	static combineDamage( original: ActorChange<ValidAttackers>["damage"], b: ActorChange<ValidAttackers>["damage"]) : ActorChange<ValidAttackers>["damage"] {
		const ret = {...original}; // copy this to prevent changes
		for (const k of Object.keys(ret)) {
			const key = k as keyof typeof ret;
			if (DAMAGETYPES[key] == undefined) {continue;}
			const bDamage = b[key];
			if (!bDamage) {continue;}
			const aDamage = ret[key]!;
			if (!bDamage.isMergeable(aDamage)) {
				PersonaError.softFail("Unmergable value, this shoudln't hapepn", original, b);
				// eslint-disable-next-line no-debugger
				debugger;
			}
			aDamage.merge(bDamage);
		}
		for (const k of Object.keys(b)) {
			const key = k as keyof typeof ret;
			if (DAMAGETYPES[key] == undefined) {continue;}
			const aDamage = ret[key];
			if (aDamage) {continue;} //already handled if its already in a;
			ret[key] = b[key];
		}
		return ret;
	}

	get power() : UsableAndCard | undefined {
		for (const atkResult of this.attacks.keys()) {
			if (atkResult.power) {
				try {
					return PersonaDB.findItem(atkResult.power);
				} catch {
					continue;
				}
			}
		}
		return undefined;
	}

}

export interface ActorChange<T extends PersonaActor> {
	actor: UniversalActorAccessor<T>;
	damage: Partial<Record<NonNullable<DamageCalculation["damageType"]>, DamageCalculation>>;
	addStatus: StatusEffect[],
	otherEffects: OtherEffect[]
	removeStatus: Pick<StatusEffect, "id">[],
}


export type AttackResult = {
	result: keyof typeof ATTACK_RESULT,
	ailmentRange: {low: number, high: number} | undefined;
	instantKillRange: U<{low: number, high:number}>;
	defenseValue?: number,
	hitWeakness?: boolean,
	hitResistance?: boolean,
	validAtkModifiers ?: string[],
	validDefModifiers ?: string[],
	target: UniversalTokenAccessor<PToken>,
	attacker: UniversalTokenAccessor<PToken>,
	power: UniversalItemAccessor<UsableAndCard>,
	situation: Situation & RollSituation,
	roll: RollBundle | null ,
	critRange: U<{low: number, high:number}>;
	// critBoost: number,
	// critPrintable?: string []
};


function resolveStatusDurationAnchor (anchor: ConsequenceTarget, atkResult: AttackResult) : UniversalActorAccessor<ValidAttackers> | null {
	if (!anchor) {
		anchor = "target";
	}
	let accessor : UniversalTokenAccessor<PToken> | undefined;
	const situation = atkResult.situation;
	switch (anchor) {
		case "target":
			accessor = atkResult.target;
			break;
		case "owner":
			console.warn("Using owner in status duration anchors is unsupported and just resolves to 'user'");
		// eslint-disable-next-line no-fallthrough
		case "user": {
			const userAcc = atkResult.situation.user;
			if (userAcc)
				{return userAcc;}
			PersonaError.softFail("Can't resolve user for status Duration anchor");
			return null;
		}
		case "attacker":
			accessor = atkResult.attacker;
			break;
		case "triggering-character":
			if ("triggeringCharacter" in situation && situation.triggeringCharacter) {
				return situation.triggeringCharacter;
			}
			PersonaError.softFail("Can't resolve triggering Character for status Duration anchor");
			return null;
		case "cameo":
			if ("cameo" in situation && situation.cameo) {
				const actor = PersonaDB.findActor(situation.cameo);
				if (actor && actor.isValidCombatant()) {return actor.accessor;}
				return null;
			}
			break;
		case "all-allies":
		case "all-foes":
		case "all-in-region":
			PersonaError.softFail(`${anchor} not supported as a status anchor`);
			return null;
		case "navigator": {
			const nav = PersonaDB.getNavigator();
			return nav ? nav.accessor : null;
		}
		default:
			anchor satisfies never;
			return null;
	}
	if (accessor) {
		const token = PersonaDB.findToken(accessor);
		return token?.actor?.accessor;
	}
	PersonaError.softFail("Odd error in resolving Status Anchor");
	return null;
}

function convertConsToStatusDuration(cons: Consequence & ({type : "set-flag"} | {type: "combat-effect", combatEffect:"addStatus"}) , atkResultOrActor: AttackResult | ValidAttackers) : StatusDuration {
	const dur = cons.statusDuration;
	switch (dur) {
		case "X-rounds":
		case "X-days":
		case "3-rounds":
			return {
				dtype: dur,
				amount: cons.amount ?? 3,
			};
		case "expedition":
		case "combat":
		case "permanent":
		case "instant":
			return {
				dtype: dur,
			};
		case "save":
			return {
				dtype: "save",
				saveType: cons.saveType ?? "normal",
			};
		case "save-easy":
		case "presave-easy":
			return {
				dtype: "save",
				saveType: "easy",
			};
		case "save-normal":
		case "presave-normal":
			return {
				dtype: "save",
				saveType: "normal",
			};
		case "save-hard":
		case "presave-hard":
			return {
				dtype: "save",
				saveType: "hard",
			};
		case "UEoNT":
		case "USoNT":
		case "UEoT": {
			if (atkResultOrActor instanceof PersonaActor) {
				return {
					dtype: dur,
					actorTurn: atkResultOrActor.accessor
				};
			}
			const anchorHolder = resolveStatusDurationAnchor(cons.durationApplyTo!, atkResultOrActor);
			//this isn't necessarily target, it has to be  determined by who the anchor is
			if (anchorHolder)  {
				return {
					dtype: dur,
					actorTurn: anchorHolder,
				};
			}
			if (!anchorHolder) {
				PersonaError.softFail(`Can't coinvert consequence ${cons.type}`, atkResultOrActor);
			}
		}
			break;
		case "anchored":
			PersonaError.softFail("Anchored shouldn't happen here");
			return {
				dtype: "instant",
			};
		case "X-exploration-turns":
			return {
				dtype: "X-exploration-turns",
				amount: cons.amount ?? 3,
			};
		default:
			dur satisfies never;
	}
	PersonaError.softFail(`Invaliud Duration ${dur as string}`, cons);
	return {dtype: "instant"};
}

export type ResistResult =  {
	resist: boolean,
	absorb: boolean,
	block: boolean,
}
