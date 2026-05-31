import {StatusEffectId} from "../../config/status-effects.js";
import {PersonaDB} from "../persona-db.js";
import {OpenerOptionsGroups} from "./openers.js";
import {PersonaCombat, PersonaCombatant} from "./persona-combat.js";

export class OpenerSaves {
  combat: PersonaCombat;

  constructor (combat: PersonaCombat) {
    this.combat=  combat;
  }

  public async openerSaves(combatant: PersonaCombatant & {actor: ValidAttackers}, situation: SituationComponent.Roll) {
    const returns :OpenerOptionsGroups[]= [];
    returns.push(
      await this.fadingRoll(combatant, situation),
      this.saveVsSleep(combatant),
      this.saveVsDizzy(combatant, situation),
      this.saveVsFear(combatant, situation),
      // this.saveVsDespair(combatant, situation),
      this.saveVsConfusion(combatant, situation),
      this.saveVsCharm(combatant, situation),
      this.rageOpener(combatant, situation),
      this.disengageOpener(combatant, situation),
    );

    return returns;
  }

  static mockOpeningSaveTotal( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll, status: StatusEffectId) : number | undefined {
    const rollValue = situation.naturalRoll ?? -999;
    if (!combatant.actor) {return undefined;}
    const statusEffect = combatant.actor.getStatus(status);
    if (!statusEffect && status != 'fading') {return undefined;}
    const saveSituation = {
      ...situation,
      saveVersus: status,
    } satisfies Situation;
    const saveBonus = combatant.actor.persona().getBonuses('save').total(saveSituation);
    return saveBonus + rollValue;
  }

  private saveVsCharm ( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const saveTotal = OpenerSaves.mockOpeningSaveTotal(combatant, situation, 'charmed');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Charm (${saveTotal}) -->`);
    switch (true) {
      case (saveTotal >= 16): {
        msg.push('Success (Remove Charm)');
        options.push({
          optionName: 'Clear Charm and act normally (Lose opening action)',
          mandatory: true,
        combatant: combatant.id,
          optionEffects: [],
        });
        void combatant.actor?.removeStatus("charmed");
        break;
      }
      case (saveTotal >= 11): {
        msg.push('Partial Success');
        options.push({
          optionName: 'Act normally but charm remains (lose opening action)',
          mandatory: true,
        combatant: combatant.id,
          optionEffects: [],
        });
        break;
      }
      case (saveTotal < 6) : {
        msg.push('Failure (Buff, Heal or attack)');
        options.push({
          optionName: 'Charmed (buff, heal or basic attack)',
          toolTip: 'The enemy chooses your action , causing you to cast a single target healing or buffing effect on an enemy or making a basic attack against an ally',
          mandatory: true,
        combatant: combatant.id,
          optionEffects: [],
        });
        break;
      }
      default:
        msg.push('Failure (Basic Attack)');
        options.push({
          optionName: "Basic Attack against an ally of the enemy's choice",
          mandatory: true,
        combatant: combatant.id,
          optionEffects: ['attackAlly'],
        });
    }
    return {msg, options};
  }


  private disengageOpener( combatant: PersonaCombatant, situation: SituationComponent.Roll) :OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const rollValue = situation.naturalRoll ?? -999;
    if (!situation.rollTags?.includes('opening')) {return {msg, options};}
    if (!combatant.actor?.isCapableOfAction()
      || combatant.actor?.hasStatus('challenged')
    ) {
      return {msg, options};
    }
    const accessor = PersonaDB.getUniversalTokenAccessor(combatant.token);
    if (!this.combat.isEngagedByAnyFoe(accessor)) {
      const ret : OpenerOptionsGroups = {
        msg, options
      };
      return ret;
    }
    const alliedDefenders = this.combat.getAlliedEngagedDefenders(accessor);
    if (alliedDefenders.length > 0) {
      msg.push(`Can Freely disengage thanks to ${alliedDefenders.map(x=> x.name).join(', ')}`);
      return {msg, options};
    }
    if (!combatant.actor) {return { msg, options};}
    const disengageBonus = combatant.actor.persona().getBonuses('disengage').total(situation);
    const disengageTotal = disengageBonus + rollValue;
    msg.push( `Disengage Total: ${disengageTotal}`);
    switch (true) {
      case disengageTotal >= 16 :
        options.push( {
          optionName: 'Expert Disengage',
          optionEffects: ['disengage'],
        combatant: combatant.id,
          mandatory: false,
        });
        break;
      case disengageTotal >= 11: {
        const enemyDefenders = this.combat.getEnemyEngagedDefenders(combatant);
        if (enemyDefenders.length == 0) {
          options.push( {
            optionName: 'Standard Disengage',
            optionEffects: ['disengage'],
        combatant: combatant.id,
            mandatory: false,
          });
        }
        break;
      }
    }
    return { msg, options};
  }

  private async fadingRoll( combatant: Combatant<ValidAttackers> , situation: SituationTypes.Roll) : Promise<OpenerOptionsGroups> {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    if (!situation.rollTags?.includes('opening')) {return {msg, options};}
    const actor = combatant.actor;
    if (
      !actor
      || actor.hp > 0
      || actor.isShadow()
    ) {return  {msg, options}; }
    if (!actor.isUsingMetaPod()) {
      msg.push(`${combatant.name} is currently downed (no safety systems)`);
      options.push({
        combatant: combatant.id,
        optionName: 'Lie there helplessly (fight in spirit only)',
        mandatory: true,
        optionEffects: ['fightInSpirit'],
      });
      return { msg, options};
    }
    if (actor.hasStatus('full-fade')) {
      msg.push(`${combatant.name} is completely faded...`);
      options.push({
        combatant: combatant.id,
        optionName: 'Completely Faded (Help in Spirit only)',
        mandatory: true,
        optionEffects: ['fightInSpirit'],
      });
      return { msg, options};
    }
    const saveTotal = OpenerSaves.mockOpeningSaveTotal(combatant, situation, 'fading');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Fading (${saveTotal}) -->`);
    switch (true) {
      case situation.naturalRoll == 20
          && (actor as PC).getSocialSLWithTarot('Star') >= 3: {
            msg.push('Critical Success');
            options.push({
              combatant: combatant.id,
              optionName: 'Star Benefit ( get up at 1 HP)',
              mandatory: true,
              optionEffects: ['revive'],
            });
            break;
          }
      case (saveTotal >= 11):{
        msg.push('Success');
        options.push({
          combatant: combatant.id,
          optionName: `${actor.hasStatus('fading') ? 'Barely ' : ''}Hanging On (Help in Spirit Only)`,
          mandatory: true,
          optionEffects: ['fightInSpirit'],
        });
        break;
      }
      default: {
        msg.push('Failure');
        await actor.increaseFadeState();
        const fadeState = actor.hasStatus('fading') ? 'Starting to Fade Away' : 'Fully Fade Away (Ejected from Metaverse)';
        options.push({
          combatant: combatant.id,
          optionName: `${fadeState} (Help in Spirit Only)`,
          mandatory: true,
          optionEffects: ['fightInSpirit'],
        });
        break;
      }
    }
    return { msg, options};
  }

  private saveVsSleep( combatant: Combatant<ValidAttackers>) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    if (!combatant?.actor?.hasStatus('sleep'))  {
      return {msg, options};
    }
    msg.push('Sleeping');
    options.push({
        combatant: combatant.id,
      optionName: 'Sleep Soundly (No fight in spirit)',
      mandatory: true,
      optionEffects: ['skipTurn'],
    });
    return {msg, options};
  }

  private saveVsFear( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const saveTotal = OpenerSaves.mockOpeningSaveTotal(combatant, situation, 'fear');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Fear (${saveTotal}) -->`);
    switch (true) {
      case (saveTotal >= 11):{
        msg.push('Success');
        break;
      }
      case (saveTotal <= 2) : {
        msg.push('Failure (Flee)');
        options.push({
          optionName: 'Flee from Combat',
          mandatory: true,
        combatant: combatant.id,
          optionEffects: ['skipTurn'],
        });
        break;
      }
      default:
        msg.push('Failure (Miss Turn)');
        options.push({
          optionName: 'Cower in Fear (Miss Turn)',
        combatant: combatant.id,
          mandatory: true,
          optionEffects: ['skipTurn'],
        });
    }
    return {msg, options};
  }


  private saveVsDizzy( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const saveTotal = OpenerSaves.mockOpeningSaveTotal(combatant, situation, 'dizzy');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Dizzy (${saveTotal}) -->`);
    if (saveTotal >= 6){
      msg.push('Success');
      return {msg, options};
    }
    msg.push('Do Nothing (Miss Turn)');
    options.push({
      optionName: 'Why is Everything Spinning?',
        combatant: combatant.id,
      mandatory: true,
      optionEffects: ['skipTurn'],
    });
    return {msg, options};
  }

  private rageOpener( combatant: Combatant<ValidAttackers> , _situation: Situation) : OpenerOptionsGroups {
    const msg : string[] = [];
    const options : OpenerOptionsGroups['options'] = [];
    if (combatant?.actor?.hasStatus('rage')) {
      msg.push('Battle Rage');
      options.push({
        optionName: 'Attack random enemy',
        combatant: combatant.id,
        mandatory: true,
        optionEffects: ['attackRandomEnemy'],
      });
    }
    return {msg, options};
  }

  private saveVsConfusion ( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll) : OpenerOptionsGroups {
    const options : OpenerOptionsGroups['options'] = [];
    const msg : string[] = [];
    const saveTotal = OpenerSaves.mockOpeningSaveTotal(combatant, situation, 'confused');
    if (saveTotal == undefined) {
      return {msg, options};
    }
    msg.push(`Resisting Confusion (${saveTotal}) -->`);
    switch (true) {
      case (saveTotal >= 11):{
        msg.push('Success');
        break;
      }
      case (saveTotal <= 2):{
        msg.push('Failure (Miss Turn + lose 10% Resources)');
        options.push({
          optionName: 'Throw Away Money (Miss Turn + lose 10% Resources)',
        combatant: combatant.id,
          mandatory: true,
          optionEffects: ['throw-away-money', 'skipTurn'],
        });
        break;
      }
      default:
        msg.push('Failure (Miss Turn)');
        options.push({
          optionName: 'Stand around confused (Miss Turn)',
        combatant: combatant.id,
          mandatory: true,
          optionEffects: ['skipTurn'],
        });
    }
    return {msg, options};
  }

  // private saveVsDespair ( combatant: Combatant<ValidAttackers> , situation: SituationComponent.Roll) : OpenerOptionsGroups {
  //   const options : OpenerOptionsGroups['options'] = [];
  //   const msg : string[] = [];
  //   const saveTotal = OpenerSaves.mockOpeningSaveTotal(combatant, situation, 'despair');
  //   if (saveTotal == undefined) {
  //     return {msg, options};
  //   }
  //   msg.push(`Resisting Despair (${saveTotal}) -->`);
  //   switch (true) {
  //     case (saveTotal >= 11):{
  //       msg.push('Success');
  //       break;
  //     }
  //     default:
  //       msg.push('Failure (Miss Turn)');
  //       options.push({
  //         optionName: 'Wallow in Despair (Miss Turn)',
  //         mandatory: true,
  //       combatant: combatant.id,
  //         optionEffects: ['skipTurn'],
  //       });
  //   }
  //   return {msg, options};
  // }

}
