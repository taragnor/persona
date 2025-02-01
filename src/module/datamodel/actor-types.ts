import { PCAndNPCAllyCombatStats } from "../../config/actor-parts.js";
import { PCSpecificStuff } from "../../config/actor-parts.js";
import { SocialTargetBlockData } from "../../config/actor-parts.js";
import { shadowOnlyCombatAbilities } from "../../config/actor-parts.js";
import { encounterDataSchema } from "../../config/actor-parts.js";
import { sharedAbilities } from "../../config/actor-parts.js";
import { personalBio } from "../../config/actor-parts.js";
import { CREATURE_TAG_LIST } from "../../config/creature-tags.js";
const {StringField:txt, BooleanField: bool, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id, ObjectField: obj} = foundry.data.fields;
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
		}
	}

}

export class PCSchema extends window.foundry.abstract.TypeDataModel {
	get type() { return "pc" as const;}
	static override defineSchema() {
		const ret = {
			...BaseStuff.defineSchema(),
			...SocialTargetBlockData(),
			equipped: equipslots(),
			money: new num({integer: true, min: 0, initial:1}),
			creatureType: new txt({ choices: SHADOW_CREATURE_TYPE_LIST, initial: "npc-ally"}),
			...tarotFields(),
			combat: new sch( {
				...PCAndNPCAllyCombatStats(),
				powers_sideboard: new arr( new id()),
			}),
			bio: personalBio(),
			...PCSpecificStuff(),
			// slots: skillSlots(),
			...sharedAbilities(),
		} as const;
		return ret;
	}

	static override migrateData(data: any) {
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
		for (const def of ["fort", "ref", "will"] as const) {
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
			combat: new sch({
				...combatCommonStats(),
				...shadowOnlyCombatAbilities(),
			}),
		} as const;
		return ret;
	}

	static override migrateData(data: any) {
		const system= data as PC["system"];
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
				navigatorSkill: new id(),
				isNavigator: new bool(),
			}),
			...PCSpecificStuff(),
			bio: personalBio(),
			...sharedAbilities(),
			NPCSocialProxyId: new id(),
		} as const;
		return ret;
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
type testPC = SystemDataObjectFromDM<typeof PCSchema>;
type testNPC = SystemDataObjectFromDM<typeof NPCSchema>;
type testShadow =SystemDataObjectFromDM<typeof ShadowSchema>;

