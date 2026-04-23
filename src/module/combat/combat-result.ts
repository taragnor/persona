import { DAMAGETYPES } from "../../config/damage-types.js";
import { FinalizedCombatResult } from "./finalized-combat-result.js";
import { ConsequenceProcessed } from "./persona-combat.js";
import { ConsequenceAmount, LocalEffect, NewDamageConsequence } from "../../config/consequence-types.js";
import { DamageCalculation } from "./damage-calc.js";
import { PersonaItem} from "../item/persona-item.js";
import { checkSituationProp, getSocialLinkTarget, multiCheckToArray } from "../preconditions.js";
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
import {ATTACK_RESULT} from "../../config/attack-result-config.js";
import {PersonaAE, StatusDuration} from "../persona-ae.js";

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
  globalLocalEffects: Sourced<LocalEffect>[] = [];
  activationRoll: U<number>;


	constructor(atkResult ?: AttackResult | null) {
		this.id = ++CombatResult.lastId;
		if (atkResult) {
			this.attacks.set(atkResult, []);
		}
	}

	finalize(): FinalizedCombatResult {
		return new FinalizedCombatResult(this);
	}

	findEffects<T extends Sourced<OtherEffect | LocalEffect>["type"]>(effectType: T): (Sourced<OtherEffect | LocalEffect> & {type:T})[] {
		const arr = [] as (Sourced<OtherEffect | LocalEffect> & {type:T})[];
		for (const v of this.attacks.values()) {
			for (const eff of v.flatMap(chg => chg.otherEffects) ) {
				if (eff.type == effectType)
					{arr.push( eff as Sourced<OtherEffect> & {type:T});}
			}
		}
		for (const eff of this.costs.flatMap(chg => chg.otherEffects) ) {
			if (eff.type == effectType)
				{arr.push( eff as Sourced<OtherEffect> & {type:T});}
		}
    for (const eff of this.globalLocalEffects) {
			if (eff.type == effectType)
				{arr.push( eff as Sourced<LocalEffect> & {type:T});}
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
			if (!("usedPower" in situation) || !situation.usedPower) {
				PersonaError.softFail("Can't get situation => Used Power for determining damage type", situation);
				return undefined;
			}
			if (!("attacker" in situation) || !situation.attacker) {
				PersonaError.softFail("Can't get situation => attacker for determining damage type");
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
        localEffects: []
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
          ...cons,
          amount,
          //fix to other effects
					// type: "set-hp",
					// subtype: cons.damageSubtype,
					// value: amount,
				});
				break;
			}
			case "constant":
			default: {
				if (cons.amount != undefined && typeof cons.amount == "object") {
					const sourced = ConsequenceAmountResolver.extractSourcedAmount(cons as typeof cons & {amount: ConsequenceAmount});
					const amount = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, situation);
					if (amount == undefined) {
            const realSource = cons.realSource ? PersonaDB.find(cons.realSource) : undefined;
						PersonaError.softFail(`ConsAmount is undefiend in Damage Effect ${cons.damageSubtype} of ${realSource?.name ?? "No Real Source"}`);
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
    if (!target && checkSituationProp(situation, "target")) {
      const sitTarget = PersonaDB.findActor<PersonaActor>(situation.target);
      if (sitTarget.isValidCombatant()) {
        target = sitTarget;
      }
    }
    switch (cons.combatEffect) {
      case "damage":
        if (!effect || !target) {break;}
        this.addEffect_damage(cons, situation, effect, target);
        break;
      case "addStatus": {
        this.addEffect_combatEffect_addStatus(cons, effect, target, situation);
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
        if (!effect) {
          PersonaError.softFail("No effect to extra attack, can't iadd");
          break;
        }
        effect.otherEffects.push({
          ...cons,
        });
        break;
      }
      case "extraTurn": {
        if (checkSituationProp(situation, "usedPower")) {
          const user = situation.user ? PersonaDB.findActor(situation.user) : null;
          const power = PersonaDB.findItem(situation.usedPower);
          if (power.isOpener(user)) {break;}
          if (power.isTeamwork()) {break;}
        }
        if (!effect) {break;}
        const combat = game.combat as PersonaCombat;
        if (!combat || combat.isSocial) {break;}
        if (effect.addStatus.some( x=> x.id =="bonus-action")) {
          break;
        }
        effect.addStatus.push({
          id: "bonus-action",
          duration: {
            dtype:  "UEoT",
            actorTurn: effect.actor,
          },
        });
        break;
      }
      case "scan":
        if (!effect) {break;}
        effect.otherEffects.push( {
          ...cons,
          // type: cons.combatEffect,
          amount: cons.amount ?? 1,
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
          ...cons,
          amount,
          // type: cons.combatEffect,
          // subtype: cons.subtype,
          // amount,
        });
        break;
      }
      case "alter-energy": {
        if (!effect) {break;}
        let amount = ConsequenceAmountResolver.resolveConsequenceAmount(cons.amount ?? 0, situation) ?? 0;
        if (amount> 0) {
          const situation = {
            user: effect.actor,
          };
          const actor = PersonaDB.findActor(effect.actor);
          const mult = actor.basePersona.getBonuses("energy-gained-multiplier").total(situation, "percentage");
          amount *= mult;
        }
        effect.otherEffects.push( {
          ...cons,
          amount,
        });
        break;
      }
      case "apply-recovery":
        effect.otherEffects.push( {
          ...cons,
          // type: cons.combatEffect,
        });
        break;
      case "set-cooldown":
        effect.otherEffects.push( cons);
        break;
      case "add-power-tag-to-attack":
        break;
      default:
        cons satisfies never;
    }
  }

  addEffect(atkResult: AttackResult | null | undefined, target: ValidAttackers | SocialLink | undefined, cons: Readonly<ConsequenceProcessed["consequences"][number]["cons"]>, situation : Readonly<Situation>) {
    if (target == undefined && checkSituationProp(situation, "target")) {
      target = PersonaDB.findActor<ValidAttackers | SocialLink>(situation.target);
    }
    const effect = target && target.isValidCombatant() ? this.#getEffect(target): undefined;
    switch (cons.type) {
      case "none":
        break;
      case "expend-item": {
        const item = cons.source ? PersonaDB.find(cons.source) : undefined;
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
        // const itemAcc =  item.accessor;
        effect.otherEffects.push( {
          ...cons,
          // type: "expend-item",
          // itemAcc,
        });
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
        if (!effect || !target || !target.isValidCombatant()) {break;}
        try {
          if (cons.flagState) {
            const duration = convertConsToStatusDuration(cons, target, situation);
            effect.otherEffects.push( {
              ...cons,
              duration,
            });
          } else {
            effect.otherEffects.push( {
              ...cons,
            });
          }
        } catch (e) {
          PersonaError.softFail(`Problem converting set Flag duration: ${cons?.flagId ?? "unknown Flag Id" }`, e);
        }
        break;
      }
      case "inspiration-cost": {
        if (!effect) {break;}
        const socialTarget = getSocialLinkTarget(cons.socialLinkIdOrTarot, situation, undefined);
        if (!socialTarget) {break;}
        effect.otherEffects.push( {
          ...cons,
          linkId: socialTarget.id,
          // type: "inspiration-cost",
          // amount: cons.amount ?? 1,
        });
        break;
      }
      case "display-msg":
        if (effect && !cons.newChatMsg) {
          effect.otherEffects.push( {
            ...cons,
            // type: "display-message",
            newChatMsg: false,
            // msg: cons.msg ?? "",
          });
        } else {
          this.globalOtherEffects.push({
            ...cons,
            // type: "display-message",
            newChatMsg: true,
            // msg: cons.msg ?? "",
          });
        }
        break;
      case "use-power":  {
        if (!effect) {break;}
        if (!cons.owner) {
          PersonaError.softFail("No actor owner for usepower ability");
          break;
        }
        effect.otherEffects.push( {
          ...cons,
        });
        break;
      }
      case "social-card-action": {
        //must be executed playerside as event execution is a player thing
        // await SocialActionExecutor.execSocialCardAction(cons);
        // if (!effect) {break;}
        if ("amount" in cons) {
          const sourced=  ConsequenceAmountResolver.extractSourcedFromField(cons, "amount");
          const amount = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, situation) ?? 1;
          if ("socialLinkIdOrTarot" in cons) {
            const socialTarget = getSocialLinkTarget(cons.socialLinkIdOrTarot, situation, undefined);
            if (!socialTarget)  {
              PersonaError.softFail(`Couldn't resolve social target $cons.socialLinkIdOrTarot}`, cons);
              break;
            }
            this.globalLocalEffects.push( {
              __localEffect: true,
              ...cons,
              amount,
              linkId: socialTarget.id,
            });
          } else {
            this.globalLocalEffects.push( {
              __localEffect: true,
              ...cons,
              amount,
            });
          }
        } else {
          this.globalLocalEffects.push( {
            __localEffect : true,
            ...cons
          });
        }
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
          ...cons,
          // type: cons.type,
          // amount: cons.amount ?? 0,
          // subtype: cons.subtype
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
        if (!effect || !target || !target.isValidCombatant()) {break;}
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
        if (alterVarCons.varType == "social-temp") {
          //social stuff must be executed player side
          if (cons.operator == "set-range") {
            const localEffect : Sourced<LocalEffect> & {cardAction: "set-temporary-variable"} = {
              ...cons,
              __localEffect : true,
              type: "social-card-action",
              cardAction: "set-temporary-variable",
            };
            this.globalLocalEffects.push( localEffect);
            // await SocialActionExecutor.execSocialCardAction(otherEffect, situation);
          } else {
            const amount = this.resolveConsequenceAmount(cons, situation, "value");
            const localEffect : Sourced<LocalEffect> & {cardAction: "set-temporary-variable"} = {
              ...cons,
              __localEffect: true,
              type: "social-card-action",
              cardAction: "set-temporary-variable",
              variableId: cons.variableId,
              operator: cons.operator,
              value: amount,
            };
            this.globalLocalEffects.push(localEffect);
            // await SocialActionExecutor.execSocialCardAction(otherEffect, situation);
          }
          break;
        }
        if ("value" in alterVarCons) {
          const value = this.resolveConsequenceAmount(alterVarCons, situation, "value");
          if (target) {
            effect?.otherEffects.push({
              ...alterVarCons,
              value,
            });
          } else {
            this.globalOtherEffects.push({
              ... alterVarCons,
              value,
            });
          }

        } else {
          if (target) {
            effect?.otherEffects.push(alterVarCons);
          } else {
            this.globalOtherEffects.push(alterVarCons);
          }
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
          } satisfies OtherEffect);
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
      this.activationRoll = this.activationRoll && this.activationRoll > 0 ? this.activationRoll : other.activationRoll;
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
		return await finalized.emptyCheck()?.autoApplyResult() ?? true;
	}

	/** combines other's data into initial*/
	static combineChanges (initial: ActorChange<ValidAttackers>, other: ActorChange<ValidAttackers>) : ActorChange<ValidAttackers> {
		return {
			actor: initial.actor,
			damage: this.combineDamage(initial.damage, other.damage),
			addStatus : initial.addStatus.concat(other.addStatus),
			removeStatus : initial.removeStatus.concat(other.removeStatus),
			otherEffects: initial.otherEffects.concat(other.otherEffects),
      localEffects: initial.localEffects.concat(other.localEffects),
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

  addEffect_combatEffect_addStatus(  cons: Readonly<ConsequenceProcessed["consequences"][number]["cons"]> & {type: "combat-effect", combatEffect:"addStatus"}, effect: ActorChange<ValidAttackers>, target: U<ValidAttackers>, situation: Readonly<Situation>) {
    if (!effect || !target) {return;}
    let status_damage : number | undefined = undefined;
    if ("attacker" in situation && "usedPower" in situation && situation.attacker && situation.usedPower &&  cons.statusName == "burn") {
      const power = PersonaDB.findItem(situation.usedPower);
      if (power.isSkillCard()) {
        PersonaError.softFail("Skill Card shouldn't be here");
        return;
      }
      const attacker = PersonaDB.findActor(situation.attacker);
      status_damage = attacker
        ? power.damage.getBurnDamage(power, attacker.persona(), target.persona())
        : 0;
    }
    const id = cons.statusName;
    if (id != "bonus-action") {
      if (!target) {
        PersonaError.softFail(`No Target for ${id}`);
        return;
      }
      try {
        const duration = convertConsToStatusDuration(cons, target, situation);
        if (effect.addStatus.find( st => st.id == id && PersonaAE.durationLessThanOrEqualTo(duration, st.duration))) {
          return;
        }
        effect.addStatus.push({
          id,
          potency: Math.abs(status_damage ?? cons.potency ?? 1),
          duration,
        });
      } catch (e) {
        PersonaError.softFail(`Problem converting status Flag duration: ${cons.statusName ?? "unknown Status Id" }`, e);
      }
    }

  }
}

export interface ActorChange<T extends PersonaActor> {
	actor: UniversalActorAccessor<T>;
	damage: Partial<Record<NonNullable<DamageCalculation["damageType"]>, DamageCalculation>>;
	addStatus: StatusEffect[],
	otherEffects: (Sourced<OtherEffect>)[],
	removeStatus: Pick<StatusEffect, "id">[],
  localEffects: Sourced<LocalEffect>[],
}


export type AttackResult = {
	result: keyof typeof ATTACK_RESULT,
	defenseValue?: number,
	hitWeakness?: boolean,
	hitResistance?: boolean,
	validAtkModifiers ?: string[],
	validDefModifiers ?: string[],
	target: N<UniversalTokenAccessor<PToken>>,
	attacker: N<UniversalTokenAccessor<PToken>>,
	power: UniversalItemAccessor<UsableAndCard>,
	situation: HasKey<SituationComponent.Roll, "resisted">,
	roll: RollBundle | null ,
	ailmentRange: U<{low: number, high: number}>
	instantKillRange: U<{low: number, high:number}>;
	critRange: U<{low: number, high:number}>;
  activationRoll?: number;
};

// function resolveStatusDurationAnchor (anchor: ConsequenceTarget, atkResult: AttackResult) : UniversalActorAccessor<ValidAttackers> | null {
// 	if (!anchor) {
// 		anchor = "target";
// 	}
// 	let accessor : UN<UniversalTokenAccessor<PToken>>;
// 	const situation = atkResult.situation;
// 	switch (anchor) {
// 		case "target":
// 			accessor = atkResult.target;
// 			break;
// 		case "owner":
// 			console.warn("Using owner in status duration anchors is unsupported and just resolves to 'user'");
// 		// eslint-disable-next-line no-fallthrough
// 		case "user": {
// 			const userAcc = atkResult.situation.user;
// 			if (userAcc)
// 				{return userAcc;}
// 			PersonaError.softFail("Can't resolve user for status Duration anchor");
// 			return null;
// 		}
// 		case "attacker":
// 			accessor = atkResult.attacker;
// 			break;
// 		case "triggering-character":
// 			if ("triggeringCharacter" in situation && situation.triggeringCharacter) {
// 				return situation.triggeringCharacter;
// 			}
// 			PersonaError.softFail("Can't resolve triggering Character for status Duration anchor");
// 			return null;
// 		case "cameo":
// 			if ("cameo" in situation && situation.cameo) {
// 				const actor = PersonaDB.findActor(situation.cameo);
// 				if (actor && actor.isValidCombatant()) {return actor.accessor;}
// 				return null;
// 			}
// 			break;
// 		case "all-allies":
// 		case "all-foes":
// 		case "all-in-region":
//     case "pc-party":
// 			PersonaError.softFail(`${anchor} not supported as a status anchor`);
// 			return null;
// 		case "navigator": {
// 			const nav = PersonaDB.getNavigator();
// 			return nav ? nav.accessor : null;
// 		}
// 		default:
// 			anchor satisfies never;
// 			return null;
// 	}
// 	if (accessor) {
// 		const token = PersonaDB.findToken(accessor);
// 		return token?.actor?.accessor;
// 	}
// 	PersonaError.softFail("Odd error in resolving Status Anchor");
// 	return null;
// }

function convertConsToStatusDuration(cons: SourcedConsequence & ({type : "set-flag", flagState: true} | {type: "combat-effect", combatEffect:"addStatus"}) , atkResultOrActor: AttackResult | ValidAttackers, situation : Situation) : StatusDuration {
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
        if (!cons.durationApplyTo) {
          PersonaError.softFail(`No duration apply to provided for status`);
          return {
            dtype: dur,
            actorTurn: atkResultOrActor.accessor
          };
        }
        const actor = PersonaCombat.solveEffectiveTargetsForce(cons.durationApplyTo, situation, cons).at(0);
        if (!actor) {
          PersonaError.softFail(`Can't find actor for actorTurn property in Status, defaulting to user`);
          const actorTurn = "user" in situation
            ? situation.user
            : "triggeringCharacter" in situation
            ? situation.triggeringCharacter
            : undefined;
          if (!actorTurn) {
            PersonaError.softFail(`Can't find actor for actorTurn property in Status, defaulting to instant Status`);
            return {dtype: "instant"};
          }
          return {
            dtype: dur,
            actorTurn: actorTurn,
          };
          //TODO: need to bail here
        }
        return {
          dtype: dur,
          actorTurn: actor.accessor,
        };
      }
      PersonaError.softFail(`Can't coinvert consequence ${cons.type}`, atkResultOrActor);
      break;
    }
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
