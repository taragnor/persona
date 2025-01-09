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
		// itemCost: new num({ integer: true, min:0, initial: 0}),
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
		available: new bool()
	});
}

class Weapon extends foundry.abstract.TypeDataModel {
	get type() { return "weapon" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			damage: damage(),
			//Embedded test code
			// effects: new arr(new embedded(ConditionalEffectDM)),
			...effects (false),
		};
		return ret;
	}
}

class Focus extends foundry.abstract.TypeDataModel {
	get type() { return "focus" as const;}
	static override defineSchema() {
		const ret = {
			description: new txt(),
			...effects (false),
		}
		return ret;
	}
}

class UniversalModifier extends foundry.abstract.TypeDataModel {
	get type() { return "universalModifier" as const;}
	static override defineSchema() {
		const ret = {
			description: new html(),
			room_effect: new bool({initial: false}),
			...effects (false),
		}
		return ret;
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
		if (itemData.subtype == "magic" && (itemData.mpcost == undefined || itemData.mpcost == 0)) {
			const slot = (itemData as Power["system"]).slot;
			const isArea = itemData.targets == "all-enemies" || itemData.targets == "all-allies";
			const isExpensive = itemData.dmg_type == "light" || itemData.dmg_type == "dark" || itemData.dmg_type =="untyped";
			const statusEffectTags : typeof itemData["tags"] =["charm", "sleep", "fear", "confusion",   ];
			const isStatusEffect = itemData.tags.some( x=> statusEffectTags.includes(x));
			const isBuff = (itemData.tags.includes("buff") || itemData.tags.includes("debuff")) && !isStatusEffect;
			// const resurrection = itemData.targets == "1-nearby-dead" || itemData.targets == "all-dead-allies";
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


class Talent extends foundry.abstract.TypeDataModel {
	get type() { return "talent" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
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

class JobItemSchema extends foundry.abstract.TypeDataModel {
	get type() { return "job" as const;}
	static override defineSchema() {
		const ret = {
			baseRelationship: new txt(),
			weeklyAvailability: weeklyAvailability(),
			conditions: new arr(new obj<Precondition>()),
			subtype: new txt({initial: "job", choices: SOCIAL_CARD_TYPES_LIST}),
			keyskill: new sch({
				primary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),
				secondary: new txt( {choices: STUDENT_SKILLS_LIST, initial: "diligence"}),
			}),
			dc: new num({integer: true, initial: 0}),
			pay:new sch( {
				high: new num({initial: 0, min: 0, integer:true, max: 20}),
				low: new num({initial: 0, min: 0, integer:true, max: 20}),
			}),
			perk: new txt(),
			critical: new txt(),
			active: new bool({initial: false}),
			bane: new txt(),
			tokenSpends:new arr(new obj<TokenSpend>()),
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

			frequency: new num({initial: 1, integer: false}),
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
			//old event type
			// events: new arr( new obj<CardEvent>()),
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
			// globalModifiers: new arr( new obj<ConditionalEffect>()),
			active: new bool({initial: false}),
			tokenSpends:new arr(new obj<TokenSpend>()),
		}
		return ret;
	}

}

export const ITEMMODELS = {
	consumable: ConsumableSchema,
	item: InventoryItemSchema,
	power: PowerSchema,
	characterClass: CharacterClassDM,
	focus: Focus,
	talent: Talent,
	weapon: Weapon,
	universalModifier: UniversalModifier,
	job: JobItemSchema,
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
			volume: new num({initial: 1.0, integer:false, max: 1.0, min: 0}),
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
		const data = source as SystemDataObjectFromDM<typeof SocialCardEventDM>;
		if (data.conditions == undefined) {
			data.conditions = [];
		}
		if (!Array.isArray(data.conditions)) {
			data.conditions = ArrayCorrector(data.conditions);
		}
		if (data.choices == undefined)
			data.choices = [];
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
	static override migrateData(source: Record<string, any>) : typeof source {
		const  data = source as SystemDataObjectFromDM<typeof CardChoiceDM>;
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
type CardSChema = SystemDataObjectFromDM<typeof SocialCardSchema>;

type CCEDM = SystemDataObjectFromDM<typeof SocialCardEventDM>;

type CCDM = SystemDataObjectFromDM<typeof CardChoiceDM>;

//testing the types, purely for debug purposes
type CECon = SystemDataObjectFromDM<typeof CEContainer>;
type CEDM = SystemDataObjectFromDM<typeof ConditionalEffectDM>;
type CClass = SystemDataObjectFromDM<typeof CharacterClassDM>;
type PowerSO= SystemDataObjectFromDM<typeof PowerSchema>;

