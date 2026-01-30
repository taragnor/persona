/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { DamageType, REALDAMAGETYPESLIST } from "../../config/damage-types.js";
import { PCAndNPCAllyCombatStats } from "../../config/actor-parts.js";
import { PCSpecificStuff } from "../../config/actor-parts.js";
import { SocialTargetBlockData } from "../../config/actor-parts.js";
import { shadowOnlyCombatAbilities } from "../../config/actor-parts.js";
import { encounterDataSchema } from "../../config/actor-parts.js";
import { sharedAbilities } from "../../config/actor-parts.js";
import { personalBio } from "../../config/actor-parts.js";
import { CreatureTag, InternalCreatureTag } from "../../config/creature-tags.js";
const {EmbeddedDataField: embedded, StringField:txt, BooleanField: bool, NumberField: num, SchemaField: sch, ArrayField: arr, DocumentIdField: id, ObjectField: obj} = foundry.data.fields;
import { SHADOW_CREATURE_TYPE_LIST } from "../../config/shadow-types.js";
import { SHADOW_ROLE_LIST } from "../../config/shadow-types.js";
import { equipslots } from "../../config/actor-parts.js";
import { tarotFields } from "../../config/actor-parts.js";
import { combatCommonStats } from "../../config/actor-parts.js";
import {PersonaStat} from "../../config/persona-stats.js";
import {NavigatorTrigger} from "../navigator/nav-voice-lines.js";
import {PROBABILITY_LIST} from "../../config/probability.js";
import {PersonaActor} from "../actor/persona-actor.js";

abstract class BaseStuff extends window.foundry.abstract.DataModel {

	static override defineSchema() {
		return {
			locked: new bool( { initial: false}),
			short_desc: new txt(),
			// flags: new arr(new obj<FlagData>()),
			// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
			creatureTags: new arr(new txt<InternalCreatureTag | Tag["id"]>()),
		};
	}

}

function talentConversion(data: any) {
	if (data.talents != undefined) {
		if (data.combat.talents == undefined || data.combat.talents.length == 0)  {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
				...combatCommonStats(),
				...PCAndNPCAllyCombatStats(),
			}),
			bio: personalBio(),
			...PCSpecificStuff(),
			...PCAndAllyStuff(),
			...sharedAbilities(),
			questions: new arr( new embedded(SocialQuestionDM)),
			trueOwner: new id<User>(),
		} as const;
		return ret;
	}

	static override migrateData(data: any) {
		data = talentConversion(data);
		const system = data as PC["system"];
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
				fusionConditions: new arr(new obj<Precondition>()),
				isCompendiumEntry: new bool(),
			}),
			combat: new sch({
				...combatCommonStats(),
				...shadowOnlyCombatAbilities(),
				baseDamageType: new txt( {choices: REALDAMAGETYPESLIST, initial :"physical"} ),
			}),
		} as const;
		return ret;
	}

	static probConvert(prob: number) : typeof PROBABILITY_LIST[number] {
		switch (true) {
			case prob == 0:
				return "never";
			case prob >= 75:
				return "always";
			case prob >= 25:
				return "common";
			case prob >= 15:
				return "common-minus";
			case prob >= 10:
				return "normal-plus";
			case prob >= 5:
				return "normal";
			case prob > 2:
				return "normal-minus";
			case prob >= 1:
				return "rare-plus";
			default:
				return "rare";
		}
	}

	static reviseTreasure(treasure: Shadow["system"]["encounter"]["treasure"]) {
		if (treasure.cardProb_v == undefined) {
			treasure.cardProb_v = this.probConvert(treasure.cardProb);
			treasure.item0prob_v = this.probConvert(treasure.item0prob);
			treasure.item1prob_v = this.probConvert(treasure.item1prob);
			treasure.item2prob_v = this.probConvert(treasure.item2prob);
			treasure.item0maxAmt = 1;
			treasure.item1maxAmt = 1;
			treasure.item2maxAmt = 1;
		}
	}

	static override migrateData(data: any) {
		const system = data as Shadow["system"];
		try {
			const treasure= system?.encounter?.treasure;
			if (treasure != undefined) {
				this.reviseTreasure(treasure);
			}

			if (system?.combat?.resists && system.combat.resists?.gun == undefined) {
				system.combat.resists.gun = "normal";
			}
		} catch (e) {
			if (game.user.isGM && PersonaSettings.debugMode()) {
				// Debug(system);
				console.log("Error on Shadow Schema Convert");
				Debug(e);
				Debug(data);
			}
		}
		try {
			if (data?.encounter?.dungeons && system?.encounter?.dungeonEncounters?.length == 0) {
				const dungeonIds : string[] = data.encounter.dungeons;
				for (const dungeonId of dungeonIds) {
					const conv =  frequencyConvert(system.encounter.frequency);
					system.encounter.dungeonEncounters.push({
						dungeonId,
						// frequency: conv,
						frequencyNew: frequencyConvert2(conv as keyof typeof FREQUENCY),
					});
				}
				data.encounter.dungeons = [];
			}
		} catch  {
			console.log("Something went wrong with migrating dungeondata.");
			// Debug(data.encounter);
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
				...combatCommonStats(),
				...PCAndNPCAllyCombatStats(),
				navigatorSkills: new arr(new id<Power>()),
				isNavigator: new bool(),
				navigatorVoice: new arr(
					new sch({
						fileName: new txt(),
						trigger: new txt<NavigatorTrigger>(),
						elementType: new txt<DamageType>(),
					})
				),
			}),
			...PCAndAllyStuff(),
			bio: personalBio(),
			...sharedAbilities(),
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
			sortOrder: new num({initial: 0}),
			preferred_stat: new txt<PersonaStat | "">({initial:"" }),
			disfavored_stat: new txt<PersonaStat | "">({initial:"" }),
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
// type j = Foundry.SchemaConvert<Foundry.Branded<string, "hello">>;
// type testNPC = Foundry.SystemDataObjectFromDM<typeof NPCSchema>;
// type testShadow =Foundry.SystemDataObjectFromDM<typeof ShadowSchema>;


// type test = Foundry.TCSplit<typeof ACTORMODELS>;


