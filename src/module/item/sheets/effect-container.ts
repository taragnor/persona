import { SocialCard } from "../persona-item.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { PowerContainer } from "../persona-item.js";
import { PersonaDB } from "../../persona-db.js";
import {PowerStuff} from "../../../config/power-stuff.js";


export abstract class PersonaEffectContainerBaseSheet extends PersonaItemSheetBase {
	declare item: PowerContainer | SocialCard;
	static _powerStuffBase?: Record<string, unknown>;

	override async getData() {
		if (this.item.isOwner && this.item.system.type != "socialCard") {
			await (this.item as PowerContainer).sanitizeEffectsData();//required becuase foundry input hates arrays;
		}
		const data = await super.getData();
		const SOCIAL_LINKS = Object.fromEntries(
			PersonaDB.socialLinks().map(actor => [actor.id, actor.name])
		);
		SOCIAL_LINKS[""] = "-";
		data.POWERSTUFF = PersonaEffectContainerBaseSheet.powerStuff;
		return data;
	}

	// static get powerStuffBase() :Record<string, unknown> {
	// 	return PowerStuff.powerStuffBase();
		// if (this._powerStuffBase)  {
		// 	return this._powerStuffBase;
		// }
		// const SocialLinks = Object.fromEntries(
		// 	PersonaDB.allActors()
		// 	.filter (x=> x.tarot && x.system.type != "shadow" && x.system.type != "tarot")
		// 	.map( actor=> [actor.id,actor.name])
		// );

		// const SOCIAL_LINK_OR_TAROT =
		// {
		// 	...SOCIAL_LINK_OR_TAROT_OTHER,
		// 	...TAROT_DECK,
		// 	...SocialLinks,
		// };

		// const DAMAGETYPESPLUS = {
		// 	...DAMAGETYPES,
		// };
		// this._powerStuffBase = {
		// 	INSTANT_KILL_LEVELS,
		// 	CONSUMABLE_SUBTYPES,
		// 	DAMAGE_LEVELS,
		// 	NUMERIC_V2_ACTOR_STATS,
		// 	DAYS_LIST,
		// 	TAROT_DECK,
		// 	NUMERIC_COMPARISON_TARGET,
		// 	BOOLEAN_COMPARISON_TARGET,
		// 	RESIST_STRENGTHS,
		// 	ARITHMETIC_OPERATORS,
		// 	CONSEQUENCE_AMOUNT_TYPES,
		// 	COMPARATORS,
		// 	SIMPLE_COMPARATORS,
		// 	NUMERIC_V2_COMPARISON_TARGETS,
		// 	CONDITION_TARGETS,
		// 	OTHER_CONSEQUENCES : OTHER_CONSEQUENCES,
		// 	TRIGGERS: TRIGGERS,
		// 	POWERTYPES : POWERTYPES,
		// 	SLOTTYPES : SLOTTYPES,
		// 	PRECONDITIONTYPES: PRECONDITIONTYPES,
		// 	CONSTYPES: CONSQUENCETYPES,
		// 	DAMAGETYPES : DAMAGETYPES,
		// 	REALDAMAGETYPES: REALDAMAGETYPES,
		// 	DAMAGETYPESPLUS,
		// 	STATUSEFFECTS: STATUS_EFFECT_TRANSLATION_TABLE,
		// 	STATUSDURATIONS : STATUS_EFFECT_DURATION_TYPES,
		// 	TARGETING : TARGETING,
		// 	TAGS: POWER_TAGS,
		// 	MODIFIER_TARGETS: MODIFIERS_TABLE,
		// 	DEFENSES: DEFENSE_TYPES,
		// 	SHADOW_CHARGE_REQ: SHADOW_CHARGE_REQ,
		// 	SLOT_TYPES_EXPANDED: SLOT_TYPES_EXPANDED,
		// 	SAVE_DIFFICULTY: SAVE_TYPES_LOCALIZED,
		// 	WEATHER_TYPES: WEATHER_TYPES,
		// 	SOCIAL_LINK_OR_TAROT,
		// 	STUDENT_SKILLS,
		// 	CONS_TARGETS,
		// 	SHADOW_ROLE,
		// 	SOCIAL_CARD_ACTIONS,
		// 	DUNGEON_ACTIONS,
		// 	MODIFIER_CONS_TYPES,
		// 	MODIFIER_VARIABLES,
		// 	DAMAGE_SUBTYPES,
		// 	USER_COMPARISON_TARGETS,
		// 	CREATURE_TYPE,
		// 	ALTER_MP_SUBTYPES,
		// 	SOCIAL_CHECKS,
		// 	CREATURE_TAGS,
		// 	WEAPON_TAGS,
		// 	CARD_TAGS,
		// 	ROLL_TAGS_AND_CARD_TAGS,
		// 	EQUIPMENT_TAGS,
		// 	VARIABLE_ACTIONS,
		// 	COMBAT_EFFECTS,
		// 	RESULT_SUBTYPE_COMPARISON,
		// 	COMPARISON_GROUPS,
		// 	PERMA_BUFFS,
		// 	TAG_COMPARISON_TYPES,
		// 	VARIABLE_TYPE,
		// 	UNIVERSAL_MODIFIERS_TYPE,
		// 	MODIFIER_CATEGORIES_LOCALIZATION,
		// 	LEVEL_GAIN_TARGETS,
		// 	CALCULATION_OPERATION,
		// 	SCENE_WEATHER_TYPES: Object.fromEntries(
		// 		([""].concat(Object.keys(CONFIG.weatherEffects))).map( x=> [x,x])
		// 	),
		// };
		// return this._powerStuffBase;
	// }

	static get powerStuff(): Record<string, unknown> {
		return PowerStuff.powerStuff();
		// const SOCIAL_LINKS = Object.fromEntries(
		// 	PersonaDB.socialLinks().map(actor => [actor.id, actor.name])
		// );
		// SOCIAL_LINKS[""] = "-";
		// const SOCIAL_CARDS = Object.fromEntries(
		// 	PersonaDB.allSocialCards()
		// 	.map(card=> [card.id, card.name])
		// );
		// const SCENES = Object.fromEntries(
		// 	game.scenes.contents
		// 	.map( sc => [sc.id, sc.name])
		// );
		// SCENES[""] = "-";
		// const CLOCKS = Object.fromEntries(
		// 	ProgressClock.allClocks()
		// 	.map(clock => [clock.id, clock.name])
		// ) ;
		// const ITEMS = Object.fromEntries( (game.items.contents as PersonaItem[])
		// 	.filter( item => item.isAnyItemType())
		// 	.map (item => [item.id, item.name])
		// );
		// const ITEMS_PLUS_NULL = {
		// 	"": "usedItem",
		// 	...ITEMS
		// };
		// const RELATIONSHIP_TYPES_LIST = PersonaDB.allSocialCards()
		// .flatMap(card => card.system.qualifiers)
		// .map(qual=> qual.relationshipName)
		// .filter( (val, i, arr) => arr.indexOf(val) == i);
		// const RELATIONSHIP_TYPE_OBJECT  = Object.fromEntries(
		// 	RELATIONSHIP_TYPES_LIST
		// 	.map(x=> ([x,x]))
		// );

		// const data = {
		// 	...this.powerStuffBase,
		// 	SOCIAL_LINKS,
		// 	COMPENDIUM_TALENTS: Object.fromEntries(
		// 		PersonaDB.allTalents().slice()
		// 		.sort((a,b) => a.name.localeCompare(b.name))
		// 		.map(t=> ([t.id, t.displayedName]))
		// 	),
		// 	COMPENDIUM_POWERS: Object.fromEntries(
		// 		PersonaDB.allPowersArr().slice()
		// 		.sort((a,b) => a.name.localeCompare(b.name))
		// 		.map(pwr=> ([pwr.id, pwr.displayedName]))
		// 	),
		// 	CLOCKS,
		// 	SCENES,
		// 	ITEMS,
		// 	ITEMS_PLUS_NULL,
		// 	RELATIONSHIP_TYPE_OBJECT,
		// 	SOCIAL_CARDS,
		// };
		// return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}


}
