import { PersonaCombat } from "./persona-combat.js";
import { PersonaSocial } from "../social/persona-social.js";
import { Situation } from "../preconditions.js";
import { PToken } from "./persona-combat.js";
import { ValidAttackers } from "./persona-combat.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { PersonaError } from "../persona-error.js";
import { PersonaSockets } from "../persona.js";

export class CombatHooks {

	static init() {

		Hooks.on("preUpdateCombat" , async (combat: PersonaCombat, _changes: Record<string, unknown>, diffObject: {direction?: number}) =>  {
			const prevActor = combat?.combatant?.actor
			if (prevActor && diffObject.direction && diffObject.direction > 0) {
				await combat.endCombatantTurn(combat.combatant)
			}

		});

		Hooks.on("updateCombat" , async (combat: PersonaCombat, changes: Record<string, unknown>, diffObject: {direction?: number}) =>  {
			if (changes.turn == undefined && changes.round == undefined) {
				return;
			}
			if (diffObject.direction && diffObject.direction != 0) {
				const currentActor = combat?.combatant?.actor
				if (currentActor && diffObject.direction > 0) {
					await combat.startCombatantTurn(combat.combatant)
				}

				//new turn
				if (changes.round != undefined) {
					//new round
					if (diffObject.direction > 0 && game.user.isGM) {
						if (combat.isSocial) {
							PersonaSocial.startSocialCombatTurn();
						}
						await combat.incEscalationDie();
					}
					if (diffObject.direction < 0 && game.user.isGM) {
						await combat.decEscalationDie();
					}
				}
			}
		});

		Hooks.on("combatStart", async (combat: PersonaCombat) => {
			for (const comb of combat.combatants) {
				if (!comb.actor) continue;
				const situation : Situation = {
					activeCombat : true,
					user: comb.actor.accessor,
					triggeringCharacter: comb.actor.accessor,
				};
				const token = comb.token as PToken;
				await PersonaCombat
					.onTrigger("on-combat-start", token.actor, situation)
					.emptyCheck()
					?.toMessage("Triggered Effect", token.actor);
			}
			const x = combat.turns[0];
			if (x.actor) {
				await combat.startCombatantTurn(x as Combatant<ValidAttackers>);
			}
		});

		Hooks.on("deleteCombat", async (combat: PersonaCombat) => {
			if (!game.user.isGM)
				return;
			for (const combatant of combat.combatants) {
				const actor = combatant.actor as ValidAttackers  | undefined;
				if (!actor) continue;
				const token = combatant.token as PToken;
				await PersonaCombat
					.onTrigger("on-combat-end", token.actor)
					.emptyCheck()
					?.toMessage("Triggered Effect", token.actor );
				for (const effect of actor.effects) {
					if (effect.durationLessThanOrEqualTo("combat")) {
						await effect.delete();
					}
				}
				if (actor.isFading()) {
					await actor.modifyHP(1);
				}
			}
		});


		Hooks.on("createCombatant", async (combatant: Combatant<PersonaActor>) => {
			await combatant?.token?.actor?.onAddToCombat();
			if (combatant.parent?.started && combatant.actor) {
				await PersonaCombat.execTrigger("on-combat-start", combatant.actor as ValidAttackers);
			}
		});

		Hooks.on("renderCombatTracker", async (_item: CombatTracker, element: JQuery<HTMLElement>, _options: RenderCombatTabOptions) => {
			const combat = (game.combat as (PersonaCombat | undefined));
			if (!combat) return;
			if (combat.isSocial) {
				PersonaSocial.displaySocialPanel(element);
			} else {
				combat.displayEscalation(element);
				combat.displayRoomEffectChanger(element);
			}
		});

		Hooks.on("onAddStatus", async function (token: PToken, status: StatusEffect)  {
			if (status.id != "down") return;
			if (!game.user.isGM) {
				throw new PersonaError("Somehow isn't GM executing this");
			}
			if (game.combat) {
				const allegiance = token.actor.getAllegiance();
				const standingAllies = game.combat.combatants.contents.some(comb => {
					if (!comb.token) return false;
					const actor = comb.actor as ValidAttackers;
					return actor.isStanding() && actor.getAllegiance() == allegiance;
				})
				if (!standingAllies) {
					const currentTurnCharacter = game.combat.combatant?.actor;
					if (!currentTurnCharacter) return;
					const currentTurnType = currentTurnCharacter.system.type;
					if (currentTurnType == "shadow") {
						return await PersonaCombat.allOutAttackPrompt();
					} else {
						PersonaSockets.simpleSend("QUERY_ALL_OUT_ATTACK", {}, game.users
							.filter( user=> currentTurnCharacter.testUserPermission(user, "OWNER") && !user.isGM )
							.map( usr=> usr.id)
						);
					}
				}
			}

		});


		Hooks.on("socketsReady", async () => {
			PersonaSockets.setHandler("QUERY_ALL_OUT_ATTACK", () => {
				PersonaCombat.allOutAttackPrompt();
			});
		});

	}
}
