/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { RollBundle } from "../persona-roll.js";
import { PersonaCombat } from "./persona-combat.js";
import { PToken } from "./persona-combat.js";
import { PersonaSockets } from "../persona.js";
import { PersonaError } from "../persona-error.js";
import { EvaluatedDamage } from "./damage-calc.js";
import { LocalEffect, StatusEffect } from "../../config/consequence-types.js";
import { PersonaActor } from "../actor/persona-actor.js";

import { CombatResult } from "./combat-result.js";
import { AttackResult } from "./combat-result.js";
import { OtherEffect } from "../../config/consequence-types.js";
import { ValidSound } from "../persona-sounds.js";
import { PersonaDB } from "../persona-db.js";
import { ActorChange } from "./combat-result.js";
import {SocketsNotConnectedError, TimeoutError, VerificationFailedError} from "../utility/socket-manager.js";
import {RealDamageType} from "../../config/damage-types.js";
import {CombatOutput} from "./combat-output.js";
import {ConsequenceApplier} from "./consequence-applier.js";
import {PersonaSFX} from "./persona-sfx.js";
import {TriggeredEffect} from "../triggered-effect.js";
import {sleep} from "../utility/async-wait.js";
import {LocalEffectCombatResult} from "./local-effect-combat-result.js";

const SAFETY_SLEEP_DURATION = 750 as const;
const DELAY_FOR_UPDATES_TO_GET_THERE_FIRST = 25 as const;

export class FinalizedCombatResult {
	static pendingPromises: Map< CombatResult["id"], (val: unknown) => void> = new Map();
	tokenFlags: {
		actor: UniversalActorAccessor<PersonaActor>,
			effects: OtherEffect[]
	}[] = [] ;
	id : number;
	attacks: ResolvedAttackResult[] = [];
	costs: ResolvedActorChange<ValidAttackers>[] = [];
	sounds: {sound: ValidSound, timing: "pre" | "post"}[] = [];
	globalOtherEffects: OtherEffect[] = [];
	chainedResults: FinalizedCombatResult[]= [];
  globalLocalEffects: Sourced<LocalEffect>[] = [];
  activationRoll: number;

	constructor( cr: CombatResult | null) {
		if (cr == null ) {return;}
		this.#finalize(cr);
	}

	static fromJSON(json: string) : FinalizedCombatResult {
		const x = JSON.parse(json) as FinalizedCombatResult;
		const ret = new FinalizedCombatResult(null);
		ret.attacks = x.attacks;
		ret.costs = x.costs;
		ret.tokenFlags = x.tokenFlags;
		ret.globalOtherEffects = x.globalOtherEffects;
		ret.id = x.id;
		ret.chainedResults = x.chainedResults.map( subresult=> FinalizedCombatResult.fromJSON(JSON.stringify(subresult)));
    ret.globalLocalEffects = x.globalLocalEffects;
    ret.activationRoll = x.activationRoll;
		return ret;
	}

	toJSON() : string {
		const obj = {
			attacks: this.attacks,
			costs: this.costs,
			tokenFlags: this.tokenFlags,
			globalOtherEffects : this.globalOtherEffects,
			id: this.id,
			chainedResults: this.chainedResults,
      globalLocalEffects: this.globalLocalEffects,
      activationRoll: this.activationRoll,
		};
		const json = JSON.stringify(obj);
		return json;
	}

	emptyCheck(debug = false) : this | undefined {
		if (debug) {
			Debug(this);
			// eslint-disable-next-line no-debugger
			debugger;
		}
		switch (true) {
			case this.attacks.length > 0:
			case this.costs.length > 0:
			case this.globalOtherEffects.length > 0:
			case this.sounds.length > 0:
			case this.chainedResults.length > 0:
			case this.globalLocalEffects.length > 0:
				return this;
		}
		return undefined;
	}

	static changeIsEmpty( change: ResolvedActorChange<ValidAttackers>) : boolean {
		return change.addStatus.length == 0
			&& change.damage.length == 0
			&& change.otherEffects.length == 0
			&& change.removeStatus.length == 0;
	}

	#evaluateDamage (dmg : ActorChange<ValidAttackers>["damage"]) : EvaluatedDamage[] {
		const dmgArr = Object.values(dmg)
			.map( v=> v.eval());
		return dmgArr.filter( damage => damage.hpChange != 0)
		;
	}

	#resolveActorChange (change : ActorChange<ValidAttackers>) : ResolvedActorChange<ValidAttackers> {
		const damage = this.#evaluateDamage(change.damage);

		const resolved : ResolvedActorChange<ValidAttackers> = {
			actor: change.actor,
			damage : damage,
			addStatus: change.addStatus,
			otherEffects: change.otherEffects,
			removeStatus: change.removeStatus,
      localEffects: change.localEffects,
		};
		return resolved;
	}

	#finalize(cr: CombatResult): void {
		const attacks  = Array.from(cr.attacks.entries()).map(
			([atkRes, change]) => {
				const changes = change.map( change => {
					return this.#resolveActorChange(change);
				});
				return {
					atkResult: atkRes,
					changes,
				} satisfies ResolvedAttackResult;
			});
		this.attacks = attacks;
		for (const atk of this.attacks) {
			atk.changes = atk.changes
				.filter (chg => !FinalizedCombatResult.changeIsEmpty(chg));
		}
		this.id = cr.id;
		this.costs = cr.costs
		.map( cost=> this.#resolveActorChange(cost))
		.filter( cost => !FinalizedCombatResult.changeIsEmpty(cost));
		this.globalOtherEffects = cr.globalOtherEffects;
    this.globalLocalEffects = cr.globalLocalEffects;
		this.sounds = cr.sounds;
    this.activationRoll = cr.activationRoll ?? -1;
	}

	addFlag(actor: PersonaActor, flag: OtherEffect) {
		const item = this.tokenFlags.find(x=> x.actor.actorId ==  actor.accessor.actorId );
		if (!item) {
			this.tokenFlags.push({
				actor: actor.accessor,
				effects: [flag]
			});
		} else {
			if (!item.effects.includes(flag))
			{item.effects.push(flag);}
		}
	}

	hasFlag(actor: PersonaActor, flag: OtherEffect["type"]) : boolean{
		return Boolean(this.tokenFlags.find(x=> x.actor.actorId == actor.id)?.effects.find( eff=> eff.type == flag));
	}

	clearFlags() {
		this.tokenFlags = [];
	}

	async toMessage( header: string) : Promise<boolean>;
	async toMessage( effectName: string, initiator: U<PersonaActor>) : Promise<boolean>;
	async toMessage( effectNameOrHeader: string, initiator?: U<PersonaActor>) : Promise<boolean> {
		let initiatorToken : PToken | undefined;
		if (game.combat) {
			initiatorToken = initiator ? PersonaCombat.getPTokenFromActorAccessor(initiator.accessor) : undefined;
		}
		const output = new CombatOutput(this, initiatorToken);
		try {
			const completedWithoutError = await this.autoApplyResult();
			void output.renderMessage(effectNameOrHeader, initiator, {error: !completedWithoutError});
			return completedWithoutError;
		} catch (e) {
			const html = await output.generateHTML(effectNameOrHeader, initiator);
			const rolls : RollBundle[] = this.attacks
				.flatMap( (attack) => attack.atkResult.roll? [attack.atkResult.roll] : []);
			PersonaError.softFail("Error with automatic result application", e, this, html);
			await ChatMessage.create( {
				speaker: {
					scene: initiatorToken?.parent?.id ?? initiator?.token?.parent.id,
					actor: initiatorToken?.actor?.id ?? initiator?.id,
					token:  initiatorToken?.id,
					alias: initiatorToken?.name ?? "System",
				},
				rolls: rolls.map( rb=> rb.roll),
				content: "ERROR WITH APPLYING COMBAT RESULT",
				user: game.user,
				style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			}, {});
			return false;
		}
	}

  async autoApplyResult() : Promise<boolean> {
    try {
      const locals = this.extractLocalEffects();
      await locals.execute();
    } catch (e) {
      PersonaError.softFail(e);
    }
    if (game.user.isGM) {
      return await this.autoApplyResult_GM();
    } else {
      return await this.autoApplyResult_PC();
    }
  }

  private extractLocalEffects() : LocalEffectCombatResult {
    const globalLocal = this.globalLocalEffects;
    this.globalLocalEffects = [];
    //TODO: go through actor changes and separaet them, deleting local effects from actor changes,
      const actorChanges : [PersonaActor["accessor"], Sourced<LocalEffect>[]] [] = [];
    for (const atk of this.attacks) {
      const localEffects = atk.changes.map(chg => [chg.actor, chg.localEffects] as (typeof actorChanges)[number]);
      actorChanges.push( ...localEffects);
      atk.changes.forEach( chg => chg.localEffects = []);
    }
    return new LocalEffectCombatResult(globalLocal, actorChanges);
  }

  private async autoApplyResult_PC() :Promise<boolean> {
    const gmTarget = game.users.find(x=> x.isGM && x.active);
    if (!gmTarget) {
      throw new PersonaError("Can't apply no GM connected");
    }
    const sendObj = {
      resultObj : this.toJSON(),
      sender: game.user.id,
    };
    try {
      await PersonaSockets.verifiedSend("COMBAT_RESULT_APPLY", sendObj, gmTarget.id);
      await sleep(SAFETY_SLEEP_DURATION); //make sure all data is recorded on server
      return true;
    }
    catch (e) {
      switch (true) {
        case e instanceof TimeoutError: {
          PersonaError.softFail( "Timeout Error from Server", e);
          return false;
        }
        case e instanceof VerificationFailedError :{
          PersonaError.softFail( "Verification Error on the GM computer", e);
          return false;
        }
        case e instanceof SocketsNotConnectedError: {
          PersonaError.softFail( "Network Sockets not connected", e);
          return false;
        }
        default:
          PersonaError.softFail( "Something went wrong with sending combat result", e);
          return false;
      }
    }
  }

  private async autoApplyResult_GM() : Promise<boolean> {
    const power = this.power;
    const attacker = this.attacker;
    try {
      if (power && attacker) {
        void PersonaSFX.onUsePowerStart(this.power, attacker);
      }
      await this.#apply();
      await sleep(DELAY_FOR_UPDATES_TO_GET_THERE_FIRST);
      return true;
    } catch (e) {
      PersonaError.softFail("Problem with GM apply",e);
      Debug(e);
      Debug(this);
      return false;
    }
  }

	static async applyHandler(x: SocketMessage["COMBAT_RESULT_APPLY"]) : Promise<void> {
		const {resultObj} = x;
		const result = FinalizedCombatResult.fromJSON(resultObj);
		await result.#apply();
	}

	async applyButtonTrigger() {
		return this.#apply();
	}

	async #apply(): Promise<void> {
		try {
			await this.#processAttacks();
			await this.#applyCosts();
			await this.#applyGlobalOtherEffects();
			this.#onUsePowerTriggered();
			await this.#applyChained();
		} catch (e) {
			PersonaError.softFail("Trouble executing combat result", e, this);
		}
	}

	hasCancelRequest() : boolean {
		return this.globalOtherEffects.some(
			eff => eff.type == "cancel"
		);
	}

	async #applyChained() {
		for (const res of this.chainedResults) {
			await res.#apply();
		}
	}

	getAttackData(atkResult: AttackResult) : {attacker: PToken, target: PToken, power: UsableAndCard} {
		const {attacker, target, power} = atkResult;
		const attackerToken = PersonaDB.findToken(attacker!);
		const targetToken = PersonaDB.findToken(target!);
		const powerItem = PersonaDB.findItem(power);
		return {
			attacker: attackerToken,
			target : targetToken,
			power: powerItem,
		};
	}

	getTokenChangeTargetToken(change : ResolvedActorChange<ValidAttackers>) : U<PToken> {
		if (change.actor.token) {
			return PersonaDB.findToken(change.actor.token) as PToken;
		}
	return undefined;
	}

	async #processAttacks() {
		for (const {atkResult, changes} of this.attacks ) {
			const {attacker, target, power}  = this.getAttackData(atkResult);
			await PersonaSFX.onUsePowerOn(power, attacker, target, atkResult.result);
			// TimeLog.log(`Finished Executing Special Effect for ${power.name} on ${target.name}`);
			for (const change of changes) {
				const chained = await ConsequenceApplier.applyActorChange(change, power, atkResult.attacker!);
				this.addChained(...chained);
			}
		}
	}

  addChained( ...otherResults : U<FinalizedCombatResult>[]) : this {
    const results= otherResults
      .filter(res => res != undefined)
      .filter( res=> res.emptyCheck());
    this.chainedResults.push(...results);
    return this;
  }

	compressChained() : this {
		for (const chain of this.chainedResults) {
			chain.compressChained();
			this.attacks.push(...chain.attacks);
			this.globalOtherEffects.push(...chain.globalOtherEffects);
			this.costs.push(...chain.costs);
			this.sounds.push(...chain.sounds);
			this.tokenFlags.push(...chain.tokenFlags);
      this.globalLocalEffects.push(...chain.globalLocalEffects);
		}
		this.chainedResults = [];
		return this;
	}

	async #applyCosts() {
		const power = this.power && !this.power.isSkillCard() ? this.power : undefined;
		for (const cost of this.costs) {
			const chained= await ConsequenceApplier.applyActorChange(cost, power);
			this.addChained(...chained);
		}
	}

	async #applyGlobalOtherEffects() {
		for (const eff of this.globalOtherEffects) {
			await ConsequenceApplier.applyGlobalEffect(eff);
		}
	}

	#onUsePowerTriggered() {
		const attacker = this.attacker;
		const power = this.power;
		if (!attacker && this.attacks.length > 0) {
			console.log("Not running onUse power since no attacker");
			Debug(this);
			return;
		}
		if (!power && this.attacks.length > 0) {
			console.log("Not running onUse power since no power");
			Debug(this);
			return;
		}
		if ((!attacker || !power)) {
			return;
		}
		const situation : Situation = {
			trigger: 'on-use-power',
			user: attacker.actor.accessor,
			attacker: attacker.actor.accessor,
			usedPower: power.accessor,
			triggeringCharacter : this.attacker.actor.accessor,
			triggeringUser: game.user,
			combatResult: this,
		};
		const trigg= (TriggeredEffect.onTrigger('on-use-power', attacker.actor, situation)).finalize();
		this.addChained(trigg);
	}


	get power() : UsableAndCard | undefined {
		for (const {atkResult} of this.attacks) {
			if (atkResult.power) {
        try {
				return PersonaDB.findItem(atkResult.power);
        } catch {
          return undefined;
        }
			}
		}
		return undefined;
	}

	get attacker() : U<PToken> {
		for (const {atkResult} of this.attacks) {
			if (atkResult.attacker) {
				const combat = PersonaCombat.combat;
				if (!combat) {
					return PersonaDB.findToken(atkResult.attacker);
				}
				const comb = combat.findCombatant(atkResult.attacker);
				if (!comb) {return PersonaDB.findToken(atkResult.attacker);}
				return comb.token;
			}
		}
		return undefined;
	}

	findEffects<T extends OtherEffect["type"]>(effectType: T): (OtherEffect & {type:T})[] {
		const arr = [] as (OtherEffect & {type:T})[];
		for (const v of this.attacks) {
			for (const eff of v.changes.flatMap(chg => chg.otherEffects) ) {
				if (eff.type == effectType)
				{arr.push( eff as Sourced<OtherEffect> & {type:T});}
			}
		}
		for (const eff of this.costs.flatMap(chg => chg.otherEffects) ) {
			if (eff.type == effectType)
			{arr.push( eff as Sourced<OtherEffect> & {type:T});}
		}
		return arr;
	}
}

export interface ResolvedActorChange<T extends PersonaActor> {
  actor: UniversalActorAccessor<T>;
  damage: EvaluatedDamage[];
  addStatus: StatusEffect[];
  otherEffects: Sourced<OtherEffect>[];
  removeStatus: Pick<StatusEffect, "id">[];
  localEffects: Sourced<LocalEffect>[];
}

interface ResolvedAttackResult<T extends ValidAttackers = ValidAttackers> {
	atkResult: AttackResult;
	changes: ResolvedActorChange<T>[];

}

Hooks.on("renderChatMessageHTML", (msg: ChatMessage, htm: HTMLElement) => {
	const html = $(htm);
	const flag = msg.getFlag("persona", "atkResult") as string;
	if (!flag) {
		html.find(".applyChanges").each( function () { this.remove();});
	}
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	html.find(".applyChanges").on("click", async () => {
		const flag = msg.getFlag("persona", "atkResult") as string;
		if (!flag) {throw new PersonaError("Can't apply twice");}
		if (!game.user.isGM) {
			throw new PersonaError("Only GM can click this");
		}
		const res = FinalizedCombatResult.fromJSON(flag);
		await res.applyButtonTrigger();
		await msg.unsetFlag("persona", "atkResult");
	});
});


Hooks.on("socketsReady", () => {
	PersonaSockets.setHandler("COMBAT_RESULT_APPLY", FinalizedCombatResult.applyHandler.bind(CombatResult));
});

Hooks.on("updateActor", (updatedActor : PersonaActor, changes) => {
	//open scan prompt for all players on scan
	if (game.user.isGM) {return;}
	if (updatedActor.system.type == "shadow") {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if (changes?.system?.scanLevel && updatedActor.token) {
			updatedActor.sheet.render(true);
		}
	}
});

declare global {
	interface HOOKS {
		'onAddStatus': (token: PToken, status: StatusEffect) => unknown;
		'onTakeDamage': (token: PToken, amount: number, damageType: RealDamageType)=> unknown;
	}
}

