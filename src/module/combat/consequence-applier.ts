import {LocalEffect, OtherEffect, StatusEffect} from "../../config/consequence-types.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {TreasureSystem} from "../exploration/treasure-system.js";
import {PersonaItem} from "../item/persona-item.js";
import {Metaverse} from "../metaverse.js";
import {NavigatorVoiceLines} from "../navigator/nav-voice-lines.js";
import {StatusDuration} from "../persona-ae.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaVariables} from "../persona-variables.js";
import {SocialActionExecutor} from "../social/exec-social-action.js";
import {TriggeredEffect} from "../triggered-effect.js";
import {EvaluatedDamage} from "./damage-calc.js";
import {FinalizedCombatResult, ResolvedActorChange} from "./finalized-combat-result.js";
import {PersonaAnimation} from "./persona-animations.js";
import {PersonaCombat, PToken} from "./persona-combat.js";
import {PersonaSFX} from "./persona-sfx.js";

export class ConsequenceApplier {

  public static async applyLocalEffect( effect: Sourced<LocalEffect>, actor : N<PersonaActor>) : Promise<void> {
    await PersonaError.asyncErrorWrapper(  () => this._applyLocalEffect(effect, actor));
  }

  private static async _applyLocalEffect( effect: Sourced<LocalEffect>, _actor : N<PersonaActor>) : Promise<void> {
    switch (effect.type) {
      case "social-card-action":
        await SocialActionExecutor.execSocialCardAction(effect);
        break;
      default:
        effect.type satisfies never;
        throw new PersonaError(`Unknown Type ${effect.type as string}`);
    }
  }

  static async applyActorChange (change: ResolvedActorChange<ValidAttackers>, power: U<UsableAndCard>, attacker ?: UniversalTokenAccessor<PToken>) : Promise<FinalizedCombatResult[]> {
    if (!game.user.isGM) {
      throw new PersonaError(`Non-GM ${game.user.name} trying to access the consequence applier`);
    }
    const chained : FinalizedCombatResult[] = [];
    const actor = PersonaDB.findActor(change.actor);
    const token  = change.actor.token ? PersonaDB.findToken(change.actor.token) as PToken: undefined;
    for (const status of change.addStatus) {
      try {
        chained.push(
          ...(await this._applyStatus(status, actor, power, attacker, token))
        );
      } catch (e) {
        PersonaError.softFail(`Error applying status: ${status.id}`, e);
      }
    }
    for (const dmg of change.damage)  {
      try {
        chained.push(...await this._applyDamage(actor, token, dmg, power, attacker));
      } catch (e) {
        PersonaError.softFail(`Error applying Damage to ${actor.name}`, e);
      }
    }
    for (const status of change.removeStatus) {
      await actor.removeStatus(status);
    }
    const mpmult = 1;
    const mutableState =  {
      mpCost: 0,
      theurgy: 0,
    } satisfies MutableActorState;
    for (const otherEffect of change.otherEffects) {
      try {
        await this._applyOtherEffect(actor, token, otherEffect, attacker, mutableState);
      } catch (e) {
        PersonaError.softFail(`Error trying to execute ${otherEffect.type} on ${actor.name}`, e);
      }
    }
    if (mutableState.theurgy != 0 && !actor.isShadow()) {
      await actor.modifyTheurgy(mutableState.theurgy);
    }
    if (mutableState.mpCost != 0 && !actor.isShadow()) {
      mutableState.mpCost *= mpmult;
      await (actor as PC).modifyMP(mutableState.mpCost);
    }
    return chained;
  }

  private static async _applyStatus (status: StatusEffect, actor : ValidAttackers, power: U<UsableAndCard>,  attacker : U<UniversalTokenAccessor<PToken>>, token : U<PToken>) : Promise<FinalizedCombatResult[]> {
    const statusAdd = await actor.addStatus(status);
    void actor.voicelines.onEvent("status-added" , {"statusAdded" : status.id});
    const chained : FinalizedCombatResult[] = [];
    if (statusAdd && attacker && token && power?.isUsableType()) {
      chained.push(...(await this._resolveCombatStatus(token, attacker, status, power))
      );
    }
    if (statusAdd && token) {
      Hooks.callAll("onAddStatus", token, status);
    }
    return chained;
  }

  private static async _resolveCombatStatus(targetToken: PToken, attacker: UniversalTokenAccessor<PToken>, status: StatusEffect, power: U<Usable>) : Promise<FinalizedCombatResult[]> {
    const targetActor = targetToken.actor;
    const chained : FinalizedCombatResult[] = [];
    const attackerActor = PersonaDB.findToken(attacker)?.actor;
    if (!attackerActor) {
      if (status.id == "down") {
        console.log(`Bailing on calling inflict status trigger on ${status.id} due to no attackerActor provided`);
        return [];}
    }
    console.log(`On inflict status: ${status.id} ${targetActor.name}`);
    const sitPartial ={
      target: targetActor.accessor,
      triggeringCharacter: attackerActor.accessor,
      attacker: attackerActor.accessor,
      trigger : "on-inflict-status",
      usedPower: power?.accessor,
      statusEffect: status.id,
      triggeringUser: game.user,
    } as const;
    for (const SitUser of [attackerActor, targetActor]) {
      const situation : Situation =  {
        ...sitPartial,
        triggeringUser: game.user.id,
        user: SitUser.accessor,
      } as const satisfies TriggeredSituation.Select<"on-inflict-status">;
      const eff = (TriggeredEffect.onTrigger(situation, SitUser))
        .finalize()
        .emptyCheck() ;
      if (eff) {
        console.log("Pushing Chained effect after knockdown");
        chained.push(eff);
      }
      if ((status.id == "curse" || status.id == "expel")) {
        const attackerToken = PersonaDB.findToken(attacker);
        chained.push(...await this.#onDefeatOpponent(targetToken, attackerToken));
      }
    }
    return chained;
  }

  private static async _applyDamage(actor: ValidAttackers, token: PToken | undefined, dmg: EvaluatedDamage, power: U<UsableAndCard>, attackerTokenAcc ?: UniversalTokenAccessor<PToken>) : Promise<FinalizedCombatResult[]> {
    const ret : FinalizedCombatResult[] = [];
    if (Number.isNaN(dmg.hpChange)) {
      PersonaError.softFail("NaN damage!");
      return [];
    }
    const attackerToken = PersonaDB.findToken(attackerTokenAcc);
    if (dmg.hpChange == 0) {return [];}
    if (dmg.hpChange < 0) {
      const attacker = attackerToken ? attackerToken.actor.accessor : undefined;
      const actorAcc = actor.accessor;
      const situation =  {
        user: actorAcc,
        usedPower: power?.accessor,
        triggeringCharacter: actorAcc,
        target: actorAcc,
        attacker,
        amt: -dmg.hpChange,
        damageType: dmg.damageType,
        triggeringUser: game.user.id,
      } as const;
      const preDamageSit = {
        ...situation,
        trigger: "pre-take-damage",
      } as const;
      const preCR = (TriggeredEffect.onTrigger(preDamageSit, actor)).finalize();
      if (preCR.hasCancelRequest()) {
        ret.push(preCR);
        return ret;
      }
      const DamageSit= {
        ...situation,
        trigger: "on-damage",
      } as const;
      const CR = (TriggeredEffect .autoTriggerToCR(DamageSit, actor))
        ?.finalize();
      if (CR) { ret.push(CR);}
    }
    if (dmg.hpChange > 0) {
      const combat = PersonaCombat.combat;
      if (combat && !combat.isSocial) {
        await NavigatorVoiceLines.onTargetHeal(actor, combat);
      }
    }
    if (power) {
      PersonaSFX.onDamage(token, dmg.hpChange, dmg.damageType, power);
      if (dmg.hpChange < 0) {
        await actor.voicelines.onEvent("take-damage", {
          usedPower: power.isUsableType() ? power : undefined,
          hpChange: dmg.hpChange,
        });
      }
    }
    if (power && !power.isAoE()) {
      await PersonaSFX.onSingleTargetDamage(token, dmg.hpChange, dmg.damageType, power);
    }
    if (token) {
      Hooks.callAll("onTakeDamage", token, dmg.hpChange, dmg.damageType);
    }
    await actor.modifyHP(dmg.hpChange);
    if (actor.hp <= 0 && token) {
      ret.push(... await this.#onDefeatOpponent(token, attackerToken));
    }
    return ret;
  }

  static async _applyOtherEffect(actor: ValidAttackers, _token: PToken | undefined, otherEffect: Sourced<OtherEffect>, attacker : U<UniversalTokenAccessor<PToken>>, mutableState: MutableActorState): Promise<void> {
    switch (otherEffect.type) {
      case "expend-item": {
        if (!otherEffect.source) {
          PersonaError.softFail(`No item source type to expend`);
          return;
        }
        const item = PersonaDB.find(otherEffect.source);
        if (!item) {
          PersonaError.softFail(`Couldn't find personal Item to expend`);
          return;
        }
        if (item instanceof PersonaItem && item.isCarryableType()) {
          // const item = PersonaDB.find(otherEffect.source);
          if ( item.parent) {
            await item.parent.expendItem(item);
          }
          return;
        }
        break;
      }
      case "set-flag":
        await actor.setEffectFlag(otherEffect);
        break;
      case "other-effect" :
        await this._applyExoticOtherEffect(actor, otherEffect);
        break;
      case "inspiration-cost":
        if (otherEffect.linkId) {
          await actor.social.spendInspiration(otherEffect.linkId, otherEffect.amount);
        }
        break;
      case "use-power":
        break;
      case "dungeon-action":
        await Metaverse.executeDungeonAction(otherEffect);
        break;
      case "alter-mp":
        switch (otherEffect.subtype) {
          case "direct":
            mutableState.mpCost += otherEffect.amount;
            break;
          case "percent-of-total":
            mutableState.mpCost += actor.mmp * (otherEffect.amount / 100);
            break;
          default:
            otherEffect.subtype satisfies never;
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            PersonaError.softFail(`Bad subtype for Alter MP effect : ${otherEffect["subtype"]}`);
        }
        break;
      case "combat-effect":
        await this._applyCombatEffect(otherEffect, actor, mutableState);
        break;
      case "alter-fatigue-lvl":
        await actor.alterFatigueLevel(otherEffect.amount);
        break;

      case "alter-variable": {
        const varCons = otherEffect;
        if (varCons.situation == undefined) {
          PersonaError.softFail("No situation present in variable alteration");
          break;
        }
        await PersonaVariables.alterVariable(varCons, varCons.situation);
        break;
      }
      case "perma-buff":
        await actor.addPermaBuff(otherEffect.buffType, otherEffect.value ?? 0);
        break;
      // case "play-sound":
      //     await PersonaSounds.playFile(otherEffect.soundSrc);
      //   break;
      case "gain-levels": {
        const {gainTarget, value}=  otherEffect;
        if (!value) {
          PersonaError.softFail(`can't award level, value is ${value}`, otherEffect) ;
          break;
        }
        if (gainTarget == "persona" || gainTarget == "both") {
          await actor.persona().gainLevel(value);
        }
        if (gainTarget == "actor" || gainTarget == "both") {
          await actor.gainLevel(value);
        }
        void PersonaSFX.onLevelUp();
        break;
      }
      case "inventory-action":
        await this.resolveInventoryAction(actor, otherEffect);
        break;
      case "trigger-event-cons":
      case "raise-status-resistance":
      case "display-msg":
        break;
      case "sfx":
        this._applySFX(actor, otherEffect, attacker);
        break;
      default:
        otherEffect satisfies never;
    }
  }

  private static _applySFX(actor: ValidAttackers, otherEffect: Sourced<OtherEffect> & {type: "sfx"}, attacker : U<UniversalTokenAccessor<PToken>> ) : void {
    switch (otherEffect.sfxType) {
      case "play-sound":
        PersonaAnimation.queue.addSound(otherEffect);
        break;
      case "play-animation": {
        const attackerTok = attacker ? PersonaDB.findToken(attacker): null;
        PersonaAnimation.queue.addAnimation(actor, attackerTok?.actor ?? null, otherEffect);
        break;
      }
      case "floating-text":
        PersonaAnimation.queue.addFloatingText(actor, otherEffect);
        break;
      default:
        otherEffect satisfies never;
        PersonaError.softFail("Invalid Type of otherEffect SFX type");
        Debug(otherEffect);
    }
  }



  private static async _applyExoticOtherEffect(actor: ValidAttackers, otherEffect: Sourced<OtherEffect> & {type: "other-effect"}) : Promise<void> {
    switch (otherEffect.otherEffect) {
      case "add-talent-to-list":
      case "add-power-to-list":
      case "add-creature-tag":
      case "search-twice":
      case "ignore-surprise":
        return;
      case "add-room-effect": {
        const mod = PersonaDB.getRoomModifiers()
        .find (eff=> eff.id == otherEffect.roomEffectId);
        if (!mod) {
          PersonaError.softFail(`Can't find room effect ${otherEffect.roomEffectId}`, otherEffect);
          return;
        }
        await Metaverse.getRegion()?.addRoomModifier(mod);
        if (PersonaCombat.combat) {
          await PersonaCombat.combat.addRoomEffect(mod);
        }
      }
        return;
      case "teach-power": {
        if (!actor.isPC() && !actor.isNPCAlly()) {
          break;
        }
        const persona = actor.persona();
        if (otherEffect.randomPower == false) {
          const power = PersonaDB.allPowers().get(otherEffect.id);
          if (power) {
            await persona.learnPower(power);
          }
        } else {
          const highest = persona.highestPowerSlotUsable();
          let safetyBreak = 0;
          while (true) {
            const power = TreasureSystem.randomPower(highest);
            if (!power) {break;}
            if (!persona.knowsPowerInnately(power)) {
              await persona.learnPower(power);
              break;
            }
            if (++safetyBreak > 100) {
              PersonaError.softFail("Error trying to add random Power, couldn't find candidate");
              break;
            }
          }
        }
      }
    }
  }

  private static async resolveInventoryAction( actor: PersonaActor,  otherEffect: OtherEffect & {type: "inventory-action"}) : Promise<void> {
    const amount = "amount" in otherEffect && typeof otherEffect.amount == "number" ? otherEffect.amount ?? 1 : 1;
    switch (otherEffect.invAction) {
      case "add-item": {
        const item = PersonaDB.getItemById(otherEffect.itemId);
        if (!item) {
          PersonaError.softFail(`Can't find Item for add-item: ${otherEffect.itemId}`);
          break;
        }
        if (item.isCarryableType()) {
          await actor.addItem(item, amount);
        }
      }
        break;
      case "harvest-crops":
        if (actor.isPC() && actor.farming) {
          await actor.farming.harvestCrops();
        } else {
          ui.notifications.warn(`${actor.name} can't do farming`);
        }
        break;
      case "plant-crops": {
        if (actor.isPC() && actor.farming) {
          await actor.farming.plantCrop(otherEffect.cropId, otherEffect.amount, otherEffect.daysToGrow);
        } else {
          ui.notifications.warn(`${actor.name} can't do farming`);
        }
        break;
      }
      case "add-treasure": {
        const treasureLevel = typeof otherEffect.treasureLevel == "number" ? otherEffect.treasureLevel ?? 0 : 0;
        const treasures = TreasureSystem.generate(treasureLevel, otherEffect.treasureModifier ?? 0, otherEffect.minLevel ?? 0);
        for (const treasure of treasures) {
          await actor.addTreasureItem(treasure);
        }
        break;
      }
      case "remove-item": {
        const item = PersonaDB.getItemById(otherEffect.itemId);
        if (!item) {
          PersonaError.softFail(`Can't find Item for add-item: ${otherEffect.itemId}`);
          break;
        }
        if (!item.isCarryableType()) {
          PersonaError.softFail(`Can't remove non-carryable type: ${item.name}`);
          break;
        }
        await actor.expendItem(item,amount);
        break;
      }
      case "add-card-item":
        await actor.addTreasureItem(otherEffect.treasureItem);
        break;
      default:
        otherEffect satisfies never;
        break;
    }
  }

  static async applyGlobalEffect (eff: Sourced<OtherEffect>) {
    switch (eff.type) {
      case "dungeon-action":
        await Metaverse.executeDungeonAction(eff);
        break;
      // case "play-sound": {
      //   const promise  = PersonaSounds.playFile(eff.soundSrc, eff.volume ?? 1.0);
      //   if (eff.waitUntilFinished) {
      //     await promise;
      //   }
      //   break;
      // }
      case "display-msg": {
        if (!eff.newChatMsg) {break;}
        const html = eff.msg;
        const speaker : Foundry.ChatSpeakerObject = {
          alias: "System"
        };
        await ChatMessage.create( {
          speaker,
          content: html,
          style: CONST?.CHAT_MESSAGE_STYLES.OTHER,
        });
        break;
      }
      case "sfx":
        if (eff.sfxType == "play-sound") {
          PersonaAnimation.queue.addSound(eff);
        }
    }
  }

  static async _applyCombatEffect(effect: OtherEffect & {type: "combat-effect"}, actor: ValidAttackers, mutableState: MutableActorState) {
    switch (effect.combatEffect) {
      case "auto-end-turn":
        if (PersonaCombat.combat
          && actor == game.combat?.combatant?.actor
        ) {
          await PersonaCombat.combat.setForceEndTurn(true);
        }
        break;
      case "alter-energy":
        if (actor.isShadow()) {
          await actor.alterEnergy(effect.amount);
        }
        break;
      case "scan":
        if (actor.isShadow()) {
          if (effect.downgrade == false) {
            await actor.increaseScanLevel(effect.amount);
            const token = PersonaCombat.combat?.getCombatantByActor(actor)?.token;
            if (token) {
              void PersonaSFX.onScan(token as PToken, effect.amount);
            }
          } else {
            await actor.decreaseScanLevel(effect.amount ?? 0);
          }
        }
        break; // done elsewhere for local player

      case "alter-theurgy": {
        const multiplier = actor.persona().getBonuses("theurgy-gain-multiplier").total(actor,"percentage");
        const amt = effect.amount > 0 ? effect.amount * multiplier : effect.amount;
        switch (effect.subtype) {
          case "direct":
            mutableState.theurgy += amt;
            break;
          case "percent-of-total":
            mutableState.theurgy += actor.mmp * (amt / 100);
            break;
          default:
            effect.subtype satisfies never;
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            PersonaError.softFail(`Bad subtype for Alter Theurgy effect : ${effect["subtype"]}`);
        }
        break;
      }
      case "extraTurn":
        break;
      case "damage": {
        switch (effect.damageSubtype) {
          case "set-to-const":
            await actor.setHP(effect.amount);
            break;
          case "set-to-percent": {
            const newhp = effect.amount * actor.mhp;
            await actor.setHP(newhp);
            break;
          }
        }
        break;
      }
      case "addStatus":
      case "removeStatus":
      case "extraAttack":
      case "apply-recovery" :
        await actor.spendRecovery(null);
        break;
        //handled elsewhere by other code
      case "set-cooldown": {
        const power = actor.powers.find( pwr=> pwr.id == effect.powerId);
        if (!power) {
          PersonaError.softFail(`Can't find Power id on ${actor.name}: ${effect.powerId} to apply cooldown`);
          break;
        }
        const duration : StatusDuration = {
          dtype: "X-rounds",
          anchorHolder: undefined,
          amount: Math.clamp(effect.durationRounds -1, 0, 10),
        };
        await actor.addPowerCooldown(power, duration);
        break;
      }
      case "add-power-tag-to-attack":
        //this is handled elsewhere
        break;
      case "escape-combat": {
        const combat = PersonaCombat.combat;
        if (!combat) {break;}
        await combat.removeFromCombat(actor);
        break;
      }
      default:
        effect satisfies never;
        break;
    }
  }

  static async #onDefeatOpponent(target: PToken, attacker ?: U<PToken>) : Promise<FinalizedCombatResult[]> {
    const combat = PersonaCombat.combat;
    if (!combat) {return [];}
    await combat.markTokenDefeated(target);
    const attackerActor = attacker?.actor;
    const ret : FinalizedCombatResult[] = [];
    if (attackerActor) {
      const situation: Situation = {
        trigger: "on-kill-target",
        triggeringCharacter: attackerActor.accessor,
        attacker: attacker.actor.accessor,
        target: target.actor.accessor,
        user: attackerActor.accessor,
        triggeringUser: game.user.id,
      };
      for (const comb of combat.combatants) {
        if (!comb.actor) {continue;}
        situation.user = comb.actor.accessor;
        ret.push((TriggeredEffect.onTrigger(situation, comb.actor)).finalize());
      }
    }
    void NavigatorVoiceLines.onTargetKilled(target.actor, combat);
    return ret;
  }

} //end of class

type MutableActorState = {
  mpCost: number,
  theurgy: number,
};
