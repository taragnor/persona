import { PersonaCombat } from "./persona-combat.js";
import { PersonaSocial } from "../social/persona-social.js";
import { PToken } from "./persona-combat.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { PersonaError } from "../persona-error.js";
import { PersonaSockets } from "../persona.js";
import {FlagChangeDiffObject} from "./openers.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {sleep} from "../utility/async-wait.js";

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
      if (
        (changes.turn == undefined
          && changes.round == undefined)
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
            if (currentActor.isPC()) {
              await PersonaSocial.startSocialTurn(currentActor);
            }
          } else {
            if (combat.combatant) {
              await combat.startCombatantTurn(combat.combatant);
            }
          }
        }
      }
    });

		Hooks.on("updateCombat", async (combat: PersonaCombat, diff) => {
			await combat.openers.onUpdateCombat(diff as FlagChangeDiffObject );
		});

		Hooks.on("combatStart", async (combat: PersonaCombat) => {
			const x = combat.turns[0];
			if (x.actor) {
				if (combat.isSocial) {
					await PersonaSocial.startSocialTurn(x.actor as PC);
				} else {
					await combat.runAllCombatantStartCombatTriggers();
					await combat.startCombatantTurn(x);
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
        default:
        }
    });


    Hooks.on("socketsReady", () => {
      PersonaSockets.setHandler("QUERY_ALL_OUT_ATTACK", () => {
        void PersonaCombat.allOutAttackPrompt();
      });
      PersonaSockets.setHandler("REQUEST_TEAMWORK", (data) => {
        void PersonaCombat.onTeamworkRequest(data);
      });
    });

    Hooks.on("renderChatMessageHTML", (_msg, html) => {
      const elem = $(html);
      PersonaCombat.addOpeningActionListeners(elem);
      if (PersonaCombat.combat && !PersonaCombat.combat.isSocial) {
        PersonaCombat.combat.followUp.activateListeners(elem);
      }
    });

		Hooks.on("renderChatMessageHTML", (_msg, elem) => {
			$(elem).find('.outer-roll-block').on('click', (ev) => void PersonaCombat._openRollBlock(ev));
		});

    Hooks.on("deleteToken", async tok => {
      await sleep(1000); //wait a bit to see if something else deletes the combatant
      const combatants = PersonaCombat.combat
        ?.combatants.contents
        .filter( comb => comb.token == tok);
      for (const comb of (combatants ?? [])) {
        try {
          await comb.delete();
        } catch {
          PersonaError.softFail(`Failed to Delete ${comb.id} when deleting token ${tok.id}`);
        }
      }
    });

    //flashing text
    Hooks.on("renderChatMessageHTML", (_msg, content) => {
      if (!PersonaCombat.combat) {return;}
      const header = $(content).find(".start-turn-header");
      if (header.length == 0) {return;}
      const combatantId= HTMLTools.getClosestDataSafe(header, "combatant-id", "");
      if (!combatantId) {return;}
      const combatant = PersonaCombat.combat.combatant;
      if (!combatant) {return;}
      if (combatant.id  == combatantId
        && combatant.actor.hasPlayerOwner
        // && !game.user.isGM
        && combatant.actor.isOwner) {
        console.log(`Adding flash to ${combatant.name} msg`);
        header.addClass("flashing");
        return;
      }
    });

	}

}//end of class
