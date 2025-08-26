import { ValidAttackers } from "../combat/persona-combat.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaError } from "../persona-error.js";
import { Shadow } from "../actor/persona-actor.js";
import { PC } from "../actor/persona-actor.js";
import { PersonaDB } from "../persona-db.js";

export class ActorConverters {

	static async convertShadowPowers(actor: Shadow) : Promise<void> {
		if (!actor.isShadow()) return;
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
			throw new PersonaError("Can't convert a non-shadow into a persona.")
		}
		if (!shadow.basePersona.isEligibleToBecomePersona()) {
			throw new PersonaError(`${shadow.name} is Ineligible to become a Persona`);
		}
		const ownership = newOwner != undefined
		? { ownership: newOwner.ownership }
		: {};
		const persona = await PersonaActor.create<Shadow>( {
			name: `${shadow.name} (Persona)`,
			type: "shadow",
			...ownership,
			img: shadow.img,
			system: {
				...shadow.system.toJSON(),
				creatureType : "persona",
				baseShadowId: shadow.id,
			},
		}) as Shadow;

		await persona.createEmbeddedDocuments("Item", shadow.items.contents.map (x=> x.toJSON()))
		await shadow._stripShadowOnlyPowers();
		return persona;
	}

	static async toDMon(shadow: Shadow): Promise<Shadow> {
		if (!shadow.isShadow()) {
			throw new PersonaError("Can't convert a non-shadow into a d-mon.")
		}
		if (!shadow.basePersona.isEligibleToBecomeDMon()) {
			throw new PersonaError(`${shadow.name} is Ineligible to become a D-Mon`);
		}
		const dmonTags = shadow.system.creatureTags.slice();
		dmonTags.push("d-mon");
		const dmonStats : DeepPartial<Shadow> = {
			name: `${shadow.name} (D-Mon)`,
			type: "shadow",
			img: shadow.img,
			prototypeToken: {
				...shadow.prototypeToken,
				name: shadow.name,
			},
			system: {
				...shadow.system.toJSON(),
				creatureType : "d-mon",
				creatureTags: dmonTags,
				baseShadowId: shadow.id,
			},
		};
		const dmon = await PersonaActor.create<Shadow>(dmonStats);
		await dmon.createEmbeddedDocuments("Item", shadow.items.contents.map (x=> x.toJSON()))
		await dmon._stripShadowOnlyPowers();
		return dmon;
	}

	static convertOldLevelToNew( actor: ValidAttackers): number {
		const baseLevel = actor.system.combat.classData.level;
		const incrementals = actor.numOfIncAdvances();
		const maxInc = actor.maxIncrementalAdvances();
		const fractional = Math.round(incrementals / maxInc * 10);
		return (baseLevel -1) * 10 + fractional;
	}

}

