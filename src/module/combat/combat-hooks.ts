import { PersonaCombatant } from "./persona-combat.js";
import { PersonaCombat } from "./persona-combat.js";
import { PersonaSocial } from "../social/persona-social.js";
import { PToken } from "./persona-combat.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { PersonaError } from "../persona-error.js";
import { PersonaSockets } from "../persona.js";
import {FlagChangeDiffObject, OpenerManager} from "./openers.js";
import {CombatPanel} from "./combat-panel.js";
import {FollowUpManager} from "./follow-up-actions.js";

export class CombatHooks {

	static init() {

		Hooks.on("preUpdateCombat" , async (combat: PersonaCombat, _changes: Record<string, unknown>, diffObject: {direction?: number}) =>  {
			const prevActor = combat?.combatant?.actor;
			if (prevActor && (diffObject?.direction ?? 0) > 0) {
				if (combat.combatant) {
					await combat.endTurn(combat.combatant);
				}
			}

		});

		Hooks.on("updateCombat" , async (combat: PersonaCombat, changes: Record<string, unknown>, diffObject: {direction?: number}) =>  {
			if (changes.turn == undefined && changes.round == undefined
				|| diffObject.direction == undefined) {
				return;
			}
			//new turn
			if (changes.round != undefined) {
				//new round
				if (diffObject.direction > 0 && game.user.isGM) {
					if (combat.isSocial) {
						await PersonaSocial.startSocialCombatRound();
					} else {
						await combat.onNewRound();
					}
				}
				if (diffObject.direction < 0 && game.user.isGM) {
					if (!combat.isSocial) {
						await combat.decEscalationDie();
					}
				}
			}
			if (diffObject.direction && diffObject.direction != 0) {
				const currentActor = combat?.combatant?.actor;
				if (currentActor && diffObject.direction > 0) {
					if (combat.isSocial) {
						if (currentActor.system.type == "pc") {
							// console.log("Hook start social combat turn");
							await PersonaSocial.startSocialTurn(currentActor as PC);
						}
					} else {
						if (combat.combatant) {
							await combat.startCombatantTurn(combat.combatant as PersonaCombatant);
						}
					}
				}
			}
		});

		Hooks.on("updateCombat", async (combat: PersonaCombat, diff) => {
			const changes = diff as FlagChangeDiffObject;
			if (!changes.flags) {return;}
			if (!combat.combatant
				|| !PersonaCombat.isPersonaCombatant(combat.combatant)) {return;}
			if (OpenerManager.checkForOpeningChanges(changes)) {
				await CombatPanel.instance.setOpeningActionChoices(combat.combatant, combat.openers.getOpenerChoices());
			}
			if (FollowUpManager.checkForFollowUpChanges(changes)) {
				await CombatPanel.instance.setFollowUpChoices(combat.combatant, combat.followUp.getFollowUpChoices());

			}
		});

		Hooks.on("combatStart", async (combat: PersonaCombat) => {
			const x = combat.turns[0];
			if (x.actor) {
				if (combat.isSocial) {
					await PersonaSocial.startSocialTurn(x.actor as PC);
				} else {
					await combat.runAllCombatantStartCombatTriggers();
					await combat.startCombatantTurn(x as PersonaCombatant);
				}
			}
		});

		Hooks.on("createCombatant", async (combatant: Combatant<ValidAttackers>) => {
			if (!game.user.isGM) {return;}
			await combatant?.token?.actor?.onAddToCombat();
			if (combatant.parent?.started) {
				await (combatant.combat as PersonaCombat).runCombatantStartCombatTriggers(combatant);
			}
		});

		Hooks.on("personaCalendarAdvance", () => {
			ui.combat.render(false);
		});

		Hooks.on("renderCombatTracker", (_item: CombatTracker, element: JQuery<HTMLElement> | HTMLElement, _options: RenderCombatTabOptions) => {
			const combat = (game.combat as (PersonaCombat | undefined));
			if (!combat) {return;}
			element = $(element);
			if (combat.isSocial) {
				PersonaSocial.displaySocialPanel(element);
			} else {
				combat.displayCombatHeader(element);
			}
		});

		Hooks.on("onAddStatus", async function (token: PToken, status: StatusEffect)  {
			if (!game.user.isGM) {
				throw new PersonaError("Somehow isn't GM executing this");
			}
			switch (status.id) {
				case "down":
					if (status.id != "down") {return;}
					if (game.combat) {
						const allegiance = token.actor.getAllegiance();
						const standingAllies = game.combat.combatants.contents
							.some(comb => {
								if (!comb.token) {return false;}
								const actor = comb.actor as ValidAttackers;
								return actor.isStanding()
									&& actor.getAllegiance() == allegiance;
							});
						if (!standingAllies) {
							const currentTurnCharacter = (game.combat as PersonaCombat).combatant?.actor;
							if (!currentTurnCharacter) {return;}
							const currentTurnType = currentTurnCharacter.system.type;
							if (currentTurnType == "shadow") {
								await PersonaCombat.allOutAttackPrompt();
								break;
							} else {
								PersonaSockets.simpleSend("QUERY_ALL_OUT_ATTACK", {}, game.users
									.filter( user=> currentTurnCharacter.testUserPermission(user, "OWNER") && !user.isGM )
									.map( usr=> usr.id)
								);
							}
						}
					}
					break;
				case "bonus-action": { const combat = game.combat as PersonaCombat;
					if (combat && !combat.isSocial) {
						await combat.onFollowUpAction(token, status.activationRoll);
					}
					break;
				}
				default:
			}
		});


		Hooks.on("socketsReady", () => {
			PersonaSockets.setHandler("QUERY_ALL_OUT_ATTACK", () => {
				void PersonaCombat.allOutAttackPrompt();
			});
		});

		Hooks.on("renderChatMessageHTML", (_msg, html) => {
			const elem = $(html);
			if (elem.find(".opener-block").length > 0) {
				PersonaCombat.addOpeningActionListeners(elem);
			}
		});

		Hooks.on("renderChatMessageHTML", (_msg, elem) => {
			$(elem).find('.outer-roll-block').on('click', (ev) => void PersonaCombat._openRollBlock(ev));
		});

	}

}
