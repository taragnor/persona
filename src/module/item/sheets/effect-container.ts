import { REALDAMAGETYPES } from "../../../config/damage-types.js";
import { VARIABLE_ACTIONS } from "../../../config/consequence-types.js";
import { CARD_TAGS } from "../../../config/card-tags.js";
import { SOCIAL_LINK_OR_TAROT_OTHER } from "../../../config/precondition-types.js";
import { EQUIPMENT_TAGS } from "../../../config/equipment-tags.js";
import { CREATURE_TAGS } from "../../../config/creature-tags.js";
import { SOCIAL_CHECKS } from "../../../config/boolean-comparison.js";
import { ALTER_MP_SUBTYPES } from "../../../config/effect-types.js";
import { CREATURE_TYPE } from "../../../config/shadow-types.js";
import { PersonaItem } from "../persona-item.js";
import { USER_COMPARISON_TARGETS } from "../../../config/precondition-types.js";
import { ProgressClock } from "../../utility/progress-clock.js";
import { DAMAGE_SUBTYPES } from "../../../config/effect-types.js";
import { MODIFIER_VARIABLES } from "../../../config/effect-types.js";
import { MODIFIER_CONS_TYPES } from "../../../config/effect-types.js";
import { DUNGEON_ACTIONS } from "../../../config/effect-types.js";
import { SOCIAL_CARD_ACTIONS } from "../../../config/effect-types.js";
import { SHADOW_ROLE } from "../../../config/shadow-types.js";
import { CONS_TARGETS } from "../../../config/consequence-types.js";
import { DAYS_LIST } from "../../../config/days.js";
import { RESIST_STRENGTHS } from "../../../config/damage-types.js";
import { TAROT_DECK } from "../../../config/tarot.js";
import { SLOT_TYPES_EXPANDED } from "../../../config/slot-types.js";
import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { PowerContainer } from "../persona-item.js";
import { SLOTTYPES } from "../../../config/slot-types.js";
import { POWERTYPES } from "../../../config/effect-types.js";
import { PRECONDITIONTYPES } from "../../../config/precondition-types.js";
import { CONSQUENCETYPES } from "../../../config/effect-types.js";
import { DAMAGETYPES } from "../../../config/damage-types.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../../../config/status-effects.js";
import { STATUS_EFFECT_DURATION_TYPES } from "../../../config/status-effects.js";
import { TARGETING } from "../../../config/effect-types.js";
import { POWER_TAGS } from "../../../config/power-tags.js";
import { MODIFIERS_TABLE } from "../../../config/item-modifiers.js";
import { DEFENSECHOICES } from "../../datamodel/power-dm.js";
import { SHADOW_CHARGE_REQ } from "../../../config/effect-types.js";
import { PersonaDB } from "../../persona-db.js";
import { TRIGGERS } from "../../../config/triggers.js";
import { OTHER_CONSEQUENCES } from "../../datamodel/other-effects.js";
import { CONDITION_TARGETS } from "../../../config/precondition-types.js";
import { NUMERIC_COMPARISON_TARGET } from "../../../config/numeric-comparison.js";
import { BOOLEAN_COMPARISON_TARGET } from "../../../config/boolean-comparison.js";
import { COMPARATORS } from "../../../config/numeric-comparison.js";
import { SAVE_TYPES_LOCALIZED } from "../../../config/save-types.js";
import { WEATHER_TYPES } from "../../../config/weather-types.js";
import { STUDENT_SKILLS } from "../../../config/student-skills.js"


export abstract class PersonaEffectContainerBaseSheet extends PersonaItemSheetBase {
	declare item: PowerContainer;
	static _powerStuffBase?: Record<string, any>;

	override async getData() {
		if (this.item.isOwner && this.item.type != "socialCard") {
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

	static get powerStuffBase() :Record<string, any> {
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
"by-power": 	"persona.damage.types.by-power",
			...DAMAGETYPES,
		};

		this._powerStuffBase = {
			DAYS_LIST,
			TAROT_DECK,
			NUMERIC_COMPARISON_TARGET,
			BOOLEAN_COMPARISON_TARGET,
			RESIST_STRENGTHS,
			COMPARATORS,
			CONDITION_TARGETS,
			OTHER_CONSEQUENCES : OTHER_CONSEQUENCES,
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
			TAGS: POWER_TAGS,
			MODIFIER_TARGETS: MODIFIERS_TABLE,
			DEFENSES: Object.fromEntries(DEFENSECHOICES.map( x=> [x, x])),
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
			CREATURE_TAGS,
			CARD_TAGS,
			EQUIPMENT_TAGS,
			VARIABLE_ACTIONS,
			SCENE_WEATHER_TYPES: Object.fromEntries(
				([""].concat(Object.keys(CONFIG.weatherEffects))).map( x=> [x,x])
			),
		};
		Debug(this._powerStuffBase.SCENE_WEATHER_TYPES);
		return this._powerStuffBase;
	}

	static get powerStuff(): Record<string, any> {
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
			(RELATIONSHIP_TYPES_LIST as string[])
			.map(x=> ([x,x]))
		);

		const data = {
			...this.powerStuffBase,
			SOCIAL_LINKS,
			COMPENDIUM_POWERS: Object.fromEntries(
				PersonaDB.allPowers()
				.sort((a,b) => a.name.localeCompare(b.name))
				.map(pwr=> ([pwr.id, pwr.name]))
			),
			CLOCKS,
			SCENES,
			ITEMS,
			ITEMS_PLUS_NULL,
			RELATIONSHIP_TYPE_OBJECT,
			SOCIAL_CARDS,
		};
		return data;
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}


}
