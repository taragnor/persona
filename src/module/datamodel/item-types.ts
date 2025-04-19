import { NumberTools } from "../utility/numberTools.js";
import { SocialCard } from "../item/persona-item.js";
import { UniversalModifier } from "../item/persona-item.js";
import { UNIVERSAL_MODIFIERS_TYPE_LIST } from "./universal-modifiers-types.js";
import { frequencyConvert } from "../../config/frequency.js";
import { FREQUENCY } from "../../config/frequency.js";
import { REALDAMAGETYPESLIST } from "../../config/damage-types.js";
import { PersonaItem } from "../item/persona-item.js";
import { CARD_TAG_LIST } from "../../config/card-tags.js";
import { CardRoll } from "../../config/social-card-config.js"
import { ArrayCorrector } from "../item/persona-item.js";
import { Consequence } from "../../config/consequence-types.js";
import { EQUIPMENT_TAGS_LIST } from "../../config/equipment-tags.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { Power } from "../item/persona-item.js";
import { Consumable } from "../item/persona-item.js";
import { TokenSpend } from "../../config/social-card-config.js";
import { ConditionalEffect } from "./power-dm.js";
import { Precondition } from "../../config/precondition-types.js";
import { ThresholdOrDC } from "../../config/social-card-config.js";
import { Opportunity } from "../../config/social-card-config.js";
const {EmbeddedDataField: embedded, StringField:txt, BooleanField: bool, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id, FilePathField: file } = foundry.data.fields;

import { SOCIAL_CARD_TYPES_LIST } from "../../config/social-card-config.js";
import { STUDENT_SKILLS_LIST } from "../../config/student-skills.js";
import { CharacterClassDM } from "./character-class-dm.js";
import { UsablePowerProps } from "./power-dm.js";
import { powerCost } from "./power-dm.js";
import { powerSpecific } from "./power-dm.js";
import { damage } from "./power-dm.js";
import { EQUIP_SLOTS_LIST } from "../../config/equip-slots.js";
import { effects } from "./power-dm.js";
import { CAMEO_TYPES_LIST } from "../../config/cameo-types.js";
import { PERK_TYPES_LIST } from "../../config/perk-types.js";

function itemBase() {
	return {
		description: new txt(),
		amount: new num({ integer: true, initial: 1, min: 0}),
		price: new num({ integer: true, initial: 0, min:0}),
		noTrade: new bool({initial: false}),
		itemTags: new arr(new txt({choices: EQUIPMENT_TAGS_LIST}))
	};
}

function weeklyAvailability() {
	return new sch( {
		Monday: new bool(),
		Tuesday: new bool(),
		Wednesday: new bool(),
		Thursday: new bool(),
		Friday: new bool(),
		Saturday: new bool(),
		Sunday: new bool(),
		available: new bool(),
		disabled: new bool()
	});
}

class WeaponDM extends foundry.abstract.TypeDataModel {
	get type() { return "weapon" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			damage: damage(),
			...effects (false),
			dmg_type: new txt( {choices: REALDAMAGETYPESLIST, initial:"physical"}),
		};
		return ret;
	}
}

class FocusDM extends foundry.abstract.TypeDataModel {
	get type() { return "focus" as const;}
	static override defineSchema() {
		const ret = {
			description: new txt(),
			...effects (false),
		}
		return ret;
	}
}

class UniversalModifierDM extends foundry.abstract.TypeDataModel {
	get type() { return "universalModifier" as const;}
	static override defineSchema() {
		const ret = {
			description: new html(),
			room_effect: new bool({initial: false}), //deprecated in favor of scope
			scope: new txt({choices: UNIVERSAL_MODIFIERS_TYPE_LIST, initial: "global"}),
			sceneList: new arr( new id()),
			...effects (false),
		}
		return ret;
	}

	static override migrateData(data: UniversalModifier["system"])  {
		if (data.room_effect == true) {
			data.scope = "room";
		}
		data.room_effect = false;
		return data;
	}
}

class SkillCardSchema extends foundry.abstract.TypeDataModel {
	get type() {return "skillCard" as const;}
	static override defineSchema() {
		return {
			...itemBase(),
			skillId: new id(),
		};
	}
}

class PowerSchema extends foundry.abstract.TypeDataModel {
	get type() {return "power" as const;}
	static override defineSchema() {
		const ret = {
			...powerSpecific(),
			...powerCost(),
			...UsablePowerProps(),
			...effects(true),
		};
		return ret;
	}

	static override migrateData(data: any)  {
		const itemData = data as (Power["system"]);
		let dmult = 0;
		if (itemData.subtype == "magic" && (itemData.mpcost == undefined || itemData.mpcost == -1)) {
			const slot = (itemData as Power["system"]).slot;
			const isArea = itemData.targets == "all-enemies" || itemData.targets == "all-allies";
			const isExpensive = itemData.dmg_type == "light" || itemData.dmg_type == "dark" || itemData.dmg_type =="untyped";
			const statusEffectTags : typeof itemData["tags"] =["charm", "sleep", "fear", "confusion",   ];
			const isStatusEffect = itemData.tags.some( x=> statusEffectTags.includes(x));
			const isBuff = (itemData.tags.includes("buff") || itemData.tags.includes("debuff")) && !isStatusEffect;
			const areaMult = 1.5 + (isStatusEffect ? 1.0 : 0);
			const mult = (1 + (isExpensive ? 1 : 0) + (isBuff ? 0.5 : 0)) * (isArea ? areaMult : 1);
			const baseCost = PersonaActor.convertSlotToMP(slot);
			const mpCost = baseCost * mult;
			itemData.mpcost = Math.round(mpCost);
		}
		if (itemData?.melee_extra_mult == undefined && data?.damage?.low) {
			const dmglow = itemData?.damage?.low;
			switch (true) {
				case dmglow == 0: dmult = 0; break;
				case	dmglow <= 5: dmult = 2;   break;
				case dmglow <=10: dmult = 4; break;
				case dmglow <=25: dmult = 7; break;
				case dmglow >25: dmult= 10; break;
				default: break;
			}
			itemData.melee_extra_mult = dmult;
		}
		return data;
	}
}

class ConsumableSchema extends foundry.abstract.TypeDataModel {
	get type() {return "consumable" as const;}
	static override defineSchema() {
		const ret = {

			subtype: new txt({ initial: "consumable", choices: ["consumable"]}),
			...itemBase(),
			...UsablePowerProps(),
			...effects(true),
		};
		return ret;
	}

	static override migrateData(data: any)  {
		const itemData = data as (Power["system"] | Consumable["system"]);
		let dmult = 0;
		if (itemData.melee_extra_mult == undefined && itemData?.damage?.low) {
			const dmglow = itemData.damage.low;
			switch (true) {
				case dmglow == 0: dmult = 0; break;
				case	dmglow <= 5: dmult = 2;   break;
				case dmglow <=10: dmult = 4; break;
				case dmglow <=25: dmult = 7; break;
				case dmglow >25: dmult= 10; break;
				default: break;
			}
			itemData.melee_extra_mult = dmult;
		}
		return data;
	}
}


class TalentDM extends foundry.abstract.TypeDataModel {
	get type() { return "talent" as const;}
	get _systemData() { return this as DataModelSystemData<typeof TalentDM>
			;}

		override prepareBaseData() {
			const d = this._systemData;
			const test = this._systemData.test!;
			const test2 = this._systemData.description;
		}

	get test() {return 5 as const;}

	static override defineSchema() {
		const ret = {
			description: new html(),
			...effects(false),
		}
		return ret;
	}
}


class InventoryItemSchema extends foundry.abstract.TypeDataModel {
	get type() { return "item" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			slot: new txt<typeof EQUIP_SLOTS_LIST[number]>({choices: EQUIP_SLOTS_LIST}),
			...effects(false),
		}
		return ret;
	}
}

class SocialCardSchema extends foundry.abstract.TypeDataModel {
	get type() { return "socialCard" as const;}
	static override defineSchema() {
		const ret = {
			cardType: new txt({initial: "social", choices: SOCIAL_CARD_TYPES_LIST}),
			//for social cards
			cardTags: new arr( new txt({choices: CARD_TAG_LIST})),
			frequency: new num({initial: 1, integer: false}),
			announceWhenAvailable: new bool({initial : false}),
			qualifiers: new arr( new obj<{
				relationshipName: string,
				min: number,
				max: number,
			}>({
				initial: {relationshipName: "Unnamed Relationship", min:0, max:0}
			}), {initial: []}),
			//for nonsocial cards
			dc: new obj<ThresholdOrDC>( {
				initial: {
					thresholdType: "static",
					num: 0
				},
			}),
			keyskill: new sch({
				primary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),
				secondary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),
			}),
			weeklyAvailability: weeklyAvailability(),

			//for all cards
			conditions: new arr(new obj<Precondition>()),
			availabilityConditions: new arr(new obj<Precondition>()),
			num_of_events: new num({initial: 0, min:0, max: 5, integer:true}),
			events: new arr( new embedded(SocialCardEventDM)),
			automatic: new txt(),
			skill: new txt<"primary" | "secondary">({initial: "primary"}),
			cameoType: new txt({initial: "none", choices: CAMEO_TYPES_LIST}),
			cameoConditions: new arr(new obj<Precondition>()),
			cameo: new txt(),
			cameoStdPerk: new bool({initial: false}),
			perkType: new txt({choices: PERK_TYPES_LIST, initial: "standard"}),
			perkDisabled: new bool({initial: false}),
			perk: new txt( {initial: ""}),
			cameoOpportunity: new txt(),
			opportunity: new txt(), //deprecated
			opportunity_choices: new num({initial:0, integer: true, min: 0, max: 10}),
			opportunity_list: new arr(new obj<Opportunity>()),
			bane: new txt(),
			boon: new txt(),
			finale: new txt(),
			globalModifiers: new arr(new embedded(ConditionalEffectDM)),
			active: new bool({initial: false}),
			tokenSpends:new arr(new obj<TokenSpend>()),
			immediateEffects: new arr(new embedded(ConditionalEffectDM)),
		}
		return ret;
	}

}

export const ITEMMODELS = {
	consumable: ConsumableSchema,
	item: InventoryItemSchema,
	power: PowerSchema,
	characterClass: CharacterClassDM,
	focus: FocusDM,
	talent: TalentDM,
	weapon: WeaponDM,
	universalModifier: UniversalModifierDM,
	skillCard: SkillCardSchema,
	// job: JobItemSchema,
	socialCard: SocialCardSchema,
} as const;

export class ConditionalEffectDM extends foundry.abstract.DataModel {
	static override defineSchema() {
		return {
			conditions: new arr(new obj<Precondition>({required: true, initial: [] as any})),
			consequences: new arr(new obj<Consequence>({required: true, initial: [] as any})),
		};
	}

	static override migrateData(data: ConditionalEffect) : ConditionalEffect {
		let change= false;
		if (data.conditions == undefined)  {
			change = true;
			data.conditions = [];
		}
		if (data.consequences == undefined) {
			change = true;
			data.consequences = [];
		}
		if ( !Array.isArray(data.conditions)
			|| !Array.isArray(data.consequences)) {
			change = true;
			data.conditions = ArrayCorrector(data.conditions);
			data.consequences = ArrayCorrector(data.consequences);
		}
		if (change) {
			console.debug("Migrate Dagae for ConditionalEffectDM making changes");
		}
		return data;
	}

}

class CEContainer extends foundry.abstract.DataModel {
	static override defineSchema() {
		return {
			emb: new arr(new embedded(ConditionalEffectDM)),
		}
	}

}

class SocialCardEventDM extends foundry.abstract.DataModel {
	static override defineSchema() {
		return {
			name: new txt({initial: "New Event"}),
			img: new file({categories: ["IMAGE"]}),
			sound: new file ({categories: ["AUDIO"] }),
			volume: new num({initial: 0.5, integer:false, max: 1.0, min: 0}),
			label: new txt(),
			text: new txt(),
			frequency: new num({initial: 1.0, integer: false}),
			placement: new sch({
				starter: new bool({initial: true}),
				middle: new bool({initial: true}),
				finale: new bool({initial: true}),
				special: new bool({initial: false}),
			}),
			conditions: new arr(new obj<Precondition>()),
			choices: new arr(new embedded(CardChoiceDM)),
		};
	}

	static override migrateData(source: Record<string, any>) : typeof source {
		const data = source as Foundry.SystemDataObjectFromDM<typeof SocialCardEventDM>;
		if (data.conditions == undefined) {
			data.conditions = [];
		}
		if (!Array.isArray(data.conditions)) {
			data.conditions = ArrayCorrector(data.conditions);
		}
		if (data.choices == undefined)
			data.choices = [];
		if (FREQUENCY[data.frequency as keyof typeof FREQUENCY] == undefined) {
			data.frequency = frequencyConvert(data.frequency);
		}
		return source;
	}
}

class CardChoiceDM extends foundry.abstract.DataModel {
	static override defineSchema() {
		return {
			name: new txt({initial: "New Choice"}),
			conditions: new arr(new obj<Precondition>()),
			text: new txt(),
			roll: new obj<CardRoll>(),
			postEffects: new sch({
				effects: new arr(new embedded(ConditionalEffectDM)),
			}),
		};

	}

	get appendedText() : string {
		const data = this as SocialCard["system"]["events"][number]["choices"][number];
		let starterTxt = "";

		const roll = data.roll;
		switch (roll.rollType) {
			case "studentSkillCheck":
				if (roll.progressSuccess != 0 || roll.progressCrit != 0) {
					const modifier = roll.modifier == 0 ? "" : `at ${NumberTools.signed(roll.modifier)}`;
					starterTxt += ` ${roll.studentSkill} ${modifier} Check Success (${roll.progressSuccess} + ${roll.progressCrit}).`;
				}
				break;
			case "save":
					const modifier = (roll.modifier ?? 0) == 0 ? "" : `at ${NumberTools.signed(roll.modifier)}`;
				if (roll.progressSuccess != 0) {
					starterTxt += `${roll.saveType} Save Success ${modifier} (${roll.progressSuccess} + ${roll.progressCrit}).`;
				}
			default:
		}
		if ((roll.progressFail ?? 0) != 0) {
			starterTxt += ` Gain ${roll.progressFail} on failure.`;
		}
		return starterTxt +  data.text
	}



	static override migrateData(source: Record<string, any>) : typeof source {
		const  data = source as Foundry.SystemDataObjectFromDM<typeof CardChoiceDM>;
		if (data.conditions == undefined) {
			data.conditions = [];
		}
		if (!Array.isArray(data.conditions)) {
			data.conditions = ArrayCorrector(data.conditions);
		}
		if (data.postEffects.effects == undefined) {
			data.postEffects.effects = [];
		}
		if (!Array.isArray(data.postEffects.effects)) {
			data.postEffects.effects = ArrayCorrector(data.postEffects.effects);
		}
		return source;
	}

}

namespace Test{
	type CardSChema = Foundry.SystemDataObjectFromDM<typeof SocialCardSchema>;
	type CCEDM = Foundry.SystemDataObjectFromDM<typeof SocialCardEventDM>;
	type CCDM = Foundry.SystemDataObjectFromDM<typeof CardChoiceDM>;

	//testing the types, purely for debug purposes
	type CECon = Foundry.SystemDataObjectFromDM<typeof CEContainer>;
	type CEDM = Foundry.SystemDataObjectFromDM<typeof ConditionalEffectDM>;
	type CClass = Foundry.SystemDataObjectFromDM<typeof CharacterClassDM>;
	type PowerSO= Foundry.SystemDataObjectFromDM<typeof PowerSchema>;
	type SC = Foundry.SystemDataObjectFromDM<typeof SkillCardSchema>;

}
