/* eslint-disable no-unsafe-optional-chaining */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PCAndAllyStuff } from "../../config/actor-parts.js";
import { FREQUENCY } from "../../config/frequency.js";
import { frequencyConvert2 } from "../../config/actor-parts.js";
import { SocialQuestionDM } from "./item-types.js";
import { frequencyConvert } from "../../config/frequency.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { Shadow } from "../actor/persona-actor.js";
import { REALDAMAGETYPESLIST } from "../../config/damage-types.js";
import { PCAndNPCAllyCombatStats } from "../../config/actor-parts.js";
import { PCSpecificStuff } from "../../config/actor-parts.js";
import { SocialTargetBlockData } from "../../config/actor-parts.js";
import { shadowOnlyCombatAbilities } from "../../config/actor-parts.js";
import { encounterDataSchema } from "../../config/actor-parts.js";
import { sharedAbilities } from "../../config/actor-parts.js";
import { personalBio } from "../../config/actor-parts.js";
import { CREATURE_TAG_LIST } from "../../config/creature-tags.js";
const {EmbeddedDataField: embedded, StringField:txt, BooleanField: bool, NumberField: num, SchemaField: sch, ArrayField: arr, DocumentIdField: id, ObjectField: obj} = foundry.data.fields;
import { SHADOW_CREATURE_TYPE_LIST } from "../../config/shadow-types.js";
import { PC } from "../actor/persona-actor.js";
import { SHADOW_ROLE_LIST } from "../../config/shadow-types.js";
import { equipslots } from "../../config/actor-parts.js";
import { tarotFields } from "../../config/actor-parts.js";
import { combatCommonStats } from "../../config/actor-parts.js";

abstract class BaseStuff extends window.foundry.abstract.DataModel {

	static override defineSchema() {
		return {
			locked: new bool( { initial: false}),
			short_desc: new txt(),
			// flags: new arr(new obj<FlagData>()),
			creatureTags: new arr(new txt({choices:CREATURE_TAG_LIST})),
		};
	}

}

function talentConversion(data: any) {
	if (data.talents != undefined) {
		if (data.combat.talents == undefined || data.combat.talents.length == 0)  {
			const ids= data.talents.map((x:any)=> x.talentId);
			data.combat.talents = ids;
		}
	}
	return data;
}

export class PCSchema extends window.foundry.abstract.TypeDataModel {
	get type() { return "pc" as const;}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			...SocialTargetBlockData(),
			fatigue: new sch( {
				hasAlteredFatigueToday: new bool({initial: false}),
				hasMadeFatigueRollToday: new bool({initial: false}),
			}),
			equipped: equipslots(),
			money: new num({integer: true, min: 0, initial:1}),
			creatureType: new txt({ choices: SHADOW_CREATURE_TYPE_LIST, initial: "npc-ally"}),
			...tarotFields(),
			combat: new sch( {
				...PCAndNPCAllyCombatStats(),
			}),
			bio: personalBio(),
			...PCSpecificStuff(),
			...PCAndAllyStuff(),
			personaName: new txt({initial: "Persona"}),
			...sharedAbilities(),
			questions: new arr( new embedded(SocialQuestionDM)),
			trueOwner: new id(),
		} as const;
		return ret;
	}

	static override migrateData(data: any) {
		data = talentConversion(data);
		const system = data as PC["system"];
		const convert = function (x: number) {
			switch (true) {
				case x >= 5: return "ultimate";
				case x >= 2: return "strong";
				case x > -2: return "normal";
				case x >= -5: return "weak";
				case x >= -10 : return "pathetic";
				default: return "normal";
			}
		};
		const defensesSection =system?.combat?.defenses;
		for (const def of ["fort", "ref", "will"] as const) {
			if (defensesSection == undefined) {continue;}
			if (typeof system?.combat?.defenses[def] == "number") {
				system.combat.defenses[def] = convert(data.combat.defenses[def]);
			}
		}
		return data;
	}
}


export class ShadowSchema extends foundry.abstract.TypeDataModel {
	get type() { return "shadow" as const;}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			role: new txt({choices: SHADOW_ROLE_LIST, initial: "base"}),
			role2: new txt({choices: SHADOW_ROLE_LIST, initial: "base"}),
			scanLevel: new num({initial: 0, integer: true}),
			encounter: encounterDataSchema(),
			creatureType: new txt({ choices: SHADOW_CREATURE_TYPE_LIST, initial: "shadow"}),
			...tarotFields(),
			...sharedAbilities(),
			personaConversion: new sch({
				baseShadowId: new id(), // the base shadow that DMon and Persona are based off of, used to make learning abilities easier
				compendiumId: new id(), //Id of the compendium entry relating to this shadow
				startingLevel: new num({integer: true, min: 1, max: 150, initial: 1}),
			}),
			combat: new sch({
				...combatCommonStats(),
				...shadowOnlyCombatAbilities(),
				baseDamageType: new txt( {choices: REALDAMAGETYPESLIST, initial :"physical"} ),
			}),
		} as const;
		return ret;
	}

	static override migrateData(data: any) {
		const system = data as Shadow["system"];
		const convert = function (x: number) {
			switch (true) {
				case x >= 5: return "ultimate";
				case x >= 2: return "strong";
				case x > -2: return "normal";
				case x >= -5: return "weak";
				case x >= -10 : return "pathetic";
				default: return "normal";
			}
		};
		try {
			if (system.combat.resists?.gun == undefined) {
				system.combat.resists.gun = "normal";
			}
		} catch {
			if (game.user.isGM && PersonaSettings.debugMode()) {
				Debug(system);
				console.log("Error on Shadow Schema Convert");
			}
		}
		try {
			if (data.encounter.dungeons && system.encounter.dungeonEncounters.length == 0) {
				const dungeonIds : string[] = data.encounter.dungeons;
				for (const dungeonId of dungeonIds) {
					const conv =  frequencyConvert(system.encounter.frequency);
					system.encounter.dungeonEncounters.push({
						dungeonId,
						frequency: conv,
						frequencyNew: frequencyConvert2(conv as keyof typeof FREQUENCY),
					});
				}
				data.encounter.dungeons = [];
			}
		} catch  {
			console.log("Something went wrong with migrating dungeondata.");
			Debug(data.encounter);
		}
		if (typeof system?.combat?.defenses?.fort == "number") {
			system.combat.defenses.fort = convert(data.combat.defenses.fort);
			system.combat.defenses.ref = convert(data.combat.defenses.ref);
			system.combat.defenses.will = convert(data.combat.defenses.will);
		}
		return data;
	}
}

class NPCAllySchema extends foundry.abstract.TypeDataModel {
	get type() { return "npcAlly" as const;}

	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			...SocialTargetBlockData(),
			equipped: equipslots(),
			creatureType: new txt({ choices: ["npc-ally"] , initial: "npc-ally"}),
			...tarotFields(),
			combat: new sch( {
				...PCAndNPCAllyCombatStats(),
				// navigatorSkill: new id(), //deprecated
				navigatorSkills: new arr(new id()),
				isNavigator: new bool(),
			}),
			...PCAndAllyStuff(),
			bio: personalBio(),
			...sharedAbilities(),
			personaName: new txt({initial: "Persona"}),
			NPCSocialProxyId: new id(),
		} as const;
		return ret;
	}

	static override migrateData(d : any) {
		const data= super.migrateData(d);
		return talentConversion(data);
	}
}

export class NPCSchema extends foundry.abstract.TypeDataModel {
	get type() { return "npc" as const;}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			...SocialTargetBlockData(),
			creatureType: new txt({ choices: ["npc"] , initial: "npc"}),
			...tarotFields(),
			bio: personalBio(),
			questions: new arr( new embedded(SocialQuestionDM)),
			//include
		} as const;
		return ret;
	}
}

export class TarotSchema extends foundry.abstract.TypeDataModel {
	get type() { return "tarot" as const;}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			studentAbility: new txt(),
			perk: new txt(),
		} as const;
		return ret;
	}

	override prepareBaseData() : void {
	}
}

export const ACTORMODELS = {
	pc: PCSchema,
	shadow: ShadowSchema,
	npc: NPCSchema,
	tarot: TarotSchema,
	npcAlly: NPCAllySchema,
} as const;

//testing the types, purely for debug purposes
// type testPC = Foundry.SystemDataObjectFromDM<typeof PCSchema>;
// type testNPC = Foundry.SystemDataObjectFromDM<typeof NPCSchema>;
// type testShadow =Foundry.SystemDataObjectFromDM<typeof ShadowSchema>;


// type test = Foundry.TCSplit<typeof ACTORMODELS>;


