import {INSTANT_KILL_LEVELS} from "../module/combat/damage-calc.js";
import {OTHER_CONSEQUENCES} from "../module/datamodel/other-effects.js";
import {UNIVERSAL_MODIFIERS_TYPE} from "../module/datamodel/universal-modifiers-types.js";
import {PersonaItem} from "../module/item/persona-item.js";
import {PersonaDB} from "../module/persona-db.js";
import {VARIABLE_TYPE} from "../module/persona-variables.js";
import {CALCULATION_OPERATION} from "../module/utility/calculation.js";
import {ProgressClock} from "../module/utility/progress-clock.js";
import {BOOLEAN_COMPARISON_TARGET, SOCIAL_CHECKS, TAG_COMPARISON_TYPES} from "./boolean-comparison.js";
import {CARD_TAGS} from "./card-tags.js";
import {ARITHMETIC_OPERATORS, CONS_TARGETS, CONSEQUENCE_AMOUNT_TYPES, LEVEL_GAIN_TARGETS, VARIABLE_ACTIONS} from "./consequence-types.js";
import {CREATURE_TAGS} from "./creature-tags.js";
import {DAMAGE_LEVELS, DAMAGETYPES, REALDAMAGETYPES, RESIST_STRENGTHS} from "./damage-types.js";
import {DAYS_LIST} from "./days.js";
import {ALTER_MP_SUBTYPES, COMBAT_EFFECTS, CONSQUENCETYPES, DAMAGE_SUBTYPES, DUNGEON_ACTIONS, MODIFIER_CONS_TYPES, MODIFIER_VARIABLES, POWERTYPES, SHADOW_CHARGE_REQ, SOCIAL_CARD_ACTIONS, TARGETING} from "./effect-types.js";
import {CONSUMABLE_SUBTYPES} from "./equip-slots.js";
import {EQUIPMENT_TAGS, WEAPON_TAGS} from "./equipment-tags.js";
import {MODIFIER_CATEGORIES_LOCALIZATION, MODIFIERS_TABLE} from "./item-modifiers.js";
import { DEFENSE_TYPES } from "./defense-types.js";
import {COMPARATORS, COMPARISON_GROUPS, NUMERIC_COMPARISON_TARGET, NUMERIC_V2_ACTOR_STATS, NUMERIC_V2_COMPARISON_TARGETS, RESULT_SUBTYPE_COMPARISON, SIMPLE_COMPARATORS} from "./numeric-comparison.js";
import {PERMA_BUFFS} from "./perma-buff-type.js";
import {POWER_TAGS} from "./power-tags.js";
import {CONDITION_TARGETS, PRECONDITIONTYPES, SOCIAL_LINK_OR_TAROT_OTHER, USER_COMPARISON_TARGETS} from "./precondition-types.js";
import {ROLL_TAGS_AND_CARD_TAGS} from "./roll-tags.js";
import {SAVE_TYPES_LOCALIZED} from "./save-types.js";
import {CREATURE_TYPE, SHADOW_ROLE} from "./shadow-types.js";
import {SLOT_TYPES_EXPANDED, SLOTTYPES} from "./slot-types.js";
import {STATUS_EFFECT_DURATION_TYPES, STATUS_EFFECT_TRANSLATION_TABLE} from "./status-effects.js";
import {STUDENT_SKILLS} from "./student-skills.js";
import {TAROT_DECK} from "./tarot.js";
import {TRIGGERS} from "./triggers.js";
import {WEATHER_TYPES} from "./weather-types.js";

export class PowerStuff {
private static _powerStuffBase: Record<string, unknown>;

	static powerStuffBase() :Record<string, unknown> {
		if (this._powerStuffBase)  {
			return this._powerStuffBase;
		}
		const SocialLinks = Object.fromEntries(
			PersonaDB.allActors()
			.filter (x=> x.tarot && x.system.type != "shadow" && x.system.type != "tarot")
			.map( actor=> [actor.id,actor.name])
		);

		const SOCIAL_LINK_OR_TAROT =
		{
			...SOCIAL_LINK_OR_TAROT_OTHER,
			...TAROT_DECK,
			...SocialLinks,
		};

		const DAMAGETYPESPLUS = {
			...DAMAGETYPES,
		};
		this._powerStuffBase = {
			INSTANT_KILL_LEVELS,
			CONSUMABLE_SUBTYPES,
			DAMAGE_LEVELS,
			NUMERIC_V2_ACTOR_STATS,
			DAYS_LIST,
			TAROT_DECK,
			NUMERIC_COMPARISON_TARGET,
			BOOLEAN_COMPARISON_TARGET,
			RESIST_STRENGTHS,
			ARITHMETIC_OPERATORS,
			CONSEQUENCE_AMOUNT_TYPES,
			COMPARATORS,
			SIMPLE_COMPARATORS,
			NUMERIC_V2_COMPARISON_TARGETS,
			CONDITION_TARGETS,
			OTHER_CONSEQUENCES,
			TRIGGERS: TRIGGERS,
			POWERTYPES : POWERTYPES,
			SLOTTYPES : SLOTTYPES,
			PRECONDITIONTYPES: PRECONDITIONTYPES,
			CONSTYPES: CONSQUENCETYPES,
			DAMAGETYPES : DAMAGETYPES,
			REALDAMAGETYPES: REALDAMAGETYPES,
			DAMAGETYPESPLUS,
			STATUSEFFECTS: STATUS_EFFECT_TRANSLATION_TABLE,
			STATUSDURATIONS : STATUS_EFFECT_DURATION_TYPES,
			TARGETING : TARGETING,
			MODIFIER_TARGETS: MODIFIERS_TABLE,
			DEFENSES: DEFENSE_TYPES,
			SHADOW_CHARGE_REQ: SHADOW_CHARGE_REQ,
			SLOT_TYPES_EXPANDED: SLOT_TYPES_EXPANDED,
			SAVE_DIFFICULTY: SAVE_TYPES_LOCALIZED,
			WEATHER_TYPES: WEATHER_TYPES,
			SOCIAL_LINK_OR_TAROT,
			STUDENT_SKILLS,
			CONS_TARGETS,
			SHADOW_ROLE,
			SOCIAL_CARD_ACTIONS,
			DUNGEON_ACTIONS,
			MODIFIER_CONS_TYPES,
			MODIFIER_VARIABLES,
			DAMAGE_SUBTYPES,
			USER_COMPARISON_TARGETS,
			CREATURE_TYPE,
			ALTER_MP_SUBTYPES,
			SOCIAL_CHECKS,
			WEAPON_TAGS,
			CARD_TAGS,
			ROLL_TAGS_AND_CARD_TAGS,
			// EQUIPMENT_TAGS,
			VARIABLE_ACTIONS,
			COMBAT_EFFECTS,
			RESULT_SUBTYPE_COMPARISON,
			COMPARISON_GROUPS,
			PERMA_BUFFS,
			TAG_COMPARISON_TYPES,
			VARIABLE_TYPE,
			UNIVERSAL_MODIFIERS_TYPE,
			MODIFIER_CATEGORIES_LOCALIZATION,
			LEVEL_GAIN_TARGETS,
			CALCULATION_OPERATION,
			SCENE_WEATHER_TYPES: Object.fromEntries(
				([""].concat(Object.keys(CONFIG.weatherEffects))).map( x=> [x,x])
			),
		};
		return this._powerStuffBase;
	}

	static powerStuff(): Record<string, unknown> {
		const SOCIAL_LINKS = Object.fromEntries(
			PersonaDB.socialLinks().map(actor => [actor.id, actor.name])
		);
		SOCIAL_LINKS[""] = "-";
		const SOCIAL_CARDS = Object.fromEntries(
			PersonaDB.allSocialCards()
			.map(card=> [card.id, card.name])
		);
		const SCENES = Object.fromEntries(
			game.scenes.contents
			.map( sc => [sc.id, sc.name])
		);
		SCENES[""] = "-";
		const CLOCKS = Object.fromEntries(
			ProgressClock.allClocks()
			.map(clock => [clock.id, clock.name])
		) ;
		const ITEMS = Object.fromEntries( (game.items.contents as PersonaItem[])
			.filter( item => item.isAnyItemType())
			.map (item => [item.id, item.name])
		);
		const ITEMS_PLUS_NULL = {
			"": "usedItem",
			...ITEMS
		};
		const RELATIONSHIP_TYPES_LIST = PersonaDB.allSocialCards()
		.flatMap(card => card.system.qualifiers)
		.map(qual=> qual.relationshipName)
		.filter( (val, i, arr) => arr.indexOf(val) == i);
		const RELATIONSHIP_TYPE_OBJECT  = Object.fromEntries(
			RELATIONSHIP_TYPES_LIST
			.map(x=> ([x,x]))
		);
		const UNIFIED_CREATURE_TAGS = PersonaDB.createMergedTagLocList(["actor", "persona"], CREATURE_TAGS);

		const UNIFIED_EQUIPMENT_TAGS = PersonaDB.createMergedTagLocList(["equipment", "enchantment"], EQUIPMENT_TAGS);

		const TAGS = PersonaDB.createMergedTagLocList( ["power", "equipment"], POWER_TAGS);

		const data = {
			...this.powerStuffBase(),
			SOCIAL_LINKS,
			TAGS,
			COMPENDIUM_TALENTS: Object.fromEntries(
				PersonaDB.allTalents().slice()
				.sort((a,b) => a.name.localeCompare(b.name))
				.map(t=> ([t.id, t.displayedName]))
			),
			COMPENDIUM_POWERS: Object.fromEntries(
				PersonaDB.allPowersArr().slice()
				.sort((a,b) => a.name.localeCompare(b.name))
				.map(pwr=> ([pwr.id, pwr.displayedName]))
			),
			CLOCKS,
			SCENES,
			ITEMS,
			ITEMS_PLUS_NULL,
			EQUIPMENT_TAGS: UNIFIED_EQUIPMENT_TAGS,
			CREATURE_TAGS: UNIFIED_CREATURE_TAGS,
			RELATIONSHIP_TYPE_OBJECT,
			SOCIAL_CARDS,
		};
		return data;
	}

}

