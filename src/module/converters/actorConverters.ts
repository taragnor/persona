import { LevelUpCalculator } from "../../config/level-up-calculator.js";
import { ValidAttackers } from "../combat/persona-combat.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { PersonaError } from "../persona-error.js";
import { Shadow } from "../actor/persona-actor.js";
import { PC } from "../actor/persona-actor.js";
import { PersonaDB } from "../persona-db.js";

export class ActorConverters {

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
		const personaTags = shadow.system.creatureTags.slice();
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
				...shadow.system.toJSON(),
				creatureType:  "persona",
				creatureTags: personaTags,
				personaConversion : {
					baseShadowId: shadow.id,
					startingLevel: shadow.system.personaConversion.startingLevel,
				},
				combat: {
					...shadow.system.combat,
					statusResists,
				}
			}
		};
		personaData.system!.combat!.powers = [];
		const persona = await PersonaActor.create<Shadow>(personaData);
		await persona.createEmbeddedDocuments("Item", shadow.items.contents.map (x=> x.toJSON()));
		await this.convertPowers(shadow, persona);
		return persona;
	}

	static async toDMon(shadow: Shadow): Promise<Shadow> {
		if (!shadow.isShadow()) {
			throw new PersonaError("Can't convert a non-shadow into a d-mon.");
		}
		if (!shadow.basePersona.isEligibleToBecomeDMon()) {
			throw new PersonaError(`${shadow.name} is Ineligible to become a D-Mon`);
		}
		const dmonTags = shadow.system.creatureTags.slice();
		dmonTags.pushUnique("d-mon");
		if (shadow.system.creatureType == "daemon") {
			dmonTags.pushUnique("simulated");
		}
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
				personaConversion : {
					baseShadowId: shadow.id,
					startingLevel: shadow.system.personaConversion.startingLevel,
				}
			},
		};
		dmonStats.system!.combat!.powers = [];
		const dmon = await PersonaActor.create<Shadow>(dmonStats);
		const nonPowerItems = shadow.items.contents.filter(x=> !x.isPower());
		await dmon.createEmbeddedDocuments("Item", nonPowerItems.map (x=> x.toJSON()));
		await this.convertPowers(shadow, dmon);
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

