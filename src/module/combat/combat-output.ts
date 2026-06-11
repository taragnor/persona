import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaError} from "../persona-error.js";
import {ResolvedRollBundle} from "../roll-bundle.js";
import {FinalizedCombatResult} from "./finalized-combat-result.js";
import {PersonaCombat, PToken} from "./persona-combat.js";


export class CombatOutput {
	result: FinalizedCombatResult;
	initiatorToken: U<PToken>;

	constructor(result : FinalizedCombatResult, initiatorToken : U<PToken>) {
		this.result = result;
		this.initiatorToken = initiatorToken;
	}

	async HTMLHeader(effectName: string,  initiator: PersonaActor | undefined) : Promise<string> {
    try {
		if (!initiator) {return "";}
		let initiatorToken : PToken | undefined;
		if (game.combat) {
			initiatorToken = PersonaCombat.getPTokenFromActorAccessor(initiator.accessor);
		}
		const attackerToken = initiatorToken;
		const attackerPersona = (initiator.isValidCombatant() && (
			initiator.persona().isPersona()
			|| initiator.persona().source.hasBuiltInPersona()
		))	? initiator.persona(): undefined;
		const attackerName = initiator.token?.name ?? initiatorToken?.name ?? initiator.displayedName;
		const html = await foundry.applications.handlebars.renderTemplate("systems/persona/other-hbs/combat-roll-header.hbs", {attackerToken, attackerPersona, attackerName, effectName});
		return html;
    } catch (e) {
      PersonaError.softFail((e as Error).toString(), e);
      return "ERROR";
    }
	}

  async HTMLBody(): Promise<string> {
    try {
      this.result.compressChained();
      // this.compressChained();
      const attacks = this.result.attacks.map( (attack)=> {
        return {
          attackResult: attack.atkResult,
          changes: attack.changes,
        };
      });
      const html = await foundry.applications.handlebars.renderTemplate("systems/persona/other-hbs/combat-roll-body.hbs", {attacks, escalation: 0, result: this, costs: this.result.costs});
      return html;
    } catch (e) {
      PersonaError.softFail((e as Error).toString(), e);
      return "ERROR";
    }
  }

	async generateHTML(effectNameOrHeader: string, initiator: U<PersonaActor>) : Promise<string> {
		let header: string;
		if (initiator) {
			header = await this.HTMLHeader(effectNameOrHeader, initiator);
		} else {
			header = effectNameOrHeader;
		}
		const html = header + await this.HTMLBody();
		return html;
	};

  async renderMessage( header: string) : Promise<ChatMessage>;
  async renderMessage( effectName: string, initiator: U<PersonaActor>, options ?: {error: boolean}) : Promise<ChatMessage>;
  async renderMessage( effectNameOrHeader: string, initiator?: U<PersonaActor>, options ?: {error: boolean}) : Promise<ChatMessage> {
    const rolls : ResolvedRollBundle[] = this.result.attacks
    .flatMap( (attack) => attack.atkResult.roll? [attack.atkResult.roll] : []);
    const html = await this.generateHTML(effectNameOrHeader, initiator);
    const errorMsg =     options?.error 
    ? ` <div class="error">
          <h3> ERROR DETECTED </h3>
        </div>`
    : "";
    const content = `${errorMsg}${html}`;
    const initiatorToken= this.initiatorToken;
    const chatMsg = await ChatMessage.create( {
      speaker: {
        scene: initiatorToken?.parent?.id ?? initiator?.token?.parent.id,
        actor: initiatorToken?.actor?.id ?? initiator?.id,
        token:  initiatorToken?.id,
        alias: initiatorToken?.name ?? "System",
      },
      rolls: rolls.map( rb=> rb.roll),
      content,
      user: game.user,
      style: CONST?.CHAT_MESSAGE_STYLES.OTHER,
    }, {});
    return chatMsg;
  }


}
