import { LevelUpCalculator } from "../../config/level-up-calculator.js";
import { ValidAttackers } from "../combat/persona-combat.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaError } from "../persona-error.js";
import { Shadow } from "../actor/persona-actor.js";
import { PC } from "../actor/persona-actor.js";
import { PersonaDB } from "../persona-db.js";
import {PersonaSockets} from "../persona.js";

declare global {
	export interface SocketMessage {
		"COMPENDIUM_COPY": {id: Shadow["id"]}
	}
}

Hooks.on("socketsReady", (sockets) => {
	sockets.setHandler("COMPENDIUM_COPY", async (data) => {
		const actor = PersonaDB.getActorById(data.id);
		if (!actor || !actor.isShadow()) {
			PersonaError.softFail(`Bad Actor Id sent to attempt compendium copy: ${data.id}`, data);
			return false;
		}
		return await ActorConverters.copyPersonaToCompendium(actor);
	});

});

export class ActorConverters {

	static async copyPersonaToCompendium(actor: Shadow) : Promise<boolean>  {
		if (!game.user.isGM) {
			const gm = game.users.find(x=> x.isGM && x.active);
			if (!gm) {
				throw new PersonaError("No GM connected, can't take this action");
			};
			const socketData = {id: actor.id};
			return await PersonaSockets.verifiedSend("COMPENDIUM_COPY", socketData, gm.id);
		} else {
			return this.#copyPersonaToCompendium(actor);
		}
	}

	static async #copyPersonaToCompendium(actor: Shadow) {
		if (!actor.isPersona()) {
			throw new PersonaError(`Can't copy to compendium, ${actor.name} isn't a valid Persona`);
		}
		let existing : U<Shadow>;
		const compId = actor.system.personaConversion.compendiumId;
		if (compId == actor.id) {
			throw new Error("This is already a compendium Persona!");
		}
		if (compId) {
			const entry = PersonaDB.getActorById(compId);
			if (entry && entry.isShadow()) {
				existing = entry;
			}
		}
		if (existing) {
			await existing.update(actor.system);
			return true;
		}
		const personaData = {
			system: (actor.system.toJSON() as Shadow["system"]),
			name: `${actor.name} (Compendium)`,
		};
		const persona = await PersonaActor.create<Shadow>(personaData);
		await actor.update( {"system.personaConversion.compendiumId": persona.id});
		return true;
	}

	static async convertShadowPowers(actor: Shadow) : Promise<void> {
		if (!actor.isShadow()) {return;}
		const compPowers= PersonaDB.allPowersArr();
		for (const power of actor._mainPowers()) {
			if (power.parent == actor) {
				const compPower= compPowers.find(x=> x.name == power.name);
				if (compPower) {
					const arr = actor.system.combat.powers ?? [];
					arr.push(compPower.id);
					await actor.update( {"system.combat.powers": arr});
					await power.delete();
					console.log(`converted ${power.name}`);
				} else {
					console.log(`*** Couldn't convert ${this.name} power ${power.name}`);
				}
			}
		}
	}

	static async toPersona(shadow: Shadow, newOwner ?: PC) : Promise<Shadow> {
		if (!shadow.isShadow()) {
			throw new PersonaError("Can't convert a non-shadow into a persona.");
		}
		if (!shadow.basePersona.isEligibleToBecomePersona()) {
			throw new PersonaError(`${shadow.name} is Ineligible to become a Persona`);
		}
		const ownership = newOwner != undefined
		? { ownership: newOwner.ownership }
		: {};
		const personaTags = shadow.system.creatureTags
		.slice()
		.filter ( x=> x != "d-mon" );
		personaTags.pushUnique("persona");
		if (shadow.system.creatureType == "daemon") {
			personaTags.pushUnique("simulated");
		}
		const statusResists : Shadow["system"]["combat"]["statusResists"] = {
			burn: "normal",
			charmed: "normal",
			curse: "normal",
			confused: "normal",
			dizzy: "normal",
			expel: "normal",
			fear: "normal",
			vulnerable: "normal",
			forgetful: "normal",
			frozen: "normal",
			sleep: "normal",
			shock: "normal",
			rage: "normal",
			poison: "normal",
			blind: "normal",
			sealed: "normal",
			despair: "normal"
		};
		const json = shadow.system.toJSON() as Shadow["system"];
		const talents = shadow.basePersona.talents;
		const personaData : DeepPartial<Shadow> = {
			name: `${shadow.name} (Persona)`,
			type: "shadow",
			...ownership,
			img: shadow.img,
			prototypeToken: {
				...shadow.prototypeToken,
				name: shadow.name,
			},
			system: {
				...json,
				creatureType:  "persona",
				role: "base",
				role2: "base",
				creatureTags: personaTags,
				personaConversion : {
					...json.personaConversion,
					baseShadowId: shadow.system.personaConversion.baseShadowId ?? shadow.id,
					startingLevel: shadow.system.personaConversion.startingLevel,
				},
				combat: {
					...json.combat,
					talents: talents.map( x=> x.id),
					lastLearnedLevel: 0,
					statusResists,
					personaStats: {
						...json.combat.personaStats,
						pLevel: shadow.system.personaConversion.startingLevel,
					}
				}
			}
		};
		personaData.system!.combat!.powers = [];
		const persona = await PersonaActor.create<Shadow>(personaData);
		await persona.createEmbeddedDocuments("Item", shadow.items.contents.map (x=> x.toJSON()));
		await this.convertPowers(shadow, persona);
		await persona.basePersona.resetCombatStats();
		return persona;
	}

	static async toDMon(shadow: Shadow): Promise<Shadow> {
		//TODO: remember to make linked token
		if (!shadow.isShadow()) {
			throw new PersonaError("Can't convert a non-shadow into a d-mon.");
		}
		if (!shadow.basePersona.isEligibleToBecomeDMon()) {
			throw new PersonaError(`${shadow.name} is Ineligible to become a D-Mon`);
		}
		const dmonTags = shadow.system.creatureTags
		.slice()
		.filter ( x=> x != "persona" );
		dmonTags.pushUnique("d-mon");
		if (shadow.system.creatureType == "daemon") {
			dmonTags.pushUnique("simulated");
		}
		const json =  shadow.system.toJSON() as Shadow["system"];

		const dmonStats : DeepPartial<Shadow> = {
			name: `${shadow.name} (D-Mon)`,
			type: "shadow",
			img: shadow.img,
			prototypeToken: {
				...shadow.prototypeToken,
				name: shadow.name,
			},
			system: {
				...json,
				creatureType : "d-mon",
				creatureTags: dmonTags,
				personaConversion : {
					...json.personaConversion,
					baseShadowId: shadow.system.personaConversion.baseShadowId ?? shadow.id,
					startingLevel: shadow.system.personaConversion.startingLevel,
				},
				combat: {
					...json.combat,
					lastLearnedLevel: 0,
				}
			},
		};
		dmonStats.system!.combat!.powers = [];
		const dmon = await PersonaActor.create<Shadow>(dmonStats);
		const nonPowerItems = shadow.items.contents.filter(x=> !x.isPower());
		await dmon.createEmbeddedDocuments("Item", nonPowerItems.map (x=> x.toJSON()));
		await this.convertPowers(shadow, dmon);
		await dmon.basePersona.resetCombatStats();
		return dmon;
	}

	static async convertPowers(original: Shadow, convert: Shadow) {
		const baseLevel = original.system.personaConversion.startingLevel ?? original.system.combat.personaStats.pLevel;
		await convert.update( {
			"system.combat.personaStats.pLevel": baseLevel,
			"system.combat.lastLearnedLevel": 0,
			"system.combat.powers": [],
		});
		await convert.onLevelUp_checkLearnedPowers(baseLevel, false);
	}

	static async convertOldLevelToNew( actor: ValidAttackers): Promise<number> {
		if (!actor.isValidCombatant()) {return 0;}
		const baseLevel = actor.system.combat.classData.level;
		const incrementals = actor.numOfIncAdvances();
		const maxInc = actor.maxIncrementalAdvances();
		const fractional = Math.round(incrementals / maxInc * 10);
		const lvl =  Math.clamp((baseLevel -1) * 10 + fractional, 1, 100 );
		const minXP = LevelUpCalculator.minXPForEffectiveLevel(lvl);
		if (actor.isPC()) {
			await actor.update ( {
				"system.personaleLevel": lvl,
				"system.personalXP": minXP
			});
		}
		await actor.update({
			"system.combat.personaStats.pLevel": lvl,
			"system.combat.personaStats.xp": minXP
		});
		if (actor.isNPCAlly() || actor.isShadow()) {
			await actor.basePersona.combatStats.autoSpendStatPoints();
			if (actor.isShadow()) {
				await actor.checkForMissingLearnedPowers();
			}
		}
		return lvl;
	}

}

