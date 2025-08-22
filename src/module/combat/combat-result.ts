import { DAMAGETYPES } from "../../config/damage-types.js";
import { FinalizedCombatResult } from "./finalized-combat-result.js";
import { ConsequenceProcessed } from "./persona-combat.js";
import { DamageConsequence } from "../../config/consequence-types.js";
import { OldDamageConsequence } from "../../config/consequence-types.js";
import { DamageCalculation } from "./damage-calc.js";
import { RollSituation } from "../../config/situation.js";
import { UsableAndCard } from "../item/persona-item.js";
import { ValidAttackers } from "./persona-combat.js";
import { StatusDuration } from "../active-effect.js";
import { getSocialLinkTarget } from "../preconditions.js";
import { Consequence } from "../../config/consequence-types.js";
import { SocialCardActionConsequence } from "../../config/consequence-types.js";
import { OtherEffect } from "../../config/consequence-types.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { PersonaSocial } from "../social/persona-social.js";
import { ValidSound } from "../persona-sounds.js";
import { PersonaError } from "../persona-error.js";
import { Usable } from "../item/persona-item.js";
import { PToken } from "./persona-combat.js";
import { RollBundle } from "../persona-roll.js";
import { PersonaCombat } from "./persona-combat.js";
import { PersonaDB } from "../persona-db.js";
import { PersonaActor } from "../actor/persona-actor.js";

declare global {
	interface SocketMessage {
		"COMBAT_RESULT_APPLY" : {resultObj : string; sender: User["id"];}
		"COMBAT_RESULT_APPLIED": CombatResult["id"];
	}
}

export class CombatResult  {
	// _finalized : boolean = false;
	// static pendingPromises: Map< CombatResult["id"], Function> = new Map();
	// tokenFlags: {
	// 	actor: UniversalActorAccessor<PersonaActor>,
	// 		effects: OtherEffect[]
	// }[] = [] ;
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

	// static addPending(res: CombatResult): Promise<unknown> {
	// 	const promise = new Promise(
	// 		(resolve, reject) => {
	// 			this.pendingPromises.set(res.id, resolve);
	// 			setTimeout( () => {
	// 				reject("Timeout");
	// 				this.pendingPromises.delete(res.id);
	// 			}	, 16000);
	// 		});
	// 	return promise;

	// }

	// static resolvePending( resId: CombatResult["id"]) {
	// 	const resolver = this.pendingPromises.get(resId);
	// 	if (!resolver) throw new Error(`No Resolver for ${resId}`);
	// 	resolver();
	// 	this.pendingPromises.delete(resId);
	// }


	findEffects<T extends OtherEffect["type"]>(effectType: T): (OtherEffect & {type:T})[] {
		let arr = [] as (OtherEffect & {type:T})[];
		for (const v of this.attacks.values()) {
			for (const eff of v.flatMap(chg => chg.otherEffects) ) {
				if (eff.type == effectType)
					arr.push( eff as OtherEffect & {type:T});
			}
		}
		for (const eff of this.costs.flatMap(chg => chg.otherEffects) ) {
			if (eff.type == effectType)
				arr.push( eff as OtherEffect & {type:T});
		}
		return arr;
	}


	addSound(sound: ValidSound, timing: this["sounds"][number]["timing"]) {
		this.sounds.push({sound, timing});
	}

	// calcDamageMult(change :ActorChange<ValidAttackers>, mult : number) {
	// 	change.hpchangemult = CombatResult.calcHpChangeMult(change.hpchangemult, mult);
	// }

	// static calcHpChangeMult(origValue: number, mult: number): number {
	// 	if (!PersonaSettings.get("damageMult")) {
	// 		return origValue *= mult;
	// 	}
	// 	switch (true) {
	// 		case origValue == 0:
	// 			return 0;
	// 		case mult == 1:
	// 			return origValue;
	// 		case mult == 0:
	// 			return 0;
	// 		case mult == -1:
	// 			return origValue *= -1;
	// 		case mult <0:
	// 			PersonaError.softFail("calcDamageMult doesn't handle values less than 0 that aren't -1");
	// 			break;
	// 		case mult > 1:
	// 			mult -= 1;
	// 			return origValue += mult;
	// 		case mult < 1:
	// 			return origValue *= mult;
	// 			// mult = 1 - mult;
	// 			// origValue -= mult;
	// 			// return Math.max(0, origValue);
	// 		default:
	// 			PersonaError.softFail(`Odd value for damage multiplier :${mult}`);
	// 			break;
	// 	}
	// 			return origValue;
	// }

	#getDamageCalc(cons: OldDamageConsequence | DamageConsequence, atkResult: U<AttackResult>, effect: U<ActorChange<ValidAttackers>>  ) : U<DamageCalculation> {
		if (!effect) return undefined;
		let damageType = cons.damageType;
		if (damageType == "by-power") {
			if (!atkResult) {
				PersonaError.softFail("Can't get atk Result for determining damage type");
				return undefined;
			}
			const power = PersonaDB.findItem(atkResult.power);
			if (power.isSkillCard()) {
				PersonaError.softFail("Skill Cards can't do damage");
				return undefined;
			}
			const attacker = PersonaDB.findToken(atkResult.attacker).actor;
			if (!attacker) {
				PersonaError.softFail("Can't get attacker");
				return undefined;

			}
			damageType = power.getDamageType(attacker);
		}
		let damageCalc : DamageCalculation;
		if (damageType == undefined) {
			debugger;
			PersonaError.softFail("Damage Type is undefined on this consequence", cons, atkResult, effect);
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

	addEffect(atkResult: AttackResult | null | undefined, target: ValidAttackers | undefined, cons: Readonly<ConsequenceProcessed["consequences"][number]["cons"]>, situation : Readonly<Situation>) {
		const effect = this.#getEffect(target);
		switch (cons.type) {
			case "none":
				break;
			case "damage-new": {
				if (!target) break;
				const damageCalc = this.#getDamageCalc(cons, atkResult ?? undefined, effect);
				if (!damageCalc) break;
				damageCalc.addConsequence(cons, target);
				break;
			}
			case "addStatus": {
				if (!effect) break;
				let status_damage : number | undefined = undefined;
				if (atkResult && cons.statusName == "burn") {
					const power = PersonaDB.findItem(atkResult.power);
					if (power.system.type == "skillCard") {
						PersonaError.softFail("Skill Card shouldn't be here");
						break;
					}
					const attacker = PersonaDB.findToken(atkResult.attacker).actor;
					status_damage = attacker
						? (power as Usable)
						.getDamage(attacker.persona())
						.eval()
						.hpChange ?? 0
						: 0;
				}
				const id = cons.statusName!;
				if (id != "bonus-action") {
					if (!target) {
						PersonaError.softFail(`No Target for ${id}`);
						break;
					}
					effect.addStatus.push({
						id,
						potency: Math.abs(status_damage ?? cons.amount ?? 0),
						duration: convertConsToStatusDuration(cons, atkResult ?? target),
					});
				}
				break;
			}
			case "removeStatus" : {
				if (!effect) break;
				const id = cons.statusName!;
				const actor = PersonaDB.findActor(effect.actor);
				if (actor.hasStatus(id)) {
					effect.removeStatus.push({
						id,
					});
				}
				break;
			}
			case "escalationManipulation" : {
				this.escalationMod += Number(cons.amount ?? 0);
				break;
			}
			case "extraAttack":
				if (!effect) break;
				effect.otherEffects.push({
					type: "extra-attack",
					maxChain: cons.amount ?? 1,
					iterativePenalty: -Math.abs(cons.iterativePenalty ?? 0),
				});
				break;
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
			case "add-escalation":
				break;
			case "save-slot":
				if (!effect) break;
				effect.otherEffects.push({ type: "save-slot"});
				break;
			case "half-hp-cost":
				if (!effect) break;
				effect.otherEffects.push({type: "half-hp-cost"});
				break;
			case "extraTurn": {
				if (atkResult) {
					const power = PersonaDB.findItem(atkResult.power);
					if (power.isOpener()) break;
					if (power.isTeamwork()) break;
				}
				if (!effect) break;
				const combat = game.combat as PersonaCombat;
				if (!combat || combat.isSocial || combat.lastActivationRoll == undefined) break;
				effect.otherEffects.push({
					type: "extraTurn",
					activation: combat.lastActivationRoll
				});
				break;
			}
			case "expend-item":
				if (!effect) break;
				effect.otherEffects.push({
					itemId: cons.itemId,
					type: 	"expend-item",
					itemAcc: cons.itemAcc!
				});
				break;
			case "recover-slot":
				if (!effect) break;
				effect.otherEffects.push( {
					type: "recover-slot",
					slot: cons.slotType!,
					amt: cons.amount ?? 1,
				});
				break;
			case "add-power-to-list":
				break;
			case "other-effect":
				break;
			case "set-flag":
				if (!effect) break;
				const dur = convertConsToStatusDuration(cons, atkResult ?? target!);
				effect.otherEffects.push( {
					type: "set-flag",
					flagId: cons.flagId ?? "",
					flagName: cons.flagName ?? "",
					state: cons.flagState ?? true,
					duration: dur,
				});
				break;
			case "inspiration-cost": {
				let situation: Situation | undefined = atkResult?.situation;
				if (!effect) break;
				if (!situation) {
					situation = {
						user: effect.actor,
						target: effect.actor,
					};
				}
				const socialTarget = getSocialLinkTarget(cons.socialLinkIdOrTarot, situation, null);
				if (!socialTarget) break;
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
				if (!effect) break;
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
			case "scan":
				if (!effect) break;
				effect.otherEffects.push( {
					type: cons.type,
					level: cons.amount ?? 1,
				});
				break;
			case "social-card-action":
				//must be executed playerside as event execution is a player thing
				if (!effect) break;
				const otherEffect : SocialCardActionConsequence = {
					...cons
				};
				PersonaSocial.execSocialCardAction(otherEffect);
				effect.otherEffects.push( otherEffect);
				break;
			case "dungeon-action":
				this.globalOtherEffects.push( {
					...cons
				});
				break;
			case "alter-energy":
				if (!effect) break;
				effect.otherEffects.push( {
					type: cons.type,
					amount: cons.amount ?? 0,
				});
				break;
			case "alter-mp":
				if (!effect) break;
				effect.otherEffects.push( {
					type: cons.type,
					amount: cons.amount ?? 0,
					subtype: cons.subtype
				});
				break;
			case "teach-power":
				if (!effect) break;
				effect.otherEffects.push( {
					...cons
				});
				break;
			case "add-creature-tag":
				break;
			case "combat-effect":
				if (!effect) break;
				effect.otherEffects.push(cons);
				break;
			case "alter-fatigue-lvl":
				if (!effect) break;
				effect.otherEffects.push(cons);
				break;
			case "alter-variable":
				const alterVarCons = {
					...cons,
					contextList: PersonaCombat.createTargettingContextList(situation, cons),
				}
				effect?.otherEffects.push(alterVarCons);
				break;
			case "perma-buff":
				if (!effect) break;
				effect.otherEffects.push(cons);
				break;
			case "play-sound":
				this.globalOtherEffects.push(cons);
				break;
			default: {
				cons satisfies never;
				throw new Error("Should be unreachable");
			}
		}
		if (!effect) return;
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

	merge(other: CombatResult) {
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
			.flatMap( x=> x.otherEffects)
	}


	emptyCheck(debug = false) : CombatResult | undefined {
		if (debug) {
			Debug(this);
			debugger;
		}
		const attacks = Array.from(this.attacks.entries());
		if (this.escalationMod == 0 && this.costs.length == 0 && attacks.length ==0 && this.globalOtherEffects.length == 0) return undefined;
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

	async print(): Promise<void> {
		const signedFormatter = new Intl.NumberFormat("en-US", {signDisplay : "always"});
		let msg = "";
		if (this.escalationMod) {
			msg += `escalation Mod: ${signedFormatter.format(this.escalationMod)}`;
		}
	}




	/** combines other's data into initial*/
	static combineChanges (initial: ActorChange<ValidAttackers>, other: ActorChange<ValidAttackers>) : ActorChange<ValidAttackers> {
		return {
			actor: initial.actor,
			damage: this.combineDamage(initial.damage, other.damage),
			// hpchange: absMax(initial.hpchange, other.hpchange),
			// damageType : initial.damageType == "none" ? other.damageType : initial.damageType,
			// hpchangemult: CombatResult.calcHpChangeMult(initial.hpchangemult, other.hpchangemult),
			addStatus : initial.addStatus.concat(other.addStatus),
			removeStatus : initial.removeStatus.concat(other.removeStatus),
			// expendSlot : initial.expendSlot.map( (x,i)=> x + other.expendSlot[i]) as [number, number, number, number],
			otherEffects: initial.otherEffects.concat(other.otherEffects)
		};
	}

	/** note this is a destructive merge, original will be changed */
	static combineDamage( original: ActorChange<ValidAttackers>["damage"], b: ActorChange<ValidAttackers>["damage"]) : ActorChange<ValidAttackers>["damage"] {
		const ret = {...original}; // copy this to prevent changes
		for (const k of Object.keys(ret)) {
			const key = k as keyof typeof ret;
			if (DAMAGETYPES[key] == undefined) continue;
			const bDamage = b[key];
			if (!bDamage) continue;
			const aDamage = ret[key]!;
			if (!bDamage.isMergeable(aDamage)) {
				PersonaError.softFail("Unmergable value, this shoudln't hapepn", original, b);
				debugger;
			}
			aDamage.merge(bDamage);
		}
		for (const k of Object.keys(b)) {
			const key = k as keyof typeof ret;
			if (DAMAGETYPES[key] == undefined) continue;
			const aDamage = ret[key];
			if (aDamage) continue; //already handled if its already in a;
			ret[key] = b[key];
		}
		return ret;
	}

	get power() : UsableAndCard | undefined {
		for (const atkResult of this.attacks.keys()) {
			if (atkResult.power) {
				return PersonaDB.findItem(atkResult.power);
			}
		}
		return undefined;
	}

}




export interface ActorChange<T extends PersonaActor> {
	actor: UniversalActorAccessor<T>;
	damage: Partial<Record<DamageCalculation["damageType"], DamageCalculation>>;
	// hpchange: number;
	// damageType: RealDamageType;
	// hpchangemult: number;
	addStatus: StatusEffect[],
	otherEffects: OtherEffect[]
	removeStatus: Pick<StatusEffect, "id">[],
	// expendSlot: [number, number, number, number];
}


export type AttackResult = {
	result: "hit" | "miss" | "crit" | "reflect" | "block" | "absorb",
	ailmentRange: {low: number, high: number} | undefined;
	defenseValue?: number,
	hitWeakness?: boolean,
	hitResistance?: boolean,
	validAtkModifiers?: [number, string][],
	validDefModifiers?: [number, string][],
	target: UniversalTokenAccessor<PToken>,
	attacker: UniversalTokenAccessor<PToken>,
	power: UniversalItemAccessor<UsableAndCard>,
	situation: Situation & RollSituation,
	roll: RollBundle | null ,
	critBoost: number,
	printableModifiers: {name: string, modifier:string} [],
	critPrintable?: {name: string, modifier:string} []
};


function resolveStatusDurationAnchor (anchor: (Consequence & {type : "addStatus" | "set-flag"})["durationApplyTo"], atkResult: AttackResult) : UniversalActorAccessor<ValidAttackers> | null {
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
		case "user":
			const userAcc=  atkResult.situation.user;
			if (userAcc)
				return userAcc;
			PersonaError.softFail("Can't resolve user for status Duration anchor");
			return null;
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
				if (actor && actor.isValidCombatant()) return actor.accessor;
				return null;
			}
		case "all-allies":
		case "all-foes":
		case "all-in-region":
			PersonaError.softFail(`${anchor} not supported as a status anchor`);
			return null;
		default:
			anchor satisfies never;
			return null;
	}
	if (accessor) {
		const token = PersonaDB.findToken(accessor)!;
		return token?.actor?.accessor!;
	}
	PersonaError.softFail("Odd error in resolving Status Anchor");
	return null;
}

function convertConsToStatusDuration(cons: Consequence & {type : "addStatus" | "set-flag"}, atkResultOrActor: AttackResult | ValidAttackers) : StatusDuration {
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
			}
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
		case "UEoT":
			if (atkResultOrActor instanceof PersonaActor) {
				return {
					dtype: dur,
					actorTurn: atkResultOrActor.accessor
				};
			}
			const anchorHolder = resolveStatusDurationAnchor(cons.durationApplyTo, atkResultOrActor);
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
			PersonaError.softFail(`Invaliud Duration ${dur}`);
			return {dtype: "instant"};
	}
}

export type ResistResult =  {
	resist: boolean,
	absorb: boolean,
	block: boolean,
}
