import {PersonaSettings} from "../config/persona-settings.js";
import {PersonaActor, Shadow} from "./actor/persona-actor.js";
import {PersonaCombat} from "./combat/persona-combat.js";
import {Metaverse} from "./metaverse.js";
import {Persona} from "./persona-class.js";
import {PersonaDB} from "./persona-db.js";
import {PersonaError} from "./persona-error.js";
import {PersonaSockets} from "./persona.js";

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
		return await PersonaCompendium.copyPersonaToCompendium(actor);
	});

});

export class PersonaCompendium {

	static COMPENDIUM_NAME_SUFFIX =" (Compendium)" as const;
	static PERSONA_SUMMON_LEVEL_MULT = 2 as const;

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

	static isCompendiumEntry(shadow: Shadow) : boolean {
		return shadow.system.personaConversion.isCompendiumEntry;
	}

	static convertToCompendiumName(actorName: string) : string {
		return  `${actorName}${this.COMPENDIUM_NAME_SUFFIX}`;
		// return  `${actorName} (Compendium)`;
	}

	private static async createNewCompendiumEntry(actor: Shadow): Promise<Shadow> {
		const name = this.convertToCompendiumName(actor.name);
		const personaData = {
			system: (actor.system.toJSON() as Shadow["system"]),
			type: "shadow",
			name,
			// name: `${actor.name} (Compendium)`,
			img: actor.img,
			prototypeToken: actor.prototypeToken,
			ownership: actor.ownership,
		} as const;
		const persona = await PersonaActor.create<Shadow>(personaData);
		if (!persona) {throw new PersonaError(`Couldn't create Compendiume entry for ${actor.name}`);}
		return persona;
	}

	private static async updateExistingCompendiumEntry( actor: Shadow, existing: Shadow) {
			const data = {
				system: actor.system.toJSON()
			};
			await existing.update(data);
			await existing.update( {"system.personaConversion.isCompendiumEntry": true});
			console.log(`Entry copied to existing ${existing.name}`);
			return true;
	}

	static async #copyPersonaToCompendium(actor: Shadow) {
		if (!actor.isPersona()) {
			throw new PersonaError(`Can't copy to compendium, ${actor.name} isn't a valid Persona`);
		}
		if (actor.isCompendiumEntry()) {
			throw new PersonaError("This is already a compendium Persona!");
		}
		let compEntry = actor.compendiumEntry;
		if (compEntry) {
			await this.updateExistingCompendiumEntry(actor, compEntry);
		} else {
			compEntry = await this.createNewCompendiumEntry(actor);
		}
		await compEntry.update( {"system.personaConversion.isCompendiumEntry": true});
		await actor.update( {"system.personaConversion.compendiumId": compEntry.id});
		return true;
	}

	static lookUpEntryFor(shadow: Shadow): U<Shadow> {
		if (!shadow.isPersona() || shadow.isCompendiumEntry()) {return undefined;}
		const compId = shadow.system.personaConversion.compendiumId;
		if (compId) {
			const entry = PersonaDB.getActorById(compId);
			if (entry && entry.isShadow()) {
				if (!entry.isCompendiumEntry()) {
					ui.notifications.warn(`${entry.name} is not registered as a compendium persona`);
				}
				return entry;
			}
		}
		const check = PersonaDB.getActorByName(PersonaCompendium.convertToCompendiumName(this.name));
		if (check && check.isShadow()) {
			if (!check.isCompendiumEntry()) {
				ui.notifications.warn(`${check.name} is not registered as a compendium persona`);
			}
			return check;
		}
		return undefined;
	}

	static isCopyableToCompendium(persona: Persona) : boolean {
		const actor = persona.source;
		return actor.isShadow()
			&& actor.isPersona()
			&& !persona.isPartial
			&& !actor.isCompendiumEntry();
	}

	static canUseCompendium() : boolean {
		if (game.user.isGM && PersonaSettings.debugMode()) {return true;}
		const metaverseReq = (!game.combat && Metaverse.getRegion()?.regionData.specialMods.includes("compendium-access")) ?? false;
		const nonMetaverseReq =	game.combat != undefined && (game.combat as PersonaCombat).isSocial;
		return  metaverseReq || nonMetaverseReq;
	}

	static convertToNormalName(compName: string) {
		if (!compName.includes(this.COMPENDIUM_NAME_SUFFIX)) {
			PersonaError.softFail("This doens't seem to be a compendium Name");
			return compName;
		}
		return compName.substring(0, compName.length-this.COMPENDIUM_NAME_SUFFIX.length);
	}

	static costToSummon(shadow: Shadow) : number {
		if (!shadow.isCompendiumEntry()) {return -1;}
		return shadow.level * this.PERSONA_SUMMON_LEVEL_MULT;
	}

}

