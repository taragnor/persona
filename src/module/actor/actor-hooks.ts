import {LevelUpCalculator} from "../../config/level-up-calculator.js";
import {EnhancedActorDirectory} from "../enhanced-directory/enhanced-directory.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {Logger} from "../utility/logger.js";
import {PersonaActor} from "./persona-actor.js";

export class ActorHooks {
	static init() {
		Hooks.on("preUpdateActor", async (actor: PersonaActor, changes) => {
			if (!actor.isOwner) {return;}
			switch (actor.system.type) {
				case "npc": return;
				case "tarot": return;
				case "pc":
				case "npcAlly":
				case "shadow":  {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					const newHp = changes?.system?.combat?.hp as number | undefined;
					if (newHp == undefined)
					{return;}
					await (actor as ValidAttackers).refreshHpStatus(newHp);
					return ;
				}
				default:
					actor.system satisfies never;
					throw new PersonaError(`Unknown Type`);
			}
		});

		Hooks.on("createActor", async function (actor: PersonaActor) {
			if (actor.isShadow()) {
				await actor.update({
					"prototypeToken.displayBars": 50,
					"prototypeToken.displayName": 30,
					"prototypeToken.bar1": {attribute: "combat.hpTracker"},
					"prototypeToken.bar2": {attribute: "combat.energy"}
				});
			}
			if (actor.isShadow() && !actor.hasTag("persona") && !actor.hasTag("d-mon")  && actor.level <= 1) {
				const avgLevel = PersonaDB.averagePCLevel();
				await actor.update({ "system.combat.personaStats.pLevel" : avgLevel});
				await actor.setWeaponDamageByLevel(avgLevel);
			}
		});

		Hooks.on("updateActor", async function (actor: PersonaActor) {
			if (!actor.isNPC() || !actor.tarot) { return; }
			for (const PC of PersonaDB.PCs()) {
				PC.clearCache();
				await PC.sheet.render(false);
			}
		});


		Hooks.on("updateActor", async function (actor: PersonaActor) {
			actor.clearCache();
			if (actor.isShadow()) {
				const xp= LevelUpCalculator.minXPForEffectiveLevel(actor.system.combat.personaStats.pLevel);
				if (actor.system.combat.personaStats.xp < xp) {
					await actor.update({"system.combat.personaStats.xp" : xp});
				}
			}
		});


		Hooks.on("updateActor", function (actor: PersonaActor, diff)  {
			if (!actor.isToken && diff?.prototypeToken?.name) {
				EnhancedActorDirectory.refresh();
			}
			if (actor.isValidCombatant()) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				if (diff?.system?.combat?.personaStats?.pLevel != undefined) {
					EnhancedActorDirectory.refresh();
				}
			}
		});

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		Hooks.on("updateActor", async (actor: PersonaActor, changes: {system: any}) => {
			if (!game.user.isGM) {return;}
			if (!actor.isOwner) {return;}
			if (!actor.isValidCombatant()) {return;}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const lvl =changes?.system?.combat?.personaStats?.pLevel as U<number>;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			if (changes?.system?.combat?.personaStats?.pLevel != undefined && lvl) {
				console.log("Actor XP update");
				const minXP = LevelUpCalculator.minXPForEffectiveLevel(lvl);
				const maxXP = LevelUpCalculator.minXPForEffectiveLevel(lvl + 1);
				if (actor.system.combat.personaStats.xp < minXP) {
					console.log("Actor XP update raised");
					await actor.update({"system.combat.personaStats.xp" : minXP});
				}
				if (actor.system.combat.personaStats.xp >= maxXP) {
					console.log("Actor XP update lowered");

					await actor.update({"system.combat.personaStats.xp" : minXP});
				}
				await actor.basePersona.resetCombatStats(true);
				if (actor.isPC() || actor.isNPCAlly()) {
					await actor.refreshMaxMP();
				}
				await actor.refreshHpStatus();
				//NEEd to refresh stat points on level change
			}
			if (lvl != undefined) {
				await actor.onLevelUp_checkLearnedPowers(lvl, !actor.isShadow());
			}
			switch (actor.system.type) {
				case "npcAlly": {
					const PCChanges = changes.system as Partial<NPCAlly["system"]>;
					if (PCChanges?.combat?.isNavigator == true) {
						await (actor as NPCAlly).setAsNavigator();
					}
					if (PCChanges?.combat?.usingMetaPod != undefined)
					{
						await Logger.sendToChat(`${actor.name} changed Metaverse Pod status to ${PCChanges.combat.usingMetaPod}`);
					}
					break; }
				case "pc": {
					const PCChanges = changes.system as Partial<PC["system"]>;
					if (PCChanges?.combat?.usingMetaPod != undefined)
					{
						await Logger.sendToChat(`${actor.name} changed Metaverse Pod status to ${PCChanges.combat.usingMetaPod}`);
					}
					break;
				}
				case "shadow":
					break;
				default:
					actor.system satisfies never;
			}
			await	actor.refreshTrackers();
		});

		Hooks.on("createToken", async function (token: TokenDocument<PersonaActor>)  {
			if (!game.user.isGM) { return;}
			if (token.actor && game.user.isGM && token.actor.system.type == "shadow") {
				await token.actor.fullHeal();
			}
		});

	}

}
