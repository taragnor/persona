import { Power } from "../item/persona-item.js";
import { Consumable } from "../item/persona-item.js";
import { TokenSpend } from "../../config/social-card-config.js";
import { ConditionalEffect } from "./power-dm.js";
import { Precondition } from "../../config/precondition-types.js";
import { ThresholdOrDC } from "../../config/social-card-config.js";
import { Opportunity } from "../../config/social-card-config.js";
import { CardEvent } from "../../config/social-card-config.js";
const {StringField:txt, BooleanField: bool, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id } = foundry.data.fields;

import { SOCIAL_CARD_TYPES_LIST } from "../../config/social-card-config.js";
import { AVAILABILITY_LIST } from "../../config/availability-types.js";
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

class Weapon extends foundry.abstract.DataModel {
	get type() { return "weapon" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			damage: damage(),
			...effects (false),
		};
		return ret;
	}
}

class Focus extends foundry.abstract.DataModel {
	get type() { return "focus" as const;}
	static override defineSchema() {
		const ret = {
			description: new txt(),
			...effects (false),
		}
		return ret;
	}
}

class UniversalModifier extends foundry.abstract.DataModel {
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

class PowerSchema extends foundry.abstract.DataModel {
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
		const itemData = data as (Power["system"] | Consumable["system"]);
		let dmult = 0;
		if (itemData.melee_extra_mult == undefined && data.damage.low) {
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

class ConsumableSchema extends foundry.abstract.DataModel {
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
		if (itemData.melee_extra_mult == undefined && data.damage.low) {
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


class Talent extends foundry.abstract.DataModel {
	get type() { return "talent" as const;}
	static override defineSchema() {
		const ret = {
			desciption: new html(),
			...effects(false),
		}
		return ret;
	}
}


class InventoryItemSchema extends foundry.abstract.DataModel {
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

class JobItemSchema extends foundry.abstract.DataModel {
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

class SocialCardSchema extends foundry.abstract.DataModel {
	get type() { return "socialCard" as const;}
	static override defineSchema() {
		const ret = {
			cardType: new txt({initial: "social", choices: SOCIAL_CARD_TYPES_LIST}),
			//for social cards

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
			events: new arr( new obj<CardEvent>()),
			automatic: new txt(),
			skill: new txt<"primary" | "secondary">({initial: "primary"}),
			cameoType: new txt({initial: "none", choices: CAMEO_TYPES_LIST}),
			cameo: new txt(),
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
			globalModifiers: new arr( new obj<ConditionalEffect>()),
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


//testing the types, purely for debug purposes
type CClass = SystemDataObjectFromDM<typeof CharacterClassDM>;
type PowerSO= SystemDataObjectFromDM<typeof PowerSchema>;

