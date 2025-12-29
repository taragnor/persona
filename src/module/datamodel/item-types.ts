/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { damage, damageNew, effects, powerCost, powerOnlyUsableProps, powerSpecific, triEffects, UsablePowerProps } from "./power-dm.js";
import { CONSUMABLE_SUBTYPE_LIST } from "../../config/equip-slots.js";
import { ROLL_TAGS_AND_CARD_TAGS } from "../../config/roll-tags.js";
import { UNIVERSAL_MODIFIERS_TYPE_LIST } from "./universal-modifiers-types.js";
import { FREQUENCY, frequencyConvert } from "../../config/frequency.js";
import { REALDAMAGETYPESLIST } from "../../config/damage-types.js";
import { CardRoll, Opportunity, SOCIAL_CARD_TYPES_LIST, ThresholdOrDC, TokenSpend } from "../../config/social-card-config.js";
import { ArrayCorrector, PersonaItem } from "../item/persona-item.js";
import { Consequence } from "../../config/consequence-types.js";
import { EQUIPMENT_TAGS_LIST } from "../../config/equipment-tags.js";
const {EmbeddedDataField: embedded, StringField:txt, BooleanField: bool, ObjectField:obj, NumberField: num, SchemaField: sch, HTMLField: html , ArrayField: arr, DocumentIdField: id, FilePathField: file, EmbeddedCollectionField : collection } = foundry.data.fields;

import { STUDENT_SKILLS_LIST } from "../../config/student-skills.js";
import { CharacterClassDM } from "./character-class-dm.js";
import { EQUIP_SLOTS_LIST } from "../../config/equip-slots.js";
import { CAMEO_TYPES_LIST } from "../../config/cameo-types.js";
import { PERK_TYPES_LIST } from "../../config/perk-types.js";
import { TREASURE_TABLES } from "../../config/treasure-tables.js";
import { PROBABILITIES } from "../../config/probability.js";
import {TAG_TYPES} from "../../config/tags-general.js";
import {PreconditionConverter} from "../migration/convertPrecondition.js";
import {ConsequenceConverter} from "../migration/convertConsequence.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaError} from "../persona-error.js";
import {CardEventSheet} from "../item/sheets/card-event-sheet.js";

function itemBase() {
	return {
		description: new txt(),
		amount: new num({ integer: true, initial: 1, min: 0}),
		price: new num({ integer: true, initial: 0, min:0}),
		noTrade: new bool({initial: false}),
		itemTags: new arr(new txt<typeof EQUIPMENT_TAGS_LIST[number] | Item["id"]>()),
		treasure: itemTreasureStats(),
		itemLevel: new num( {initial: 0, integer: true}),
		storeMax: new num({ integer: true, initial: 0, min:0, max: 50}),
		storeId: new id(), //id of store actor
	};
}

function itemTreasureStats() {
	const tablesEntries = {
		trinkets: treasureEntry(),
		lesser: treasureEntry(),
		greater: treasureEntry(),
		royal: treasureEntry()
	} satisfies Record<Exclude<keyof typeof TREASURE_TABLES, "none">, unknown>;
	return new sch(
		tablesEntries
	);
}

function treasureEntry() {
	return new sch({
		enabled: new bool(),
		minLevel: new num({initial: 0, integer: true}),
		maxLevel: new num({initial: 0, integer: true}),
		rarity: new txt({choices: PROBABILITIES, initial:"normal"}),
	});
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
			damageNew: damageNew(),
			...effects (false),
			dmg_type: new txt( {choices: REALDAMAGETYPESLIST, initial:"physical"}),
		};
		return ret;
	}

	static override migrateData(data: Weapon["system"]): Weapon["system"] {
		if (data?.damageNew == undefined && data?.damage?.low > 0) {
			data.damageNew = {
				weaponLevel: data.damage.low -1,
				baseAmt: PersonaSettings.getDamageSystem().convertFromOldLowDamageToNewBase(data?.damage?.low ?? 0),
				extraVariance: 0,
			};
			data.itemLevel = data.damage.low - 1;
		}
		if (data?.damageNew?.weaponLevel && data?.itemLevel == undefined) {
			data.itemLevel = data.damageNew.weaponLevel;
			// data.damageNew.weaponLevel = 0;
		}
		return data;
	}

}

class FocusDM extends foundry.abstract.TypeDataModel {
	get type() { return "focus" as const;}
	static override defineSchema() {
		const ret = {
			description: new txt(),
			defensive: new bool(),
			...effects (false),
		};
		return ret;
	}
}

class TagSchema extends foundry.abstract.TypeDataModel {
	get type() { return "tag" as const;}
	static override defineSchema() {
		const ret = {
			hidden: new bool(),
			description: new txt(),
			defensive: new bool(),
			tagType: new txt({choices: TAG_TYPES}),
			linkedInternalTag: new txt(),
			treasure: itemTreasureStats(),
			...effects (false),
		};
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
		};
		return ret;
	}

	static override migrateData(data: UniversalModifier["system"])  {
		if (data.scope != undefined) {
			return data;
		}
		if (data?.room_effect === true) {
			data.scope = "room";
		}
		if ("room_effect" in data) {
			data.room_effect = false;
		}
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
			...powerOnlyUsableProps(),
			...powerSpecific(),
			...powerCost(),
			...UsablePowerProps(),
			...effects(true),
		};
		return ret;
	}

	static override migrateData(data: any)  {
		const itemData = data as (Power["system"]);
		//@ts-expect-error will is no longer a valid choice
		if (itemData.defense == "will") {
			itemData.defense = "ail";
		}

		if (itemData?.ailmentChance =="always" && itemData?.damageLevel == "none") {
			itemData.ailmentChance = "high";
			itemData.defense = "ail";
		}
		return data;
	}
}

class ConsumableSchema extends foundry.abstract.TypeDataModel {
	get type() {return "consumable" as const;}
	static override defineSchema() {
		const ret = {
			subtype: new txt({ initial: "consumable", choices: CONSUMABLE_SUBTYPE_LIST}),
			...itemBase(),
			...UsablePowerProps(),
			...effects(true),
		};
		return ret;
	}

	static override migrateData(data: Consumable["system"])  {
		if (data.targets as string == "1-ally") {
			data.targets = "1-engaged";
		}
		//@ts-expect-error will is no longer a valid choice
		if (data.defense == "will") {
			data.defense = "ail";
		}
		return data;
	}
}


class TalentDM extends foundry.abstract.TypeDataModel {
	get type() { return "talent" as const;}
	get _systemData() { return this as DataModelSystemData<typeof TalentDM>
			;}

	override prepareBaseData() {
	}

	get test() {return 5 as const;}

	static override defineSchema() {
		const ret = {
			description: new html(),
			defensive: new bool(),
			shadowOnly: new bool(),
			hideOnList: new bool(),
			...effects(false),
		};
		return ret;
	}
}


class InventoryItemSchema extends foundry.abstract.TypeDataModel {
	get type() { return "item" as const;}
	static override defineSchema() {
		const ret = {
			...itemBase(),
			slot: new txt<typeof EQUIP_SLOTS_LIST[number]>({choices: EQUIP_SLOTS_LIST}),
			armorHPBoost: new num( {initial: 0, integer: true}),
			armorLevel: new num( {initial: 0, integer: true}),
			armorDR : new num( {initial: 0, integer:true}),
			...effects(false),
			...triEffects(),
		};
		return ret;
	}

	static override migrateData(data: InvItem["system"]) : InvItem["system"] {
		if ("armorLevel" in data && data.itemLevel == undefined) {
			data.itemLevel = data.armorLevel;
			// data.armorLevel = 0;
		}
		return data;
	}
}

class SocialCardSchema extends foundry.abstract.TypeDataModel {
	get type() { return "socialCard" as const;}
	static override defineSchema() {
		const ret = {
			cardType: new txt({initial: "social", choices: SOCIAL_CARD_TYPES_LIST}),
			//for social cards
			cardTags: new arr( new txt({choices: ROLL_TAGS_AND_CARD_TAGS})),
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
			// eventsC: new collection(PersonaItem ) ,
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
		};
		return ret;
	}

	static override migrateData(data: SocialCard["system"]) {
	return data;
	}
}


export class ConditionalEffectDM extends foundry.abstract.DataModel {
	static override defineSchema() {
		return {
			isEmbedded: new bool(),
			isDefensive: new bool(),
			conditions: new arr(new obj<Precondition>({required: true})),
			consequences: new arr(new obj<Consequence>({required: true})),
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
		if ( !Array.isArray(data.conditions)) {
			change = true;
			data.conditions = ArrayCorrector(data.conditions) as typeof data.conditions ;
		}
		data.conditions = data.conditions
			.map (cond => PreconditionConverter.convertDeprecated(cond));
		if(!Array.isArray(data.consequences)) {
			change = true;
			data.consequences = ArrayCorrector(data.consequences) as typeof data.consequences;
		}
		data.consequences = data.consequences
			.map (cons=> ConsequenceConverter.convertDeprecated(cons));
		if (change) {
			console.debug("Migrate Data for ConditionalEffectDM making changes ");
		}
		return data;
	}

}

// class CEContainer extends foundry.abstract.DataModel {
// 	static override defineSchema() {
// 		return {
// 			emb: new arr(new embedded(ConditionalEffectDM)),
// 		};
// 	}
// }

export class SocialQuestionDM extends foundry.abstract.DataModel {
	static override defineSchema() {
		return {
			name: new txt({initial: "Unnamed Question"}),
			label: new txt(),
			text: new txt(),
			choices: new arr(new embedded(QuestionChoiceDM)),
			SLmin: new num({initial: 1, integer: true, max: 10, min:1}),
			SLmax: new num({initial: 10, integer: true, max: 10, min:1}),
			requiresDating: new bool({initial: false}),
			expended: new bool({initial: false}),
		};
	}
}

class QuestionChoiceDM extends foundry.abstract.DataModel {
	static override defineSchema() {
		return {
			name: new txt({initial: "New Choice"}),
			response: new txt(),
			progressSuccess: new num({initial: 0, integer: true}),
		};
	}

}

export class SocialCardEventDM extends foundry.abstract.DataModel {

	#sheet: U<CardEventSheet>;

	get sheet() {
		if (this.#sheet) {return this.#sheet;}
		const SC =this?.parent?.parent ;

		if (!(SC instanceof PersonaItem) || !SC.isSocialCard() ) {
			throw new PersonaError("Can't get containing social card for SocialCardEventDM");
		}
		return this.#sheet = new CardEventSheet(this, SC);
	}


	static override defineSchema() {
		return {
			name: new txt({initial: "New Event"}),
			img: new file({categories: ["IMAGE"]}),
			sound: new file ({categories: ["AUDIO"] }),
			volume: new num({initial: 0.5, integer:false, max: 1.0, min: 0}),
			label: new txt(),
			text: new txt(),
			eventTags: new arr( new txt({choices: ROLL_TAGS_AND_CARD_TAGS })),
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

	async update(subUpdateObj : Record< string, unknown>):  Promise<unknown> {
		const index= this.parentIndex();
		if (index == undefined) {
			Debug(subUpdateObj);
			return;
		}
		const cardSystem = this.parent as SocialCard["system"];
		if (!(this.parent instanceof SocialCardSchema)) {
			Debug (this, this.parent);
			throw new PersonaError("Parent isn't social card schema");
		}
		const oldSheet =this.sheet;
		const cardObj = cardSystem.parent;
		if (!(cardObj instanceof PersonaItem && cardObj.isSocialCard() )) {
			throw new PersonaError("Parent isn't social card");
		}
		const events = cardObj.system.events;
		events[index] = new SocialCardEventDM(foundry.utils.mergeObject(events[index].toJSON!(), subUpdateObj)) as unknown as typeof events[number];
		const updateObj  = {
			"system.events" : events,
		};
		console.log(updateObj);
		console.log(subUpdateObj);
		const ret = await cardObj.update(updateObj);
		if (ret == undefined) {
			// Debug(updateObj);
			// Debug(subUpdateObj);
			// ui.notifications.warn("Update may not have gone through");
			cardObj._initialize();
		}
		const evRefresh = cardObj.system.events[index];
		if (!(evRefresh instanceof SocialCardEventDM)) {
			throw new Error("Not instance of ocailCardEventDM");
		}
		evRefresh.#sheet = oldSheet;
		this.#sheet = undefined;
		evRefresh.sheet._event = evRefresh;
		if (evRefresh.parentIndex() == undefined) {
			throw new Error("Something weird happened");
		}
		evRefresh.sheet.render(false);
		return ret;
	}

	parentIndex() : U<number> {
		if (!(this.parent instanceof SocialCardSchema)) { return undefined;}
		const parent = this.parent as SocialCard["system"];
		const index = parent.events.findIndex( x=> x== this);
		if (index == -1)  {
			Debug(this);
			ui.notifications.error("Index Not Found for event");
			return undefined;
		}
		return index;
	}


	static override migrateData(source: Record<string, any>) : typeof source {
		const data = source as Foundry.SystemDataObjectFromDM<typeof SocialCardEventDM>;
		if (data.conditions == undefined) {
			data.conditions = [];
		}
		if (!Array.isArray(data.conditions)) {
			data.conditions = ArrayCorrector(data.conditions)as typeof data.conditions;
		}
		if (data.choices == undefined)
			{data.choices = [];}
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
			resourceCost: new num({initial: 0}),
			roll: new obj<CardRoll>(),
			postEffects: new sch({
				effects: new arr(new embedded(ConditionalEffectDM)),
			}),
		};
	}

	get appendedText() : string {
		type Choice = SocialCard["system"]["events"][number]["choices"][number];
		const data = this as Choice;
		let starterTxt = "";

		const roll = data.roll;
		roll.progressCrit = roll.progressCrit == undefined ? 0 : roll.progressCrit;
		roll.progressSuccess = roll.progressSuccess == undefined ? 0 : roll.progressSuccess;
		roll.progressFail = roll.progressFail == undefined ? 0 : roll.progressFail;
		switch (roll.rollType) {
			case "question":
				return ""; //early bail out to not give away info
			case "studentSkillCheck":
				if (roll.progressSuccess || roll.progressCrit) {
					// const modifier = roll.modifier == 0 ? "" : `at ${NumberTools.signed(roll.modifier)}`;
					const modifier = 0;
					starterTxt += ` ${roll.studentSkill} ${modifier ? modifier : ""} Check Success (${roll.progressSuccess} + ${roll.progressCrit}).`;
				}
				break;
			case "save": {
				const modifier = 0;
				// const modifier = (roll.modifier ?? 0) == 0 ? "" : `at ${NumberTools.signed(roll.modifier)}`;
				if (roll.progressSuccess) {
					starterTxt += `${roll.saveType} Save Success ${modifier ? modifier : ""} (${roll.progressSuccess} + ${roll.progressCrit}).`;
				}
			}
				break;
			case "none": {
				const gainLose = roll.progressSuccess >= 0 ? "Gain" : "Lose";
				if (roll.progressSuccess) {
					starterTxt += `${gainLose} ${roll.progressSuccess} Progress Tokens`;
				}
				break;
			}
			default:
		}
		if ((roll.progressFail ?? 0) != 0) {
			const gainLose = roll.progressFail > 0 ? "Gain" : "Lose";
			starterTxt += ` ${gainLose} ${roll.progressFail} on failure.`;
		}
		return starterTxt +  data.text;
	}

	static override migrateData(source: Record<string, any>) : typeof source {
		const  data = source as Foundry.SystemDataObjectFromDM<typeof CardChoiceDM>;
		if (data.conditions == undefined) {
			data.conditions = [];
		}
		if (!Array.isArray(data.conditions)) {
			data.conditions = ArrayCorrector(data.conditions) as typeof data.conditions;
		}
		if (data.postEffects.effects == undefined) {
			data.postEffects.effects = [];
		}
		if (!Array.isArray(data.postEffects.effects)) {
			data.postEffects.effects = ArrayCorrector(data.postEffects.effects) as typeof data.postEffects.effects;
		}
		return source;
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
	tag: TagSchema,
} as const;

//namespace Test{
//	type PowerSO= Foundry.SystemDataObjectFromDM<typeof PowerSchema>;

//}
