import {RollSituation} from "../../config/situation.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {FlagChangeDiffObject} from "./openers.js";
import {CombatPanel} from "./panels/combat-panel.js";
import {PersonaCombat, PersonaCombatant, PToken} from "./persona-combat.js";
import {PersonaTargetting} from "./persona-targetting.js";

export class FollowUpManager {
	combat: PersonaCombat;

	static FOLLOW_UP_DATA_FLAG_NAME= "followUpChoices" as const;

	constructor(combat: PersonaCombat) {
		this.combat  = combat;
	}

	async onFollowUpAction(token: PToken, activationRoll: number) {
		console.debug('Calling On Follow Up Action');
		const combatant = token.object ? this.combat.getCombatantByToken(token): null;
		if (!combatant || !combatant.actor || !PersonaCombat.isPersonaCombatant(combatant)) {return;}
		if (combatant.actor && combatant.actor.hasStatus('down')) {return;}
		const list = this.usableFollowUpsList(combatant, activationRoll);
    await CombatPanel.instance.setFollowUpChoices(combatant, list);
		await this.sendFollowUpsToChat(list);
	}

	private async sendFollowUpsToChat(list: FollowUpActionData[]) {
		const templateData = {
			followUps : list
		};
		const msg = await foundry.applications.handlebars.renderTemplate("systems/persona/parts/combat-panel-follow-up-list.hbs", templateData);
		const messageData: MessageData = {
			speaker: {alias: 'Follow Up Action'},
			content: msg,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		await ChatMessage.create(messageData);
	}

	private usableFollowUpsList(combatant: PersonaCombatant, activationRoll: number) : FollowUpActionData[] {
		return [
			// ...this.actAgain(),
			...this.allOutCheck(combatant),
			...this.personalFollowUps(combatant, activationRoll),
			...this.teamWorkActions(combatant, activationRoll)];
	}

	actAgain() : FollowUpActionData[] {
		return [{
			type: "act-again"
		}];
	}

	teamWorkActions(combatant: PersonaCombatant, activationRoll: number) : FollowUpActionData[] {
		const allies = this.combat.getAllies(combatant as Combatant<ValidAttackers>)
			.filter (ally => ally.actor?.canTakeFollowUpAction());
		const validTeamworkMoves : FollowUpActionData[] = allies
			.flatMap( ally => {
				if (ally == combatant) {return [];}
				const actor = ally.actor;
				if (!actor || !actor.teamworkMove ) {return [];}
				if (!actor.persona().canUsePower(actor.teamworkMove, false)) {return [];}
				const situation : CombatRollSituation = {
          attacker: actor.accessor,
					naturalRoll: activationRoll,
					rollTags: ['attack', 'activation'],
					rollTotal : activationRoll,
					user: actor.accessor,
				};
				if (!actor.teamworkMove.testTeamworkPrereqs(situation, actor)) {return [];}
				const targets = PersonaTargetting.getValidTargetsFor(actor.teamworkMove, combatant, situation);
				if (targets.length == 0) {return [];}
				return [{
					type :"teamwork",
					teammate: ally.id,
					powerId: actor.teamworkMove.id,
					name: `${actor.teamworkMove.name} (${ally.name})`,
				}] satisfies FollowUpActionData[];
			});
		return validTeamworkMoves;
	}

  personalFollowUps(combatant: PersonaCombatant, activationRoll: number): FollowUpActionData[] {
    const followUps : FollowUpActionData[] = this.getUsableFollowUps(combatant.token, activationRoll).map( pwr=> {
      const legalTargets = pwr.targeting().getValidTargetsFor(combatant);
      if (legalTargets.length == 0) { return undefined; }
      const targetNames = legalTargets
        .map (x=> x.name)
        .join (" ,");
      if (pwr.requiresTargetSelection()) {
        return {
          combatantId: combatant.id,
          powerId: pwr.id,
          type: "power",
          targetChoices: legalTargets,
          name: `${pwr.name}`,
        } satisfies FollowUpActionData;
      }
      return {
        type : "area-power",
        powerId: pwr.id,
        combatantId: combatant.id,
        name: `${pwr.name} (${targetNames})`,
      } satisfies FollowUpActionData;
    } )
      .filter (x=> x != undefined);
    return followUps;
  }

	allOutCheck(combatant: PersonaCombatant) : FollowUpActionData[] {
		const allout = (this.combat.getAllEnemiesOf(combatant.token)
			.every(enemy => enemy.actor.hasStatus('down'))
			&& combatant.actor.canAllOutAttack());
		if (!allout) {return [];}
		const allOutAttack = PersonaDB.getBasicPower("All-out Attack");
		if (!allOutAttack) {
			PersonaError.softFail("Couldn't find All out attack");
			return [];
		}
		return [ {
			type: "area-power",
			name: allOutAttack.displayedName,
			powerId: allOutAttack.id,
			combatantId: combatant.id,
		} ];
	}

	private	getUsableFollowUps(token: PToken, activationRoll: number) : Power []{
		const combatant = token.object ? this.combat.getCombatantByToken(token): null;
		if (!combatant || !combatant.actor) {return [];}
		const actor = combatant.actor;
		const situation : CombatRollSituation = {
			naturalRoll: activationRoll,
			rollTags: ['attack', 'activation'],
			rollTotal: activationRoll,
			user: actor.accessor,
		};
		const persona = actor.persona();
		const followUpMoves = actor.powers
			.filter(pwr => pwr.isFollowUpMove()
				&& persona.canPayActivationCost(pwr)
				&& pwr.testFollowUpPrereqs(situation, actor)
			);
		return followUpMoves;
	}

	static checkForFollowUpChanges(diffObject: FlagChangeDiffObject) : boolean {
		if (diffObject?.flags?.persona?.followUpChoices) {
			return true;
		}
		return false;
	}

	/** retunr true if selected else false if fails */
	async chooseFollowUp(ev: JQuery.ClickEvent) :Promise<boolean> {
		if (!PersonaCombat.combat || !PersonaCombat.combat.combatant?.isOwner) {
			ui.notifications.warn("Can't act now, its not your turn");
			return false;
		}
		const combatantId = HTMLTools.getClosestData<PersonaCombatant["id"]>(ev, "combatantId");
		const powerId = HTMLTools.getClosestData<Power["id"]>(ev, "powerId");
		const combatant = this.combat.combatants.get(combatantId);
		if (!combatant  || !PersonaCombat.isPersonaCombatant(combatant)) {
			PersonaError.softFail("combatnat isn't a real Combatant");
			return false;
		}
		if (combatant != this.combat.combatant) {
			return await this.requestOther(combatant, powerId);
		}
		return await this.execPersonalPower(combatant, powerId);
	}

	private async execPersonalPower(combatant : PersonaCombatant, powerId: Power["id"]) : Promise<boolean>{
		const usable = combatant.actor.powers.find( pwr => pwr.id == powerId) ?? combatant.actor.items.find( item => item.id == powerId);
		if (!usable || !usable.isUsableType()) {
			PersonaError.softFail(`can't find Usable ${powerId}`);
			return false;
		}
		try{
			await this.combat.combatEngine.usePower(combatant.token, usable);
			return true;
		} catch (e) {
			Debug(e);
		}
		return false;
	}

	private async requestOther(combatant: PersonaCombatant, _powerId: Power["id"]): Promise<boolean> {
		const actingCharacter= this.combat.combatant!;
		const msg = `${actingCharacter.name} hands over control to ${combatant.name} to execute their teamwork move!`;
		const messageData: MessageData = {
			speaker: {alias: 'Follow Up Action'},
			content: msg,
			style: CONST.CHAT_MESSAGE_STYLES.OTHER,
		};
		await ChatMessage.create(messageData, {});
		return true;
	}


}

export type FollowUpActionData = {
  type: "power",
  powerId: Usable["id"],
  combatantId: PersonaCombatant["id"],
  targetChoices: PersonaCombatant[],
  name: string,
} | {
  type: "area-power",
  powerId: Usable["id"],
  combatantId: PersonaCombatant["id"],
  name: string,
} | {
  type :"teamwork",
  powerId: Usable["id"],
  teammate: PersonaCombatant["id"],
  name: string,
} | {
  type: "act-again";
};

type CombatRollSituation = RollSituation & Situation;


declare global {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface CombatFlags extends Record<typeof FollowUpManager["FOLLOW_UP_DATA_FLAG_NAME"], FollowUpActionData[]> {
	}
}

