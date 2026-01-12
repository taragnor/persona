import {CardTag} from "../../config/card-tags.js";
import {SocialCardActionConsequence, VariableAction} from "../../config/consequence-types.js";
import {PersonaError} from "../persona-error.js";
import {resolveActorIdOrTarot} from "../preconditions.js";
import {SocialCardEventHandler} from "./card-event-handler.js";
import {PersonaSocial} from "./persona-social.js";
import {CardData, SocialCardExecutor} from "./social-card-executor.js";

export class SocialActionExecutor {

	static get cardExecutor() : SocialCardExecutor {
		const exec = PersonaSocial.currentSocialCardExecutor;
		if (!exec) {
			throw new PersonaError("Can't get card executor to perform social Action");
		}
		return exec;
	}

	static get mainActor() : PC {
		return this.cardData.actor;
	}

	static get handler() :  SocialCardEventHandler {
		const handler = this.cardExecutor.handler;
		if (!handler) {
			throw new PersonaError("Cant' find handler for event");
		}
		return this.cardExecutor.handler;
	}

	static get cardData() : CardData {
		return this.cardExecutor.cardData;
	}

	static async execSocialCardAction(eff: SocialCardActionConsequence) : Promise<void> {
		try{
			await this._execSocialCardAction(eff);
		} catch (e) {
			PersonaError.softFail(`Error Executing Social Action ${eff.cardAction}`, e);
		}
	}

	private static async _execSocialCardAction(eff: SocialCardActionConsequence) : Promise<void> {
		switch (eff.cardAction) {
			case "stop-execution":
				this.cardExecutor.stopCardExecution();
				// ui.notifications.notify("Card Execution stopped by event");
				break;
			case "exec-event":
				this.handler.forceEvent(eff.eventLabel);
				this.handler.addExtraEvent(1);
				break;
			case "inc-events":
				this.handler.addExtraEvent(eff.amount ?? 0);
				break;
			case "gain-money":
					await PersonaSocial.gainMoney(this.cardData.actor, eff.amount ?? 0);
				break;
			case "modify-progress-tokens":
					await this.modifyProgress(eff ?? 0);
				break;
			case "alter-student-skill":
					if (!eff.studentSkill) {
						PersonaError.softFail("No student skill given");
						break;
					}
				await PersonaSocial.alterStudentSkill( this.mainActor, eff.studentSkill, eff.amount ?? 0);
				break;
			case "modify-progress-tokens-cameo": {
				await this.modifyCameoProgress(eff.amount);
				break;
			}
			case "add-card-events-to-list":
					this.handler.addCardEvents(eff.cardId);
				break;
			case "replace-card-events":
					this.handler.replaceCardEvents(eff.cardId, eff.keepEventChain);
				break;
			case "set-temporary-variable": {
				const val = "value" in eff ? eff.value : Math.floor(eff.min + (eff.max * Math.random()));
				this.variableAction(eff.operator, eff.variableId, val);
				break;
			}
			case "card-response":
					await this.handler.applyCardResponse(eff.text);
				break;
			case "append-card-tag":
				this.#appendCardTag(eff.cardTag);
				break;
			case "remove-cameo":
				this.#removeCameo();
				break;
			case "set-social-card-item":
				this.cardExecutor.setSocialCardItem(eff.item);
				break;
			default:
				eff satisfies never;
				break;
		}
	}

	static variableAction(operator: VariableAction, variableName: string, amount: number) {
		let varVal = PersonaSocial.getSocialVariable(variableName);
		switch (operator) {
			case "set-range": //since this forces an amount set range responds the same
			case "set":
				varVal = amount;
				this.cardExecutor.setSocialVariable(variableName, varVal);
				break;
			case "add":
				if ( varVal == undefined) {
					PersonaError.softFail(`Social Variable ${variableName} doesn't exist`);
					break;
				}
				varVal += amount;
				this.cardExecutor.setSocialVariable(variableName, varVal);
				break;
			case "multiply":
				if ( varVal == undefined) {
					PersonaError.softFail(`Social Variable ${variableName} doesn't exist`);
					break;
				}
				varVal *= amount;
				this.cardExecutor.setSocialVariable(variableName, varVal);
				break;

			default:
				operator satisfies never;
		}
	}

	static async modifyProgress(eff: SocialCardActionConsequence & {cardAction: "modify-progress-tokens"} ) {
		const choice = eff.socialLinkIdOrTarot;
		if (choice == undefined || choice == "target") {
			return this.modifyTargetProgress(eff.amount);
		}
		if (choice == "cameo") {
			return this.modifyCameoProgress(eff.amount);
		}
		const target = resolveActorIdOrTarot(choice as string);
		if (!target) {
			PersonaError.softFail(`Can't find target for ${choice as string}`);
			return;
		}
		const actor  = this.cardData.actor;
		await actor.socialLinkProgress(target.id, eff.amount);
	}

	static async modifyTargetProgress(amt: number) {
		const cardData =this.cardData;
		const actor = cardData.actor;
		if (cardData.situation.socialTarget) {
			const linkId = cardData.linkId;
			await actor.socialLinkProgress(linkId, amt);
		} else {
			const id = cardData.card.id;
			await actor.activityProgress(id, amt);
		}
	}

	static async modifyCameoProgress (amt: number) {
		const cardData =this.cardData;
		const cameos = cardData.cameos;
		const actor  = cardData.actor;
		if (!cameos || cameos.length < 1) { return; }
		for (const cameo of cameos) {
			await actor.socialLinkProgress(cameo.id, amt ?? 0);
		}
	}

	static #removeCameo() {
		const cardData = this.cardData;
		cardData.cameos = [];
		cardData.replaceSet["$CAMEO"] = "REMOVED CAMEO";
	}

	static #appendCardTag(tag: CardTag) {
		this.cardData.extraCardTags.push(tag);
	}

}
