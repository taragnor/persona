import { GrowthCalculator } from '../utility/growth-calculator.js';
import { STATUS_AILMENT_SET } from '../../config/status-effects.js';
import { AILMENT_BONUS_LEVELS, DamageCalculation, DamageCalculator, INSTANT_KILL_CRIT_BOOST, NewDamageParams } from '../combat/damage-calc.js';
import { PowerCostCalculator } from '../power-cost-calculator.js';
import { StatusEffectId } from '../../config/status-effects.js';
import { CATEGORY_SORT_ORDER, DAMAGE_ICONS, ITEM_ICONS, ItemCategory } from '../../config/icons.js';
import { Persona } from '../persona-class.js';
import { POWER_ICONS } from '../../config/icons.js';
import { RealDamageType } from '../../config/damage-types.js';
import { AttackResult } from '../combat/combat-result.js';
import { EvaluatedDamage } from '../combat/damage-calc.js';
import { PToken } from '../combat/persona-combat.js';
import { DamageConsequence, ItemSelector } from '../../config/consequence-types.js';
import { Trigger } from '../../config/triggers.js';
import { CombatResult } from '../combat/combat-result.js';
import { ROLL_TAGS_AND_CARD_TAGS } from '../../config/roll-tags.js';
import { CARD_RESTRICTOR_TAGS } from '../../config/card-tags.js';
import { CardRoll } from '../../config/social-card-config.js';
import { PersonaSettings } from '../../config/persona-settings.js';
import { POWER_TAGS_LIST } from '../../config/power-tags.js';
import { POWER_TYPE_TAGS } from '../../config/power-tags.js';
import { Logger } from '../utility/logger.js';
import { STATUS_AILMENT_POWER_TAGS } from '../../config/power-tags.js';
import { DamageType } from '../../config/damage-types.js';
import { ValidAttackers } from '../combat/persona-combat.js';
import { EQUIPMENT_TAGS } from '../../config/equipment-tags.js';
import { Consequence } from '../../config/consequence-types.js';
import { CreatureTag } from '../../config/creature-tags.js';
import { Helpers } from '../utility/helpers.js';
import { PersonaAE } from '../active-effect.js';
import { PersonaCombat } from '../combat/persona-combat.js';
import { removeDuplicates } from '../utility/array-tools.js';
import { EquipmentTag } from '../../config/equipment-tags.js';
import { PowerTag } from '../../config/power-tags.js';
import { ConditionalEffectManager } from '../conditional-effect-manager.js';
import { localize } from '../persona.js';
import { POWER_TAGS } from '../../config/power-tags.js';
import { ModifierList } from '../combat/modifier-list.js';
import { testPreconditions } from '../preconditions.js';
import { CardChoice } from '../../config/social-card-config.js';
import { CardEvent } from '../../config/social-card-config.js';
import { BASIC_PC_POWER_NAMES } from '../../config/basic-powers.js';
import { BASIC_SHADOW_POWER_NAMES } from '../../config/basic-powers.js';
import { getActiveConsequences } from '../preconditions.js';
import { PersonaError } from '../persona-error.js';
import { PersonaActor } from '../actor/persona-actor.js';
import { SLOTTYPES } from '../../config/slot-types.js';
import { ModifierListItem } from '../combat/modifier-list.js';
import { ModifierTarget } from '../../config/item-modifiers.js';
import { PowerType } from '../../config/effect-types.js';
import { PC } from '../actor/persona-actor.js';
import { Shadow } from '../actor/persona-actor.js';
import { ITEMMODELS } from '../datamodel/item-types.js';
import { PersonaDB } from '../persona-db.js';
import {DEFENSE_TYPES} from '../../config/defense-types.js';
import {EnergyClassCalculator} from '../calculators/shadow-energy-cost-calculator.js';
import {ConsequenceAmountResolver} from '../conditionalEffects/consequence-amount.js';
import {EnchantedTreasureFormat, TreasureSystem} from '../exploration/treasure-system.js';
import {Calculation} from '../utility/calculation.js';

declare global {
	type ItemSub<X extends PersonaItem['system']['type']> = Subtype<PersonaItem, X>;
}

export class PersonaItem extends Item<typeof ITEMMODELS, PersonaActor, PersonaAE> {

	// hpGrowthTable : U<GrowthCalculator>= new GrowthCalculator(1.02, 45, 2);
	// mpGrowthTable: U<GrowthCalculator> = new GrowthCalculator(1.02, 30, 1.5);


	static #cache =  {
		basicPCPowers: undefined as Power[] | undefined,
		basicShadowPowers: undefined as Power[] | undefined,
	};

	declare parent: PersonaActor | undefined;

	cache: {
		effects: AdvancedEffectsCache;
		// effectsNull: ConditionalEffect[] | undefined;
		// effectsMap: WeakMap<PersonaActor, ConditionalEffect[]>;
		containsModifier: boolean | undefined;
		containsTagAdd: boolean | undefined;
		statsModified: Map<ModifierTarget, boolean>,
		hasTriggers: U<boolean>,
		grantsPowers: U<boolean>,
		grantsTalents: U<boolean>,
		mpCost: U<number>,
		mpGrowthTable: U<GrowthCalculator>,
		hpGrowthTable: U<GrowthCalculator>,

	};

	static cacheStats = {
		miss: 0,
		total: 0,
		modifierSkip: 0,
		modifierRead: 0,
	};

	constructor(...args: unknown[]) {
		super (...args);
		this.clearCache();
	}

	isActualItem(): this is InvItem | Consumable | Weapon {
		switch (this.system.type) {
			case 'item':
			case 'weapon':
			case 'consumable':
				return true;
			default:
				return false;
		}
	}

	clearCache() {
		this.cache = {
			effects: PersonaItem.#newEffectsCache(),
			// effectsNull: undefined,
			// effectsMap: new WeakMap(),
			containsModifier: undefined,
			containsTagAdd: undefined,
			statsModified: new Map(),
			hasTriggers: undefined,
			grantsPowers: undefined,
			grantsTalents: undefined,
			mpCost: undefined,
			mpGrowthTable: undefined,
			hpGrowthTable: undefined,
		};
	}

	static #newEffectsCache() : AdvancedEffectsCache {
		const cache : AdvancedEffectsCache = {
			allEffects: {
				actors: new WeakMap(),
				nullActor: undefined,
			},
			passiveEffects: {
				actors: new WeakMap(),
				nullActor: undefined,
			},
			triggeredEffects: {
				actors: new WeakMap(),
				nullActor: undefined,
			},
			defensiveEffects: {
				actors: new WeakMap(),
				nullActor: undefined,
			},
			onUseEffects: {
				actors: new WeakMap(),
				nullActor: undefined,
			}
		};
		return cache;
	}

	static sortInventoryItems( this: void, a: Carryable, b: Carryable) : number {
		const catSort = PersonaItem.categorySort(a,b);
		if (catSort != 0) {return catSort;}
		const typesort = a.system.type.localeCompare(b.system.type);
		if (typesort != 0) {return typesort;}
		if (a.system.type == "item" && b.system.type == "item") {
			const slotSort = a.system.slot.localeCompare(b.system.slot);
			if (slotSort != 0) {return slotSort;}
		}
		return a.name.localeCompare(b.name);
	}

	static categorySort(this: void, a: Carryable, b: Carryable) : number {
		const aCat = a.getItemCategory() ?? "";
		const bCat = b.getItemCategory() ?? "";
		return CATEGORY_SORT_ORDER[aCat] - CATEGORY_SORT_ORDER[bCat];
		// return aCat.localeCompare(bCat);
	}

	getItemCategory(this: Power | Carryable, user ?: ValidAttackers) : U<ItemCategory> {
		switch (true) {
			case this.isPower(): {
				return this.getPowerCategory(user);
			}
			case this.isInvItem(): {
				return this.getInvItemCategory();
			}
			case this.isWeapon(): {
				return this.getWeaponCategory();
			}
			case this.isConsumable(): {
				return this.getConsumableCategory(user);
			}
			case this.isSkillCard(): {
				return "card";
			}
			default:
				this satisfies never;
				return undefined;
		}

	}

	getPowerCategory(this: Usable, user?: ValidAttackers | Persona ) : U<ItemCategory> {
		const dtype = this.system.dmg_type;
		switch (dtype) {
			case 'fire':
			case 'wind':
			case 'light':
			case 'dark':
			case 'physical':
			case 'gun':
			case 'healing':
			case 'cold':
			case 'lightning':
			case 'untyped':
				return dtype;
			case 'by-power': {
				if (!user) {
					PersonaError.softFail("No user provided for get item category");
					return undefined;
				}
				const altDtype = this.getDamageType(user);
				return altDtype;
			}
			case 'none':
			case 'all-out':
				break;
		}
		if (this.hasTag('ailment')) {
			return "ailment";
		}
		if (this.isPassive() || this.isDefensive()) {
			return "passive";
		}
		if (this.isConsumable()) {
			return "consumable";
		}
		return "support";
	}


	getConsumableCategory(this: Consumable, user ?: ValidAttackers) : ItemCategory{
		const restoresHP = this.restoresHP();
		const restoresMP = this.restoresMP();
		if (restoresHP && restoresMP) {
			return "hpsp-item";
		}
		if (restoresHP) {
			return "hp-item";
		}
		if (restoresMP) {
			return "sp-item";
		}
		if (this.isCraftingMaterial()) {return "material-1";}
		const powerCatAttempt = this.getPowerCategory(user);
		if (powerCatAttempt) {return powerCatAttempt;}
		return "consumable";
	}

	getWeaponCategory(this: Weapon) : ItemCategory {
		switch (true) {
			case this.hasTag("spear"):
				return "spear";
			case this.hasTag("light-weapon"):
				return "knife";
			case this.hasTag("axe"):
				return "axe";
			case this.hasTag("fist"):
				return "fist";
			case this.hasTag("heavy"):
				return "2hsword";
			case this.hasTag("blade"):
				return "rapier";
			case this.hasTag("bow"):
				return "bow";
			default:
				return "sword";
		}
	}

	getInvItemCategory(this: InvItem) : ItemCategory {
		switch (this.system.slot) {
			case "key-item":
				return "key-item";
			case "none":
				break;
			case "body":
				if (this.hasTag("female")) {
					return "female-armor";
				}
				if (this.hasTag("male")) {
					return "male-armor";
				}
				return "generic-armor";
			case "accessory":
				return "accessory";
			case "weapon_crystal":
				return "gem";
			case "crafting":
				return "material-2";
		}
		if (this.hasTag("crafting")) {
			return "material-1";
		}
		return "gift"; ///sort of a default
	}

	getIconPath(this: Power | Carryable, user?: ValidAttackers | Persona) : string | undefined {
		if (user && user instanceof Persona) {
			user = user.user;
		}
		const category = this.getItemCategory(user);
		if (!category) {return undefined;}
		return ITEM_ICONS[category];
	}

	restoresHP(this: Consumable | Power) : boolean {
		if (this.system.dmg_type != "healing") {return false;}
		return this.getEffects(null).some( eff => {
			return eff.consequences.some( cons => {
				return (cons.type == "damage-new");
			});
		});
	}

	restoresMP(this: Consumable | Power) : boolean {
		return this.getEffects(null).some( eff => {
			return eff.consequences.some( cons => {
				return (cons.type == "alter-mp");
			});
		});
	}

	inflictsDamage(this:Consumable) : boolean {
		if (this.system.dmg_type == "healing" || this.system.dmg_type == "none") {return false;}
		return this.getEffects(null).some( eff => {
			return eff.consequences.some( cons => {
				return (cons.type == "damage-new");
			});
		});
	}

	static getDamageIconPath(dmgType : RealDamageType) : string  | undefined {
		switch (dmgType) {
			case 'fire':
			case 'wind':
			case 'light':
			case 'dark':
			case 'physical':
			case 'gun':
			case 'healing':
			case 'cold':
			case 'lightning':
			case 'untyped':
				return DAMAGE_ICONS[dmgType];
			case 'all-out':
			case 'none':
				return undefined;
			default:
				dmgType satisfies never;
				PersonaError.softFail(`Unknown Damage Type ${dmgType as string}`);
				return 'ERROR';
		}
	}


	getDisplayedIcon(this: Power | Consumable, user: ValidAttackers | Persona) : SafeString  | undefined {
		function iconize( path: string | undefined) {
			if (!path) { return new Handlebars.SafeString('');}
			return new Handlebars.SafeString(`<img class='power-icon' src='${path}'>`);
		}
		if (this.isUsableType())  {
			if (this.isPower()) {
				const dtype = this.system.dmg_type;
				switch (dtype) {
					case 'fire':
					case 'wind':
					case 'light':
					case 'dark':
					case 'physical':
					case 'gun':
					case 'healing':
					case 'cold':
					case 'lightning':
					case 'untyped':
						return iconize(PersonaItem.getDamageIconPath(dtype));
					case 'by-power': {
						const altDtype = this.getDamageType(user);
						return iconize(PersonaItem.getDamageIconPath(altDtype));
					}
					case 'none':
					case 'all-out':
						break;
				}
			}
			if (this.hasTag('ailment')) {
				return iconize(POWER_ICONS['ailment']);
			}
			if (this.isPassive() || this.isDefensive()) {
				return iconize(POWER_ICONS['passive']);
			}
			return iconize(POWER_ICONS['support']);
		}
		return new Handlebars.SafeString('');
	}

	getClassMHP(this: CClass, lvl: number) : number {
		return this.#calcClassMaxHP(lvl);
	}

	getClassMMP(this: CClass, lvl: number): number {
		return this.#calcClassMaxMP(lvl);
	}

	#calcClassMaxHP (this: CClass, lvl: number) : number {
		if (!this?.cache?.hpGrowthTable) {
			const {growthRate, initial, initialGrowthAmount, growthAcceleration}  = this.system.hpgrowth;
			this.cache.hpGrowthTable = new GrowthCalculator(
				growthRate, initial, initialGrowthAmount, growthAcceleration / 100);
			// this.cache.hpGrowthTable = new GrowthCalculator(1.02, 45, 2);
		}
		return this.cache.hpGrowthTable.valueAt(lvl);
	}

	#calcClassMaxMP( this:CClass, lvl: number) : number {
		if (!this?.cache?.mpGrowthTable) {
			const {growthRate, initial, initialGrowthAmount, growthAcceleration}  = this.system.mpgrowth;
			this.cache.mpGrowthTable = new GrowthCalculator(
				growthRate, initial, initialGrowthAmount, growthAcceleration / 100);
			// this.cache.mpGrowthTable = new GrowthCalculator(1.02, 30, 1.5);
		}
		return this.cache.mpGrowthTable.valueAt(lvl);
	}


	get accessor() : UniversalItemAccessor<typeof this> {
		return PersonaDB.getUniversalItemAccessor(this);
	}

	static getBasicPCPowers() : readonly Power[] {
		if (!this.#cache.basicPCPowers)  {
			const basic = BASIC_PC_POWER_NAMES;
			this.#cache.basicPCPowers = basic.flatMap( powerName =>  {
				const power = PersonaDB.getBasicPower(powerName);
				if (!power) {return [];}
				return [power];
			});
		}
		return this.#cache.basicPCPowers;
	}

	static getBasicShadowPowers() : readonly Power[] {
		if (!this.#cache.basicShadowPowers)  {
			const basic = BASIC_SHADOW_POWER_NAMES;
			this.#cache.basicShadowPowers = basic.flatMap( powerName =>  {
				const power = PersonaDB.getBasicPower(powerName);
				if (!power) {return [];}
				return [power];
			});
		}
		return this.#cache.basicShadowPowers;
	}

	isFocus(): this is Focus {
		return this.system.type == 'focus';
	}

	isCharacterClass(): this is CClass {
		return this.system.type == "characterClass";
	}

	isOutfit(): this is InvItem {
		return this.system.type == 'item' && this.system.slot == 'body';
	}

	isAccessory() : this is InvItem {
		return this.system.type == 'item' && this.system.slot == 'accessory';
	}

	isSkillCard(): this is SkillCard {
		return this.system.type == 'skillCard';
	}

	isFollowUpMove(this: UsableAndCard): boolean {
		if (!this.isTrulyUsable()) {return false;}
		return this.hasTag('follow-up');
	}

	isDefensive(): boolean {
		switch (this.system.type) {
			case 'power':
				return this.system.subtype == 'defensive';
			case 'focus':
			case 'item':
			case 'talent':
			case 'weapon':
			case 'consumable':
				return (this as Usable | Focus | InvItem | Talent | Weapon).tagList(null).includes('defensive');
			case 'universalModifier':
			case 'tag':
			case 'skillCard':
			case 'socialCard':
			case 'characterClass':
				return false;
			default:
				this.system satisfies never;
				return false;
		}
	}

	static searchForPotentialTagMatch (idOrInternalTag: string) : U<Tag> {
		const IdCheck = PersonaDB.allTags().get(idOrInternalTag);
		if (IdCheck) {return IdCheck;}
		const nameCheck = PersonaDB.allTagLinks().get(idOrInternalTag);
		if (nameCheck) {return nameCheck;}
		return undefined;
	}

	isUsableType() : this is Usable {
		switch (this.system.type) {
			case 'power':
			case 'consumable':
				// case "skillCard":
				return true;
			default:
				return false;
		}
	}

	isAilment(): boolean {
		if (!this.isUsableType() || !this.isTrulyUsable())  {return false;}
		return this.causesAilment();
	}

	isSupport() : boolean {
		if (!this.isUsableType() || !this.isTrulyUsable())  {return false;}
		if (this.isPower()) {
			return this.system.damageLevel == 'none' && this.system.ailmentChance == 'none' && this.system.instantKillChance == 'none';
		}
		return this.system.damage.high == 0 && this.system.defense == 'none';
	}

	isTrulyUsable() : boolean {
		switch (this.system.type) {
			case 'power': {
				const sub = this.system.subtype;
				if ( sub == 'passive'  || sub == 'defensive')
				{return false;}
				return true; 
			}
			case 'skillCard':
				return true;
			case 'consumable':
				if (this.isCraftingItem) {return false;}
				return true;
			case 'characterClass':
			case 'focus':
			case 'talent':
			case 'universalModifier':
			case 'socialCard':
			case 'item':
			case 'weapon':
			case 'tag':
				return false;
			default:
				this.system satisfies never;
				return false;
		}
	}

	targettedDefenseLocalized(this: Usable) : string {
		return localize(DEFENSE_TYPES[this.system.defense]);
	}

	powerTagModifiers(this: Usable, user: ValidAttackers) : SourcedConditionalEffect[] {
		const tags = this.tagList(user);
		return tags
			.filter( x=> x instanceof PersonaItem)
			.flatMap( tag => tag.getEffects(user));
	}

	static resolveTag<T extends (string | Tag)>(tag: string | Tag) : Tag | Exclude<T, Tag>  {
		if (tag instanceof PersonaItem) {return tag;}
		const tagGetTest = PersonaDB.allTags().get(tag);
		if (tagGetTest) {return tagGetTest;}
		const linkTagTest = PersonaDB.allTagLinks().get(tag);
		if (linkTagTest) {return linkTagTest;}
		return tag as Exclude<T, Tag>;
	}

	tagListLocalized(this: Weapon | UsableAndCard | InvItem  , user: null  | ValidAttackers) : string {
		let tags : (string | Tag)[] = [];
		const localizeTable : Record<string, string>  =  {
			...EQUIPMENT_TAGS,
			...POWER_TAGS
		};
		switch (true) {
			case ('itemTags' in this.system): {
				tags = tags.concat(
					this.tagList(user)
				);
				break;
			}
			case ('tags' in this.system): {
				tags = tags.concat(
					(this as Power).tagList(user)
				);
				break;
			}
		}
		return tags
			.map(tag => typeof tag == "string" ? localize(localizeTable[tag]) : tag.name)
			.join(', ');
	}


	/** @deprecated
  tags Localized */
	get tags() : string {
		if (PersonaSettings.debugMode()) {
			PersonaError.softFail('tags getter is deprecated, tagListLocalized instead');
		}
		switch (this.system.type) {
			case 'consumable':
			case 'item':
			case 'power':
			case 'weapon':
			case 'skillCard':
				return (this as UsableAndCard | Weapon | InvItem).tagListLocalized(null);
			case 'talent':
			case 'focus':
			case 'characterClass':
			case 'universalModifier':
			case 'tag':
			case 'socialCard':
				return 'ERROR';
		}
	}

	get slotLocalized() : SafeString {
		if (!this.isPower()) {
			return new Handlebars.SafeString('');
		}
		const slot = this.system.slot;
		const slotName = SLOTTYPES[slot];
		if (slotName) {
			return new Handlebars.SafeString (game.i18n.localize(slotName));
		}
		return new Handlebars.SafeString('');
	}


	get cardTags() : string {
		if ('cardTags' in this.system) {
			const tags= this.system.cardTags.map(tag => localize(ROLL_TAGS_AND_CARD_TAGS[tag]));
			return tags.join(', ');
		}
		return '';
	}

	async addItemTag(this: Consumable | InvItem | Weapon): Promise<void> {
		const tags = this.system.itemTags;
		tags.push('nil');
		await this.update( {'system.itemTags': tags});
	}

	async addCardTag(this: SocialCard): Promise<void> {
		const tags = this.system.cardTags;
		tags.push('');
		await this.update( {'system.cardTags': tags});
	}

	async addEventTag(this: SocialCard, eventIndex:number) : Promise<void> {
		const data = this.system.events;
		const ev = data[eventIndex];
		const newTags =  ev.eventTags.slice();
		newTags.push('');
		ev.eventTags = newTags;
		const json = data.map(x=> (x as unknown as JSONAble).toJSON());
		await this.update( {'system.events': json});
	}

	async deleteItemTag(this: Consumable | InvItem | Weapon, index: number) : Promise<void> {
		const tags = this.system.itemTags;
		tags.splice(index, 1);
		await this.update( {'system.itemTags': tags});
	}

	async deleteCardTag(this: SocialCard, index: number) : Promise<void> {
		const tags = this.system.cardTags;
		tags.splice(index, 1);
		await this.update( {'system.cardTags': tags});
	}

	async deleteEventTag(this: SocialCard, eventIndex:number, tagIndex: number) {
		const data = this.system.events;
		const ev= data[eventIndex];
		ev.eventTags.splice(tagIndex, 1);
		const json = data.map(x=> (x as unknown as JSONAble).toJSON());
		await this.update( {'system.events': json});
	}

	hasTag(this: Power, tag: PowerTag, user : null | ValidAttackers) : boolean;
	hasTag(this: Consumable, tag: PowerTag, user ?: null) : boolean;
	hasTag(this: Carryable, tag: EquipmentTag | PowerTag, user ?: null) : boolean;
	hasTag(this: InvItem | Weapon | SkillCard, tag: EquipmentTag, user ?: null): boolean;
	hasTag(this: UsableAndCard, tag: PowerTag | EquipmentTag, user ?: null) : boolean;
	hasTag(this: ItemModifierContainer, tag: PowerTag, user ?: null): boolean;
	hasTag(this: SkillCard | Consumable | InvItem | Weapon, tag: PowerTag | EquipmentTag, user ?: null) : boolean;
	hasTag(this: UsableAndCard | InvItem | Weapon, tag: PowerTag | EquipmentTag, user : null) : boolean;
	hasTag(this: UsableAndCard | InvItem | Weapon, tag: PowerTag | EquipmentTag, user?: null | ValidAttackers) : boolean {
		let list : (PowerTag | EquipmentTag)[];
		switch (this.system.type) {
			case 'power':
				list = (this as Power).tagList(user ?? null);
				break;
			case 'consumable':
					list = (this as Consumable).tagList();
				break;
			case 'item':
			case 'weapon':
				list = (this as Weapon | InvItem).tagList();
				break;
			case 'skillCard':
				list = (this as SkillCard).tagList();
				break;
			default:
				this.system satisfies never;
				// PersonaError.softFail(`Can't check tag list for ${this.system["type"]}`);
				return false;
		}
		return list.includes(tag);
	}

	tagList(this : Power, user: ValidAttackers | null): (PowerTag | EquipmentTag)[];
	tagList(this: UsableAndCard, user: ValidAttackers | null) : PowerTag[];
	tagList(this : Weapon, user ?: null ): EquipmentTag[];
	tagList(this : InvItem, user ?: null ): EquipmentTag[];
	tagList(this : Talent, user ?: null): PowerTag[];
	tagList(this : Focus, user ?: null): PowerTag[];
	tagList(this: Consumable | Talent | Focus | SkillCard | InvItem | Weapon, user ?: null | ValidAttackers) : (PowerTag | EquipmentTag)[];
	tagList(this: UsableAndCard | Talent | Focus | SkillCard | InvItem | Weapon, user ?: null | ValidAttackers) : (PowerTag | EquipmentTag)[];
	tagList(this: Talent | Focus | UsableAndCard | InvItem | Weapon, user ?: ValidAttackers | null) : (PowerTag | EquipmentTag)[] {
		const itype = this.system.type;
		switch (itype) {
			case 'power':
				return (this as Power).#autoTags_power(user);
			case 'consumable': {
				const list : string[]= this.system.tags.concat(this.system.itemTags);
				if (!list.includes(itype)) {
					list.pushUnique(itype);
				}
				if (!list.includes(this.system.dmg_type as typeof list[number]) && POWER_TAGS_LIST.includes(this.system.dmg_type as typeof POWER_TAGS_LIST[number])) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					list.pushUnique(this.system.dmg_type as any);
				}
				if (STATUS_AILMENT_POWER_TAGS.some(tag=> list.includes(tag))) {
					list.pushUnique('ailment');
				}
				const subtype = this.system.subtype;
				list.pushUnique(subtype);
				return list.map ( t=> PersonaItem.resolveTag<EquipmentTag | PowerTag>(t));
			}
			case 'item': {
				const list= this.system.itemTags.slice();
				const subtype = this.system.slot;
				switch (subtype) {
					case 'body':
					case 'accessory':
					case 'weapon_crystal':
					case 'key-item':
						if (!list.includes(subtype))
						{list.push(subtype);}
						break;
					case 'none':
						list.push('non-equippable');
						break;
					case 'crafting':
						list.push('non-equippable');
						list.push('crafting');
						break;
					default:
						subtype satisfies never;
				}
				return list.map( t=> PersonaItem.resolveTag<EquipmentTag>(t));
			}
			case 'weapon': {
				const list = this.system.itemTags.slice();
				if (!list.includes(this.system.dmg_type as typeof list[number]) && POWER_TAGS_LIST.includes(this.system.dmg_type as typeof POWER_TAGS_LIST[number])) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					list.pushUnique(this.system.dmg_type as any);
				}
				if (!list.includes(itype)) {
					list.pushUnique(itype);
				}
				return list.map( t=> PersonaItem.resolveTag<EquipmentTag>(t));
			}
			case 'skillCard': {
				return [
					'skill-card'
				];
			}
			case 'talent':
			case 'focus' : {
				const list : PowerTag[] = [];
				if (this.system.defensive) {
					list.push('defensive');
				} else {
					list.push('passive');
				}
				return list.map( t=> PersonaItem.resolveTag<PowerTag>(t as string));
			}
			default:
				itype satisfies never;
				PersonaError.softFail(`Can't get tag list for ${itype as string}`);
				return [];
		}
	}

	#autoTags_power(this: Power, user ?: null | ValidAttackers): (PowerTag | EquipmentTag)[] {
		const list : (PowerTag | EquipmentTag) [] = this.system.tags.map( x=> PersonaItem.resolveTag(x));
		list.pushUnique(this.system.type);
		if (this.system.instantKillChance != 'none') {
			list.pushUnique('instantKill');
		}
		if (this.system.ailmentChance != 'none' || this.causesAilment()) {
			list.pushUnique('ailment');
		}
		if (this.system.dmg_type == 'by-power') {
			list.pushUnique('variable-damage');
		}
		if (this.system.attacksMax > 1) {
			list.pushUnique('flurry');
		}
		if ( list.includes('weapon') && this.system.dmg_type == 'by-power' && user) {
			const wpnList : readonly (PowerTag | EquipmentTag)[] = user?.weapon?.tagList() ?? user.unarmedTagList();
			list.pushUnique(...wpnList);
		} else {
			if (!list.includes(this.system.dmg_type as typeof list[number]) && POWER_TAGS_LIST.includes(this.system.dmg_type as typeof POWER_TAGS_LIST[number])) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				list.pushUnique(this.system.dmg_type as any);
			}
		}
		if (STATUS_AILMENT_POWER_TAGS.some(tag=> list.includes(tag))) {
			list.pushUnique('ailment');
		}
		const subtype : typeof POWER_TYPE_TAGS[number]  = this.system.subtype as typeof POWER_TYPE_TAGS[number];
		if (POWER_TYPE_TAGS.includes(subtype) && !list.includes(subtype)) { list.pushUnique(subtype);}
		return list.map ( x=> PersonaItem.resolveTag(x));
	}

	get amount() : number {
		if ('amount' in this.system) {
			return this.system.amount ?? 1;
		}
		return 1;
	}

	async addItem(this: Consumable, amt: number) : Promise<typeof this> {
		const newAmt = this.system.amount += amt;
		await this.update({'system.amount': newAmt});
		return this;
	}

	get isCraftingItem() : boolean {
		return this.isCraftingMaterial();
	}

	/**@deprecated */
	costString() : string {
		return 'ERROR';
	}

	costString1(persona: Persona) : string {
		switch (this.system.type) {
			case 'power':
				return (this as Power).powerCostString(persona);
			case 'consumable':
				return 'consumable';
			default:
				return 'free';
		}
	}

	isAnyItemType() : this is (InvItem | Weapon | Consumable | SkillCard) {
		switch (this.system.type) {
			case 'skillCard':
			case 'consumable':
			case 'item':
			case 'weapon':
				return true;
			case 'power':
			case 'characterClass':
			case 'focus':
			case 'talent':
			case 'universalModifier':
			case 'socialCard':
			case "tag":
				return false;
			default:
				this.system satisfies never;
				return false;
		}
	}

	powerCostString(this: Power, persona: Persona) : string {
		if (persona.user.isShadow())
		{return this.powerCostString_Shadow(persona);}
		else  {
			return this.powerCostString_PC(persona);
		}
	}

	static grantsPowers(eff: SourcedConditionalEffect) : boolean{
		return eff.consequences.some(
			cons => cons.type == 'add-power-to-list'
		);
	}
	grantsPowers(this: ItemModifierContainer): boolean {
		if (!PersonaDB.isLoaded) {return false;}
		if (this.cache.grantsPowers != undefined) {
			return this.cache.grantsPowers;
		}
		try{
			const grantsPowers= this.getEffects(null).some(
				eff => eff.consequences.some(
					cons => cons.type == 'add-power-to-list'
				));
			this.cache.grantsPowers = grantsPowers;
			return this.cache.grantsPowers;
		} catch  {
			console.log(this);
			return false;
		}
	}

	grantsTalents(this: ItemModifierContainer) : boolean {
		if (!PersonaDB.isLoaded) {return false;}
		if (this.cache.grantsTalents != undefined) {
			return this.cache.grantsTalents;
		}
		try{
			const grantsTalents= this.getEffects(null).some(
				eff => eff.consequences.some(
					cons => cons.type == 'add-talent-to-list'
				));
			this.cache.grantsTalents = grantsTalents;
			return this.cache.grantsTalents;
		} catch  {
			console.log(this);
			return false;
		}
	}

	static grantsTalents (eff: TypedConditionalEffect) : boolean {
		return eff.consequences.some(
			cons => cons.type == 'add-talent-to-list'
		);
	}

	testOpenerPrereqs (this: UsableAndCard, situation: Situation, user: PersonaActor) : boolean {
		switch (this.system.type) {
			case 'skillCard': return false;
			case 'power': case 'consumable':
				break;
			default:
				this.system satisfies never;
		}
		const conditions = ConditionalEffectManager.getConditionals(this.system.openerConditions, this, user );
		return testPreconditions(conditions, situation);
	}

	testTeamworkPrereqs (this: UsableAndCard, situation: Situation, user: PersonaActor) : boolean {
		switch (this.system.type) {
			case 'skillCard': return false;
			case 'power': case 'consumable':
				break;
			default:
				this.system satisfies never;
		}
		const conditions = ConditionalEffectManager.getConditionals(this.system.teamworkConditions, this,user );
		return testPreconditions(conditions, situation);
	}

	testFollowUpPrereqs(this: UsableAndCard, situation: Situation, user: PersonaActor): boolean {
		return this.testTeamworkPrereqs(situation, user);
	}

	// getGrantedPowers(this: ItemModifierContainer, user: ValidAttackers, situation?: Situation): Power[] {
	//   return this.getAllGrantedPowers(user, situation);
	//   // .filter(pwr => !pwr.hasTag("opener"));
	// }

	// getGrantedTalents(this: ItemModifierContainer, user: ValidAttackers, situation?: Situation): Talent[] {
	//   return this.getAllGrantedTalents(user, situation);
	//   // .filter(pwr => !pwr.hasTag("opener"));
	// }

	// getOpenerPowers(this: ItemModifierContainer, user: ValidAttackers, situation?: Situation): Power[] {
	//   return this.getAllGrantedPowers(user, situation)
	//     .filter (pwr=> pwr.hasTag('opener'));
	// }


	static getAllGrantedPowers (eff: SourcedConditionalEffect, user: ValidAttackers, situation ?: Situation) : Power[] {
		if (!situation) {
			situation = {
				user: user.accessor
			};
		}
		const powers = getActiveConsequences(eff, situation)
			.flatMap(cons => cons.type == 'add-power-to-list' ? [cons.id] : [])
			.map(id=> PersonaDB.allPowers().get(id))
			.filter (pwr=> pwr != undefined);
		return removeDuplicates(powers);
	}

	// getAllGrantedPowers(this: ItemModifierContainer, user: ValidAttackers, situation?: Situation): Power[] {
	//   if (!this.grantsPowers()) {return [];}
	//   if (!situation) {
	//     situation = {
	//       user: user.accessor
	//     };
	//   }
	//   const powers=  this.getPassiveEffects(user)
	//     .filter(
	//       eff => eff.consequences.some(
	//         cons => cons.type == 'add-power-to-list'
	//       ))
	//     .flatMap(eff=> getActiveConsequences(eff, situation, this))
	//     .flatMap(x=> x.type == 'add-power-to-list' ? [x.id] : [])
	//     .map(id=> PersonaDB.allPowers().get(id))
	//     .flatMap( pwr=> pwr? [pwr]: []);
	//   return removeDuplicates(powers);
	// }

	getAllGrantedTalents(this: ItemModifierContainer, user: ValidAttackers, situation?: Situation): Talent[] {
		if (!this.grantsTalents()) {return [];}
		if (!situation) {
			situation = {
				user: user.accessor
			};
		}
		const talents= this.getPassiveEffects(user)
			.filter(
				eff => eff.consequences.some(
					cons => cons.type == 'add-talent-to-list'
				))
			.flatMap(eff=> getActiveConsequences(eff, situation))
			.flatMap(x=> x.type == 'add-talent-to-list' ? [x.id] : [])
			.map(id=> PersonaDB.allTalents().find(x=> x.id == id))
			.flatMap( tal=> tal? [tal]: []);
		return removeDuplicates(talents);
	}

	static getGrantedTalents(sourcedEffect: SourcedConditionalEffect, user: ValidAttackers, situation ?: Situation) : Talent[] {
		if (!situation) {
			situation = {
				user: user.accessor
			};
		}
		const cons =
			getActiveConsequences(sourcedEffect, situation);
		return cons
			.filter (x=> x.type == "add-talent-to-list")
			.map(cons=> PersonaDB.allTalents().find(x=> x.id == cons.id))
			.filter ( x=> x!= undefined);
	}

	modifiedHpCost(this: Usable, persona: Persona, situation ?: Situation) : number {
		if (!situation) {
			situation = {
				user: persona.user.accessor,
				usedPower: this.accessor,
			};
		}
		const newHPCost = this.hpCost();
		if (newHPCost > 0) {
			const calcedHPPercent = (this.hpCost() /100) * persona.user.mhpEstimate;
			return Math.round(calcedHPPercent * persona.hpCostMod().total(situation, 'percentage'));
		}
		const oldHPCost = this.oldhpCost();
		return Math.round(oldHPCost * persona.hpCostMod().total(situation, 'percentage'));
	}

	powerCostString_PC(this: Power, persona: Persona) : string {
		switch (this.system.subtype) {
			case 'weapon': {
				const hpCost = this.hpCost();
				if (hpCost > 0 || this.oldhpCost() > 0) {
					const hpCostPercent = (hpCost > 0) ? ` (${hpCost}%)` : '';
					const modCost = this.modifiedHpCost(persona);
					return `${modCost} HP ${hpCostPercent}`;
				}

				else {return 'free';}
			}
			case 'magic': {
				const mpcost = this.mpCost(persona);
				return `${mpcost} MP`;
			}
			case 'social-link':
				if (this.system.inspirationCost > 0) {
					return `${this.system.inspirationCost} Inspiration`;
				}
				break;
			case 'other':
			case 'passive':
			case 'none':
			case 'standalone':
			case 'defensive':
			case 'downtime':
				break;
			default:
				this.system.subtype satisfies never;
		}
		return 'free';
	}

	estimateShadowCosts(this: Power, user: ValidAttackers) : Power["system"]["energy"] {
		if (!user.isShadow()) {return {
			cost: 0,
			required: 0,
			newForm: true,
		};
		}
		const cost= EnergyClassCalculator.calcEnergyCost(this, user);
		return {
			cost: cost.energyCost,
			required: cost.energyRequired,
			newForm: true,
		};
	}

	// estimateShadowCosts(this: Power, user: ValidAttackers) : {energyReq: number, cost: number} {
	//   const diff = this.comparativePowerRatingToUsePower(user);
	//   let energyReq= 0, cost= 1;
	//   const reducedCostType = this.hasTag('buff') || this.hasTag('debuff') || this.hasTag('status-removal');
	//   let reqMin = reducedCostType ? 0 : 1;
	//   const energyMod = reducedCostType ? -3: 0;
	//   switch (true) {
	//     case (this.isDefensive() == true):
	//     case (this.isPassive() == true):
	//       energyReq = 0;
	//       cost = 0;
	//       reqMin = 0;
	//       break;
	//     case (diff == 0):
	//       energyReq += 3;
	//       cost += 1;
	//       break;
	//     case (diff > 0):
	//       energyReq += Math.max(reqMin, 3-diff);
	//       cost += 2 - Math.floor((1+diff)/2);
	//       break;
	//     case (diff < 0):
	//       if (this.hasTag('debuff') || this.hasTag('buff')) {
	//         energyReq += Math.min(3, 3 - diff);
	//       } else {
	//         energyReq += Math.min(10, 3-diff);
	//       }
	//       cost += 2 - diff;
	//       break;
	//   }
	//   energyReq += energyMod;
	//   cost = Math.clamp(cost, 0, 10);
	//   energyReq = Math.clamp(energyReq, reqMin, 10);
	//   return {energyReq, cost};

	// }

	// comparativePowerRatingToUsePower(this: Power, user: ValidAttackers) : number {
	//   const userLevel = Math.floor(user.level / 10) + 1;
	//   let powerSlot = this.system.slot;
	//   let extraMod = 0;
	//   if (this.hasTag('price-lower-for-shadow')) {
	//     powerSlot -= 1;
	//   }
	//   if (this.hasTag('high-cost')) {
	//     extraMod += 2;
	//   }
	//   const effectiveLevel = extraMod + (powerSlot*3);
	//   return Math.round(userLevel - effectiveLevel);
	// }

	powerCostString_Shadow(this: Power, persona: Persona) : string {
		const costs : string[] = [];
		let required: number, cost: number;
		if (this.parent instanceof PersonaActor) {
			required = this.system.energy.required;
			cost = this.system.energy.cost;
		} else {
			const Ecost= this.energyCostData(persona);
			// const estimates = this.estimateShadowCosts(persona.user);
			required = Ecost.required;
			cost = Ecost.cost;
		}
		if (required > 0) {
			costs.push(`EN>=${required}`);
		}
		if (cost > 0) {
			costs.push(`EN-${cost}`);
		}
		return costs.join(', ');
	}

	energyRequired(this: UsableAndCard, persona: Persona) : number {
		const cost =this.energyCostData(persona);
		return cost.required;
	}

	energyCostData(this: UsableAndCard, persona: Persona): Power["system"]["energy"] {
		if (!this.isPower() || this.isBasicPower()) {
			return {cost: 0, required: 0, newForm: false};
		}
		if (this.customCost) {
			return this.system.energy;
		}
		return this.estimateShadowCosts(persona.user);
		// const estimate = this.estimateShadowCosts(persona.user);
		// return {
		// 	cost: estimate.cost,
		// 	required: estimate.energyReq,
		// 	newForm: false,
		// };
	}

	energyCost(this: UsableAndCard, persona:Persona) : number {
		const cost =this.energyCostData(persona);
		return cost.cost;
	}

	static getSlotName(num : number) {
		return game.i18n.localize(SLOTTYPES[num]);
	}

	targets(this: UsableAndCard): Power['system']['targets'] {
		if (this.system.type == 'skillCard') {return 'self';}
		return this.system.targets;
	}

	toSkillCard(this: Power) : Promise<SkillCard> {
		return PersonaItem.createSkillCardFromPower(this);
	}

	static async createSkillCardFromPower(power: Power) : Promise<SkillCard> {
		if (power.system.type != 'power') {
			throw new Error('Not a power');
		}
		return await PersonaItem.create<SkillCard>( {
			name: `${power.name} card`,
			type: 'skillCard',
			system: {
				skillId: power.id,
			}
		});
	}

	/** required because foundry input hates arrays*/
	async sanitizeEffectsData(this: PowerContainer) {
		if (this.system.type == 'skillCard') {return;}
		const isArray = Array.isArray;
		let update = false;
		let effects = this.system.effects;
		try {
			if (!isArray(this.system.effects)) {
				effects = ArrayCorrector(this.system.effects) as typeof this.system.effects;
				update = true;
			}
			effects.forEach( ({conditions, consequences}, i) => {
				if (!isArray(conditions)) {
					effects[i].conditions = ArrayCorrector(conditions);
					update = true;
				}
				if (!isArray(consequences)) {
					effects[i].consequences = ArrayCorrector(consequences);
					update = true;
				}
			});
		} catch (e) {
			console.log(this);
			throw e;
		}
		if (update) {
			await this.update({'system.effects': effects});
		}
	}

	get displayedName() : string {
		switch (this.system.type) {
			case 'skillCard': {
				const skillId = this.system.skillId;
				const power = PersonaDB.allItems().find(x=> x.id == skillId);
				if (power && power.system.type == 'power') {
					return `${power.displayedName} Card`;
				}
				else {return 'Unlinked Skill Card';}
			}
		}
		return this.name;
	}

	get displayedNameHTML() : SafeString {
		switch (this.system.type) {
			case 'skillCard': {
				const skillId = this.system.skillId;
				const power = PersonaDB.allItems().find(x=> x.id == skillId);
				const cardPath = 'systems/persona/img/icon/persona-card.png';
				const cardImg = `<span class="skill-card"> <img class="name-icon" src="${cardPath}">`;
				if (power && power.system.type == 'power') {
					return new Handlebars.SafeString(`${cardImg} ${power.displayedNameHTML.toString()} Card </span>`);
				}
				else {return new Handlebars.SafeString('Unlinked Skill Card');}
			}
		}
		return new Handlebars.SafeString(this.name);
	}

	toModifierList(this: ItemModifierContainer, bonusTypes : ModifierTarget[] | ModifierTarget, sourceActor: PC | Shadow | null): ModifierList {
		const modifiers = this.getModifier(bonusTypes, sourceActor);
		return new ModifierList(modifiers);
	}

	static getModifier( effects: readonly SourcedConditionalEffect[], bonusTypes: MaybeArray<ModifierTarget>) : ModifierListItem[] {
		bonusTypes = Array.isArray(bonusTypes) ? bonusTypes : [bonusTypes];
		return bonusTypes.flatMap( btype => {
			if (!ConditionalEffectManager.canModifyStat(effects, btype)) {return [];}
			return effects
				.filter( eff => eff.consequences.some( cons => 'modifiedFields' in cons || 'modifiedField' in cons))
				.map(eff =>
					({
						name: eff.source?.name ?? "Unknown Source",
						// source: eff.source?.accessor ?? null,
						source: eff.source,
						owner: eff.owner,
						conditions: ArrayCorrector(eff.conditions),
						modifier: ModifierList.getModifierAmount(eff.consequences, btype),
					})
				);
		});
	}

	getModifier(this: ItemModifierContainer, bonusTypes : ModifierTarget[] | ModifierTarget, sourceActor: PersonaActor | null) : ModifierListItem[] {
		PersonaItem.cacheStats.modifierRead++;
		if (this.cache.containsModifier === false) {
			PersonaItem.cacheStats.modifierSkip++;
			return [];
		}
		bonusTypes = Array.isArray(bonusTypes) ? bonusTypes : [bonusTypes];
		let found = false;
		for (const modifier of bonusTypes) {
			let hasBonus = this.cache.statsModified.get(modifier);
			if (hasBonus === undefined) {
				hasBonus = ConditionalEffectManager.canModifyStat(this.getPassiveAndDefensiveEffects(sourceActor), modifier);
				this.cache.statsModified.set(modifier, hasBonus);
			}
			if (hasBonus === true) {
				found = true;
			}
		}
		if (!found) {
			PersonaItem.cacheStats.modifierSkip++;
			return [];
		}
		const filteredEffects = this.getEffects(sourceActor)
			.filter( eff => eff.consequences.some( cons => 'modifiedFields' in cons || 'modifiedField' in cons))
		;
		this.cache.containsModifier = filteredEffects.length > 0;
		// const acc = PersonaDB.getUniversalAccessor(this);
		return filteredEffects
			.map(x =>
				({
					name: this.name,
					source: x.source,
					owner: x.owner,
					conditions: ArrayCorrector(x.conditions),
					modifier: ModifierList.getModifierAmount(x.consequences, bonusTypes),
				})
			);
	}

	static getConferredTags (eff: SourcedConditionalEffect, actor: ValidAttackers) : CreatureTag[] {
		const situation = {
			user: actor.accessor,
		};
		//need this double check to prevent infinite loops
		const hasTagGivingCons =  eff.consequences.filter( c=> c.type == 'add-creature-tag') as (Consequence & {type : 'add-creature-tag'})[] ;
		if (hasTagGivingCons.length == 0) {return [];}
		const activeCons = getActiveConsequences(eff, situation);
		const tagGivingCons =  activeCons.filter( c=> c.type == 'add-creature-tag') as (Consequence & {type : 'add-creature-tag'})[] ;
		return tagGivingCons.map( x=> x.creatureTag);
	}

	getConferredTags(this: ItemModifierContainer, actor: ValidAttackers) : CreatureTag[] {
		if (this.cache.containsTagAdd === false) {
			return [];
		}
		const effects = this.getEffects(actor);
		if (!effects.some( e => e.consequences
			.some( cons => cons.type == 'add-creature-tag'))) {
			this.cache.containsTagAdd = false;
			return [];
		}
		const situation = {
			user: actor.accessor,
		};
		const cons : (Consequence & {type : 'add-creature-tag'})[] = ConditionalEffectManager.getAllActiveConsequences(effects, situation)
			.filter( c=> c.type == 'add-creature-tag') as (Consequence & {type : 'add-creature-tag'})[] ;
		return cons.map( c => c.creatureTag);
	}

	getDamageType(this: Usable | Weapon, attacker: ValidAttackers | Persona): Exclude<DamageType, 'by-power'> {
		if (attacker instanceof Persona) {
			attacker = attacker.user;
		}
		switch (this.system.dmg_type) {
			case 'fire':
			case 'wind':
			case 'light':
			case 'dark':
			case 'none':
			case 'healing':
			case 'physical':
			case 'gun':
			case 'cold':
			case 'lightning':
			case 'untyped':
			case 'all-out':
				return this.system.dmg_type;
			case 'by-power':
				return attacker.weapon?.getDamageType(attacker) ?? attacker.getUnarmedDamageType();
			default:
					this.system satisfies never;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
				PersonaError.softFail(`Can't find damag etype for ${String((this.system as any)?.dmg_type ?? "")}`);
				return 'none';
		}
	}

	baseDamage(this: Weapon) : Readonly<NewDamageParams> {
		if (this.system.damageNew)  {
			if (this.system.damageNew.baseAmt > 0) {return this.system.damageNew;}
			if (this.system.damageNew.weaponLevel > 0) {
				return {
					baseAmt: DamageCalculator.getWeaponDamageByWpnLevel(this.system.damageNew.weaponLevel),
					extraVariance: this.system.damageNew.extraVariance ?? 0,
				};
			}
			if (this.itemLevel() > 0) {
				return {
					baseAmt: DamageCalculator.getWeaponDamageByWpnLevel(this.itemLevel()),
					extraVariance: this.system.damageNew.extraVariance ?? 0,
				};
			}
		}
		if (this.system.damage.high >0) {
			return PersonaItem.convertOldDamageToNew(this.system.damage);
		}
		return {
			baseAmt: 0,
			extraVariance: 0
		};
	}

	static convertOldDamageToNew (oldDmg : Weapon['system']['damage']): Readonly<NewDamageParams> {
		const {high, low} = oldDmg;
		const diff = high-low;
		let extraVariance = 0;
		if (diff >=4) { extraVariance= 1;}
		return {extraVariance,
			baseAmt: DamageCalculator.convertFromOldLowDamageToNewBase(low)
		};
	}

	getWeaponSkillDamage(this: ItemSubtype<Power, 'weapon'>, userPersona: Persona, situation: Situation) : DamageCalculation {
		const dtype = this.getDamageType(userPersona);
		const calc= new DamageCalculation(dtype);
		const str = userPersona.combatStats.strDamageBonus();
		const weaponDmg = userPersona.wpnDamage();
		const skillDamage = DamageCalculator.weaponSkillDamage(this);
		const bonusDamage = userPersona.getBonusWpnDamage().total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const strRes = str.eval(situation);
		calc.add('base', strRes.total, `${userPersona.publicName} Strength (${strRes.steps.join(" ,")})`);
		const weaponName = userPersona.user.isShadow() ? 'Unarmed Shadow Damage' : (userPersona.user.weapon?.displayedName ?? 'Unarmed');
		calc.add('base', weaponDmg.baseAmt, weaponName.toString());
		calc.add('base', skillDamage.baseAmt, `${this.displayedName.toString()} Power Bonus`);
		calc.add('base', bonusDamage, 'Bonus Damage');
		const variance  = (DamageCalculator.BASE_VARIANCE + weaponDmg.extraVariance + skillDamage.extraVariance + bonusVariance );
		const varianceMult = userPersona.combatStats.getPhysicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		calc.setMinValue(1);
		return calc ;
	}

	getMagicSkillDamage(this: ItemSubtype<Power, 'magic'>, userPersona: Persona, situation: Situation): DamageCalculation {
		const persona = userPersona;
		const magicDmg = userPersona.combatStats.magDamageBonus();
		// const magicDmg = Math.floor(persona.magic);
		const skillDamage = DamageCalculator.magicSkillDamage(this);
		const damageBonus =  persona.getBonuses('magDmg').total(situation);
		const bonusVariance = userPersona.getBonusVariance().total(situation);
		const dtype = this.getDamageType(userPersona);
		const calc= new DamageCalculation(dtype);
		const resMag = magicDmg.eval(situation);
		calc.add('base', resMag.total, `${userPersona.publicName} Magic (${resMag.steps.join(" ,")})`, );
		calc.add('base', skillDamage.baseAmt, `${this.displayedName.toString()} Damage`);
		calc.add('base', damageBonus, 'Bonus Damage');
		const variance  = (DamageCalculator.BASE_VARIANCE + skillDamage.extraVariance + bonusVariance );
		const varianceMult = userPersona.combatStats.getMagicalVariance();
		calc.add('evenBonus', variance * varianceMult, `Even Bonus (${variance}x Variance)` );
		calc.setMinValue(1);
		return calc;
	}

	getDamage(this:Usable , userPersona: Persona, situation: Situation = {user: userPersona.user.accessor , usedPower: this.accessor, hit: true,  attacker: userPersona.user.accessor}, typeOverride : DamageConsequence['damageType'] = 'none') : DamageCalculation {
		//TODO: handle type override check to see if power damage is by-power or has other type
		if (!typeOverride || typeOverride == 'by-power') {
			if (this.system.dmg_type == 'none') {
				return new DamageCalculation('none');
			}
		}
		if (this.isPower() && this.system.damageLevel == 'none') {
			return new DamageCalculation('none');
		}
		const subtype : PowerType  = this.system.type == 'power' ? this.system.subtype : 'standalone';
		switch(subtype) {
			case 'weapon' : {
				return (this as ItemSubtype<Power, 'weapon'>).getWeaponSkillDamage(userPersona, situation);
			}
			case 'magic': {
				return (this as ItemSubtype<Power, 'magic'>).getMagicSkillDamage(userPersona, situation);
			}
			case 'standalone': {
				const dmg = this.system.damage;
				const dtype = this.system.dmg_type == 'by-power' ? 'untyped' : this.system.dmg_type;
				const calc = new DamageCalculation(dtype);
				calc.add('base', dmg.low, `${this.displayedName.toString()} base damage`);
				calc.add('evenBonus', dmg.high - dmg.low, `${this.displayedName.toString()} Even Bonus Damage`);
				return calc;
			}
			default:
				return new DamageCalculation('none');
		}
	}

	/** used for damage calculation estaimate for char sheet*/
	async generateSimulatedResult(this: Usable, user: ValidAttackers, situation: AttackResult['situation']) : Promise<CombatResult | undefined>;
	async generateSimulatedResult(this: Usable, user: ValidAttackers, simulatedNat: number) : Promise<CombatResult | undefined>;
	async generateSimulatedResult (this: Usable, user: ValidAttackers, simulatedSitOrNat: number | AttackResult['situation']) : Promise<CombatResult | undefined> {
		const token = user.getActiveTokens(true)
		.map(x=> x.document) as PToken[];
		if (!token || token.length ==0) {return undefined;}
		if (typeof simulatedSitOrNat == 'number') {
			return await PersonaCombat.getSimulatedResult(token[0], this,token[0], simulatedSitOrNat);
		} else {
			return await PersonaCombat.getSimulatedResult(token[0], this,token[0], simulatedSitOrNat);
		}
	}

	async generateSimulatedDamageObject(this: Usable, user: ValidAttackers, simulatedNat: number) : Promise<EvaluatedDamage | undefined> {
		const result = await this.generateSimulatedResult(user, simulatedNat);
		return result?.finalize()?.attacks[0]?.changes[0]?.damage[0];
	}

	async displayDamageStack(this: Usable, persona: Persona) : Promise<string> {
		// const estimate = this.generateSimulatedDamageObject(user, 6);
		// if (!estimate) {console.warn(`Can't get damage stack for ${this.name}`); return;}
		// const sim = estimate?.str;
		// if (!sim) {console.warn(`Can't get damage stack for ${this.name}`); return;}
		const st = await this.getDamageStack(persona.user);
		console.log(`Damage stack ${st}`);
		return st;
	}


	// getDamageStack(this: Usable, userPersona: Persona): string {
	//   const estimate = this.getDamage(userPersona).setApplyEvenBonus().eval();
	//   if (!estimate) {ui.notifications.notify(`Can't get damage stack for ${this.name}`); return '';}
	//   const sim = estimate?.str;
	//   if (!sim) {ui.notifications.notify(`Can't get damage stack for ${this.name}`); return '';}
	//   return `
	//   ${this.name}: ${estimate.damageType}
	//   ${sim.join('\n')}
	//     `;
	// }

	// estimateDamage(this: Usable, userPersona: Persona) : {low: number, high: number} {
	// if (!this.isTrulyUsable()) {return {high:0, low: 0};}

	// if (this.isWeaponSkill() || this.isMagicSkill() || this.isConsumable()) {
	// const damage = this.getDamage(userPersona);
	// const high = Math.abs(damage.clone().setApplyEvenBonus().eval().hpChange);
	// const low = Math.abs(damage.clone().eval().hpChange);
	// return {high, low};
	// }
	// return {high: -1, low: -1};
	// }

	async getDamageStack(this: Usable, user: ValidAttackers): Promise<string> {
		const estimate = await this.generateSimulatedDamageObject(user, 6);
		if (!estimate) {ui.notifications.notify(`Can't get damage stack for ${this.name}`); return '';}
		const sim = estimate?.str;
		if (!sim) {ui.notifications.notify(`Can't get damage stack for ${this.name}`); return '';}
		return `
	 ${this.name}: ${estimate.damageType}
	 ${sim.join('\n')}
		`;
	}

	async estimateDamage(this: Usable, user: ValidAttackers) : Promise<{low: number, high: number}> {
		switch (this.system.subtype) {
			case 'social-link':
			case 'passive':
			case 'other':
			case 'none':
			case 'defensive':
			case 'downtime':
				return {high: 0, low:0};
			case 'reusable':
			case 'consumable':
			case 'standalone': {
				return {
					high: Math.abs((await this.generateSimulatedDamageObject(user, 6))?.hpChange ?? 0),
					low: Math.abs((await this.generateSimulatedDamageObject(user, 5))?.hpChange ?? 0) ,
				};
			}
			case 'weapon':
			case 'magic':
				if (this.system.damageLevel == 'none') {
					return {high: 0, low:0};
				}
				return {
					high: Math.abs((await this.generateSimulatedDamageObject(user, 6))?.hpChange ?? 0),
					low: Math.abs((await this.generateSimulatedDamageObject(user, 5))?.hpChange ?? 0) ,
				};
			default:
				this.system satisfies never;
				return {high: -1, low:-1};
		}
	}

	get tooltip(): string {
		switch (this.system.type) {
			case 'consumable':
			case 'item':
			case 'power':
			case 'focus':
			case 'talent':
			case 'universalModifier':
			case 'tag':
			case 'weapon': {
				const description = this.system.description ?? "";
				const parts=  description.split("\n")
				.map( x=> x.trim());
				return `${this.displayedName.toString()}\n` + parts.join("\n");
			}
			case 'characterClass':
			case 'skillCard':
			case 'socialCard':
				return '';
			default:
				this.system satisfies never;
				return '';
		}
	}

	get description(): SafeString {
		switch (this.system.type) {
			case 'consumable':
			case 'item':
			case 'power':
			case 'focus':
			case 'talent':
			case 'universalModifier':
			case 'tag':
			case 'weapon': {
				const description = this.system.description ?? "";
				const parts=  description.split("\n")
				.map( x=> x.trim());
				const join = parts.join("<br>");
				return new Handlebars.SafeString(join);
			}
			case 'characterClass':
			case 'skillCard':
			case 'socialCard':
				return new Handlebars.SafeString('');
			default:
				this.system satisfies never;
				return new Handlebars.SafeString('');
		}
	}

	defaultConditionalEffectType() : TypedConditionalEffect['conditionalType'] {
		if (this.isTrulyUsable()) {return 'on-use';}
		if (this.isDefensive()) {return 'defensive';}
		return 'passive';
	}

	critBoost(this: Usable, user: ValidAttackers) : Calculation {
		const calc = user.persona().critBoost();
		let powerCrit = (this.system.crit_boost ?? 0);
		if (this.isWeaponSkill()
			&& !this.isBasicPower()
			&& this.system.ailmentChance == 'none'
			&& !this.isInstantDeathAttack()) {
			powerCrit += 2;
		}
		calc.add(1, powerCrit, 'Power Modifier', "add");
		return calc;
	}

	canBeReflectedByPhyiscalShield(this: UsableAndCard, attacker: ValidAttackers): boolean {
		if (this.isSkillCard()) {return false;}
		const dtype = (this).getDamageType(attacker);
		switch (dtype) {
			case 'physical':
			case 'gun':
				return true;
			default:
				return false;
		}
	}

	isWeaponSkill(): this is PowerSub<'weapon'> {
		if (!this.isUsableType()) {return false;}
		if (this.isSkillCard()) {return false;}
		return (this.system.subtype == 'weapon');
	}

	isMagicSkill(this: UsableAndCard): this is PowerSub<'magic'> {
		if (this.isSkillCard()) {return false;}
		return (this.system.subtype == 'magic');
	}

	isFlurryPower(this: Power): boolean {
		return this.system.attacksMax > 1;
	}

	hpCost(this: Usable): number {
		if (!this.isWeaponSkill() || !this.isPower()) {return 0;}
		if (this.isTeamwork()) {return 0;}
		if (this.customCost) {return this.system.hpcost;}
		const newSys=  PowerCostCalculator.calcHPPercentCost(this);
		return newSys;

	}

	oldhpCost(this: Usable): number {
		if (!this.isWeaponSkill()) {
			return 0;
		}
		if (this.isConsumable()) {return 0;}
		if (this.isBasicPower()) {return 0;}
		if (this.isTeamwork()) {return 0;}
		let mult = 1;
		if (this.hasTag('high-cost')) {
			mult *= 2;
		}
		switch (this.system.slot) {
			case 0: return mult * 6;
			case 1: return mult * 12;
			case 2: return mult * 25;
			case 3: return mult * 50;
			default:
				PersonaError.softFail(`Unknwon slot ${ this.system.slot}`);
				return 100;
		}
	}

	canBeReflectedByMagicShield(this: UsableAndCard, attacker: ValidAttackers) : boolean {
		if (this.isSkillCard()) {return false;}
		const dtype = (this).getDamageType(attacker);
		switch (dtype) {
			case 'fire':
			case 'wind':
			case 'light':
			case 'dark':
			case 'cold':
			case 'lightning':
				return true;
			case 'gun':
			case 'none':
			case 'healing':
			case 'physical':
			case 'untyped':
			case 'all-out':
				break;
			default:
				dtype satisfies never;
		}
		return false;

	}
	isOpener(this: UsableAndCard) : boolean {
		return this.hasTag('opener');
	}


	isTrueItem() : this is InvItem | SkillCard | Weapon | Consumable {
		switch(this.system.type) {
			case 'consumable':
			case 'item':
			case 'weapon':
			case 'skillCard':
				return true;
			default:
				return false;
		}
	}

	isPassive(this: UsableAndCard) : boolean {
		if (this.system.type == 'skillCard') {return false;}
		const item = this as Usable;
		return item.system.subtype == 'passive' ||
			item.hasTag('passive');
	}

	isTeamwork(this: UsableAndCard): boolean {
		return this.hasTag('teamwork');
	}

	isNavigator(this: UsableAndCard): boolean {
		return this.hasTag('navigator');
	}

	isValidTargetFor(this: Usable, user: ValidAttackers, target: ValidAttackers, situation?: Situation): boolean {
		if (!situation) {
			situation = {
				user : user.accessor,
				target: target.accessor,
			};
		} else {
			situation = {
				...situation,
				target: target.accessor
			};
		}
		switch (this.system.targets) {
			case '1-engaged':
			case '1-nearby':
			case '1d4-random':
			case '1d4-random-rep':
			case '1d3-random':
			case '1d3-random-rep':
				if (!target.isAlive()) {return false;}
				break;
			case '1-nearby-dead':
				if (target.isAlive()) {return false;}
				break;
			case 'self':
				if (user != target) {return false;}
				break;
			case '1-random-enemy':
			case 'all-enemies':
				if (PersonaCombat.isSameTeam(user, target)) {return false;}
				if (!target.isAlive()) {return false;}
				break;
			case 'all-allies':
				if (!PersonaCombat.isSameTeam(user, target)) {return false;}
				if (!target.isAlive()) {return false;}
				break;
			case 'all-dead-allies':
				if (!PersonaCombat.isSameTeam(user, target)) {return false;}
				if (target.isAlive()) {return false;}
				break;
			case 'all-others':
				if (user == target) {return false;}
				if (target.isAlive()) {return false;}
				break;
			case 'everyone':
				if (!target.isAlive()) {return false;}
				break;
			case 'everyone-even-dead':
				break;
			default:
				this.system.targets satisfies never;
		}
		if (this.isOpener()) {
			const sourced = ConditionalEffectManager.getConditionals(this.system.openerConditions, this, user );
			if (!testPreconditions(sourced, situation)) {return false;}
		}
		const sourcedTC = ConditionalEffectManager.getConditionals(this.system.validTargetConditions, this, user );

		return testPreconditions(sourcedTC, situation);
	}


	/** returns the level of the inventory item */
	itemLevel() : number {
		if (!this.isCarryableType()) {return 0;}
		if (this.isConsumable()) { return 1;}
		return this.system.itemLevel;
	}

	isPower() : this is Power {
		return this.system.type == 'power';
	}

	isTalent() : this is Talent {
		return this.system.type == 'talent';
	}

	isConsumable(): this is Consumable {
		return this.system.type == 'consumable';
	}

	isWeapon() : this is Weapon {
		return this.system.type == "weapon";
	}

	isTag() : this is Tag {
		return this.system.type == "tag";
	}

	isUniversalModifier(): this is UniversalModifier {
		return this.system.type == "universalModifier";
	}

	isCarryableType(): this is Carryable  {
		switch (this.system.type) {
			case "consumable":
			case "item":
			case "weapon":
			case "skillCard":
				return true;
			default:
				return false;
		}
	}

	isInvItem(): this is InvItem {
		return this.system.type == "item";
	}

	isKeyItem(): boolean {
		if (!this.isCarryableType()) {return false;}
		if (this.isInvItem()) {
			if (this.system.slot == "key-item")
			{return true;}
		}
		return this.hasTag("key-item");
	}

	isCraftingMaterial(): boolean {
		if (!this.isCarryableType()) {return false;}
		if (this.isInvItem()) {
			return this.system.slot == "crafting";
		}
		if (this.isConsumable()) {
			return this.hasTag("crafting");
		}
		return false;
	}


	isEquippable(): boolean {
		if (!this.isCarryableType()) {return false;}
		if (this.isWeapon()) {return true;}
		if (this.system.type != "item") {return false;}
		switch (this.system.slot) {
			case "key-item": return false;
			case "body": return true;
			case "accessory": return true;
			case "weapon_crystal": return true;
			case "crafting": return false;
			case "none": return false;
			default:
				this.system.slot satisfies never;
				return false;
		}
	}

	isShadowExclusivePower(): boolean {
		if (!this.isPower()) {return false;}
		return this.hasTag('shadow-only');
	}

	isBasicPower(this: UsableAndCard) : boolean {
		if (this.system.type == 'skillCard') {return false;}
		if (this.system.type == 'consumable') {return false;}
		const basics = [
			...PersonaItem.getBasicPCPowers(),
			...PersonaItem.getBasicShadowPowers(),
		];
		return basics.includes(this as Power);
	}

	baseInstantKillBonus(this: Usable) : number {
		if (!this.isInstantDeathAttack()) {return 0;}
		const boost = INSTANT_KILL_CRIT_BOOST[this.system.instantKillChance] ?? 0;
		// if (this.isAoE()) {boost += 4;}
		return boost;
	}

	baseAilmentBonus(this: Usable) : number {
		if (this.system.defense != "ail") {return 0;}
		const boost = AILMENT_BONUS_LEVELS[this.system.ailmentChance] ?? 0;
		if (this.system.ailmentChance == "always") {
			ui.notifications.notify(`${this.name} Ailment Always not allowed on ailment targetting powers, treating as High`);
		}
		return boost;
	}

	mpCost(this: Usable, userPersona: Persona | null): number {
		if (this.isConsumable()) {return 0;}
		let mult  = 1;
		if (userPersona) {
			const sit : Situation = {
				user: userPersona.user.accessor,
				usedPower: this.accessor,
				attacker: userPersona.user.accessor,
			};
			const list = userPersona.getBonuses('mpCostMult');
			mult = list.total(sit, 'percentage');
		}
		const baseMPCost = this.baseMPCost;
		return Math.round(baseMPCost * mult);
	}


	get baseMPCost(): number {
		if (!this.isPower()) {return 0;}
		if (this.isTeamwork()) {return 0;}
		if (this.customCost)
		{return this.system.mpcost;}
		if (this.cache.mpCost == undefined) {
			this.cache.mpCost = PowerCostCalculator.calcMPCost(this);
		}
		if (this.cache.mpCost > 0)  {
			return this.cache.mpCost;
		}
		return this.system.mpcost;
	}

	armorDR(this: InvItem) : number {
		if (this.system.slot != "body") {return 0;}
		if (this.system.armorLevel > 0) {
			return DamageCalculator.getArmorDRByArmorLevel(this.system.armorLevel);
		}
		if (this.system.armorDR > 0) {
			return this.system.armorDR;
		}
		if (this.itemLevel() > 0) {
			return DamageCalculator.getArmorDRByArmorLevel(this.itemLevel());
		}
		return 0;
	}

	generateSkillCardTeach(this: SkillCard): SourcedConditionalEffect {
		if (!this.system.skillId) {
			return {
				source: this,
				conditionalType: 'on-use',
				isDefensive: false,
				conditions: [],
				consequences: [],
				owner: this.parent?.accessor,
			};
		}
		const cardEffect = {
			conditionalType: 'on-use',
			isDefensive: false,
		} as const;
		const conditions = [
			{
				conditionalType: "on-use",
				type: 'always',
				source: this,
				owner: this.parent?.accessor,
			} as const
		];
		const consequences = [
			{
				type: 'teach-power',
				id: this.system.skillId,
				sourceItem: this.accessor,
				source: this,
				owner: this.parent?.accessor,
			} as const
		];
		return {
			conditions,
			consequences,
			source: this,
			...cardEffect,
			owner: this.parent?.accessor,
		};
	}

// hasTargettedEffects(this: Usable): boolean {
//TODO: Finish later
// }

getEffects(this: ItemModifierContainer, sourceActor : PersonaActor | null, CETypes ?: TypedConditionalEffect['conditionalType'][], proxyItem : ItemModifierContainer = this ): readonly SourcedConditionalEffect[] {
	//proxy item is used for tags to redirect their source to their parent item (for purposes of reading item level)
	if (this.isSkillCard()) {
		const arr = [
			this.generateSkillCardTeach()
		];
		return arr;
	}
	const tagEffects : SourcedConditionalEffect[] = [];
	if (!this.isTalent() && !this.isTag() && !this.isUniversalModifier()){
		const tags = this.tagList(sourceActor?.isValidCombatant() ? sourceActor : null)
			.filter (tag=> tag instanceof PersonaItem);
		tagEffects.push(...tags.flatMap(tag =>
			tag.getEffects(sourceActor, CETypes, this)
		));
	}
	if (!CETypes || CETypes.length == 0) {
		const effects = this.system.effects;
		return this.#accessEffectsCache('allEffects', sourceActor, () => ConditionalEffectManager.getEffects(effects, proxyItem, sourceActor))
			.concat(tagEffects);
	} else {
		const effects: SourcedConditionalEffect[] = [];
		for (const cType of CETypes) {
			switch (cType) {
				case 'defensive':
					effects.push(...this.getDefensiveEffects(sourceActor, proxyItem));
					break;
				case 'triggered':
					effects.push(...this.getTriggeredEffects(sourceActor, proxyItem));
					break;
				case 'passive':
					effects.push(...this.getPassiveEffects(sourceActor, proxyItem));
					break;
				case 'on-use':
					effects.push(...this.getOnUseEffects(sourceActor, proxyItem));
					break;
				case 'unknown':
					effects.push(...this.getEffects(sourceActor, [], proxyItem).filter( x=> x.conditionalType == cType));
					break;
				default:
					cType satisfies never;
			}
		}
		return effects;
	}
}

#accessEffectsCache(this: ItemModifierContainer, cacheType: keyof AdvancedEffectsCache, sourceActor: PersonaActor | null, refresherFn: () => SourcedConditionalEffect[]) : readonly SourcedConditionalEffect[] {
	if (!PersonaDB.isLoaded) {return [];}
	PersonaItem.cacheStats.total++;
	const cache = this.cache.effects[cacheType];
	if (sourceActor == null) {
		if (!cache.nullActor) {
			PersonaItem.cacheStats.miss++;
			cache.nullActor = refresherFn();
		}
		return cache.nullActor;
	} else {
		const data = cache.actors.get(sourceActor);
		if (data) {return data;}
		PersonaItem.cacheStats.miss++;
		const newData=  refresherFn();
		cache.actors.set(sourceActor, newData);
		return newData;
	}
}


getTriggeredEffects(this: ItemModifierContainer, sourceActor: PersonaActor | null, proxyItem: ItemModifierContainer = this) : readonly SourcedConditionalEffect[] {
	return this.#accessEffectsCache('triggeredEffects', sourceActor, () => this.getEffects(sourceActor, [], proxyItem).filter( x => x.conditionalType === 'triggered'));
}

hasTriggeredEffects(this: ItemModifierContainer, actor: PersonaActor) : boolean {
	return this.getTriggeredEffects(actor).length > 0;
}


getOnUseEffects(this: ItemModifierContainer, sourceActor: PersonaActor | null, proxyItem: ItemModifierContainer = this) : readonly SourcedConditionalEffect[] {
	return this.#accessEffectsCache('onUseEffects', sourceActor, () => this.getEffects(sourceActor, [], proxyItem).filter( x => x.conditionalType === 'on-use'));
}

getPassiveEffects(this: ItemModifierContainer, sourceActor: PersonaActor | null, proxyItem: ItemModifierContainer = this) : readonly SourcedConditionalEffect[] {
	return this.#accessEffectsCache('passiveEffects', sourceActor, () => this.getEffects(sourceActor, [], proxyItem).filter( x => x.conditionalType === 'passive'));
}

getPassiveAndDefensiveEffects(this: ItemModifierContainer, sourceActor: PersonaActor  | null) : readonly ConditionalEffect[] {
	return this.getPassiveEffects(sourceActor)
		.concat(this.getDefensiveEffects(sourceActor));
}

hasPassiveEffects(this: ItemModifierContainer, actor: PersonaActor | null) : boolean {
	return this.getPassiveEffects(actor).length > 0;
}

getDefensiveEffects(this: ItemModifierContainer, sourceActor: PersonaActor | null, proxyItem: ItemModifierContainer = this) : readonly SourcedConditionalEffect[] {
	return this.#accessEffectsCache('defensiveEffects', sourceActor, () => this.getEffects(sourceActor, [], proxyItem ).filter( x => x.conditionalType === 'defensive'));
}

hasDefensiveEffects(this: ItemModifierContainer, sourceActor: PersonaActor | null) : boolean {
	return this.getDefensiveEffects(sourceActor).length > 0;
}

static triggersOn( eff: SourcedConditionalEffect, trig: Trigger) : boolean {
	return eff.conditions
		.some (cond => cond.type === 'on-trigger' && cond.trigger == trig);
}

triggersOn(this: ItemModifierContainer, trig: Trigger)  :boolean {
	const effects= this.getTriggeredEffects(null);
	return effects.some( eff=> eff.conditions
		.some (cond => cond.type === 'on-trigger' && cond.trigger == trig)
	);
}

requiredLinkLevel(this: Focus) : number  {
	const requirement = 0;
	for (const eff of this.getEffects( null)) {
		for (const cond of eff.conditions) {
			if (
				cond.type != 'numeric'
				|| cond.comparisonTarget != 'social-link-level'
			) {
				continue;
			}
			if (
				cond.socialLinkIdOrTarot == 'SLSource'
				|| cond.socialLinkIdOrTarot == this.parent?.id
				|| cond.socialLinkIdOrTarot == this.parent?.name
				|| cond.socialLinkIdOrTarot == this.parent?.tarot?.name
			) {
				// return 'num' in cond ? cond.num ?? 0 : 0;
				if ('num' in cond) {
					const sourced = ConsequenceAmountResolver.extractSourcedFromField(cond, "num");
					const val = ConsequenceAmountResolver.resolveConsequenceAmount(sourced, {});
					return val ?? 0;
				}
				return 0;
			}
		}
	}
	return requirement;
}

cardEvents(this: SocialCard) : CardEvent[] {
	return this.system.events;
}

isAvailable(this: Activity, pc: PC): boolean {
	const sit: Situation = {
		user: pc.accessor
	};
	if (this.system.weeklyAvailability.disabled) {return false;}
	const sourcedConditions = ConditionalEffectManager.getConditionals(this.system.conditions, null, null );
	if(!testPreconditions(sourcedConditions, sit)) {return false;}
	return this.system.weeklyAvailability.available;
}

announce(this: SocialCard, pc: PC): boolean {
	if (!this.system.announceWhenAvailable) {
		return false;
	}
	return this.isAvailable(pc);
}

async resetAvailability (this: Activity, day: SimpleCalendar.WeekdayName) : Promise<void> {
	const avail = this.system.weeklyAvailability[day];
	await this.setAvailability(avail);
}

async setAvailability(this: SocialCard, bool: boolean) : Promise<void> {
	if (this.system.weeklyAvailability.available == bool){ return; }
	if (game.user.isGM || this.isOwner) {
		//possible fix for the update seemingly not taking effect in time despite the await
		this.system.weeklyAvailability.available = bool;
		await this.update( {'system.weeklyAvailability.available': bool});
	} else {
		PersonaError.softFail(`Can't update availability for ${this.name} as you are not an owner`);
	}
}

async addCardEvent(this: SocialCard) {
	const newEv : SocialCard['system']['events'][number] = {
		sound: '',
		text: '',
		img: '',
		volume: 1.0,
		placement: {
			starter: true,
			middle: true,
			finale: true,
			special: false,
		},
		label: '',
		name: 'Unnamed Event',
		frequency: 1,
		choices: [],
		conditions: [],
		eventTags: [],
	};
	this.system.events.push( newEv);
	await this.update({'system.events': this.system.events});
}

async deleteCardEvent(this: SocialCard, eventIndex: number) {
	this.system.events.splice(eventIndex, 1);
	await this.update({'system.events': this.system.events});
}

async addEventChoice(this: SocialCard, eventIndex: number) {
	const event = this.system.events[eventIndex];
	const arr = ArrayCorrector(event.choices) as CardChoice[];
	const roll: CardRoll = {
		rollType: 'none',
		progressSuccess:0,
		progressCrit: 0,
		progressFail: 0,
		rollTag1: '',
		rollTag2: '',
		rollTag3: '',
	};
	const newChoice: CardChoice = {
		name: 'Unnamed Choice',
		conditions: [],
		text: '',
		postEffects: {effects:[]},
		roll,
		resourceCost: 0,
	};
	arr.push( newChoice);
	event.choices = arr;
	await this.update({'system.events': Helpers.expandObject(this.system.events)});
}

async deleteEventChoice(this: SocialCard, eventIndex: number, choiceIndex: number) {
	const event = this.system.events[eventIndex];
	const arr = ArrayCorrector(event.choices) as CardChoice[];
	arr.splice(choiceIndex, 1);
	event.choices = arr;
	await this.update({'system.events': Helpers.expandObject(this.system.events)});
}


get perk() : string {
	switch (this.system.type) {
		case 'socialCard':
			return this.system.perk;
		default:
			return '';
	}
}

async createNewTokenSpend(this: Activity  ) {
	const list = this.system.tokenSpends;
	const newItem : typeof list[number] = {
		conditions: [],
		amount: 1,
		text: '',
		consequences: []
	};
	list.push(newItem);
	await this.update({'system.tokenSpends':list});
}

async deleteTokenSpend(this: Activity  , deleteIndex:number) {
	const list = this.system.tokenSpends;
	list.splice(deleteIndex,1);
	await this.update({'system.tokenSpends':list});
}

async priceFix() {
	//updates money to new x10 total
	switch (this.system.type) {
		case 'item':
		case 'consumable': {
			const price = this.system.price * 10;
			await this.update({'system.price': price});
			break;
		}
		default:
			return;
	}
}

isStatusEffect(this: UsableAndCard) : boolean {
	if (this.system.type == 'skillCard') {return false;}
	const statusTags : PowerTag[] = [
		'ailment',
		'sleep',
		'charm',
		'rage',
		'fear',
		'confusion',
		'poison',
		'sealed',
		'mouse',
		'despair',
		'blind',
	];
	return statusTags.some( st => this.hasTag(st));
}

isMultiTarget(this: UsableAndCard) : boolean {
	if (this.system.type == 'skillCard') {return false;}
	switch (this.system.targets) {
		case '1-nearby-dead':
		case '1-nearby':
		case '1-engaged':
		case '1-random-enemy':
		case 'self':
			return false;
		case '1d4-random':
		case '1d4-random-rep':
		case '1d3-random':
		case '1d3-random-rep':
		case 'all-enemies':
		case 'all-allies':
		case 'all-dead-allies':
		case 'all-others':
		case 'everyone':
		case 'everyone-even-dead':
			return true;
		default:
			this.system.targets satisfies never;
			PersonaError.softFail(`Unknown target type: ${this.system.targets as string}`);
			return false;
	}
}

isAoE(this: UsableAndCard) : boolean {
	if (this.system.type == 'skillCard') {return false;}
	switch (this.system.targets) {
		case '1-nearby-dead':
		case '1-nearby':
		case '1-engaged':
		case 'self':
		case '1d4-random':
		case '1d4-random-rep':
		case '1d3-random':
		case '1d3-random-rep':
		case '1-random-enemy':
			return false;
		case 'all-enemies':
		case 'all-allies':
		case 'all-dead-allies':
		case 'all-others':
		case 'everyone':
		case 'everyone-even-dead':
			return true;
		default:
			this.system.targets satisfies never;
			PersonaError.softFail(`Unknown target type: ${this.system.targets as string}`);
			return false;
	}
}

/** used for determining shadows usage limits
 */
powerEffectLevel(this: Power) : number {
	const base = this.system.slot * 3;
	const tags = this.system.tags;
	let mod = 0;
	if (tags.includes('healing')) {
		mod += 1;
	}
	// const multiMod = this.isMultiTarget() ? 1 : 0;
	const dmgtype = this.system.dmg_type;
	if (dmgtype == 'dark' || dmgtype == 'light')
	{mod+= 1;}
	if (this.isAoE()) {
		mod += 2;
	}
	return base + mod;
}

async setPowerCost(this: Power, required: number, cost: number) {
	await this.update({
		'system.energy.required': required,
		'system.energy.cost': cost,
		'system.energy.newForm': true,
	});
}

targetMeetsConditions(this: UsableAndCard, user: ValidAttackers, target: ValidAttackers, situation?: Situation) : boolean {
	if (target.hasStatus('protected') && user != target) {return false;}
	if (this.system.type == 'skillCard') {return target.canLearnNewSkill();}
	const usable = this as Usable;
	if (!usable.system.validTargetConditions) {return true;}
	const conditions  = ConditionalEffectManager.getConditionals(this.system.validTargetConditions, this, user);
	if (!situation) {
		situation = {
			attacker : user.accessor,
			user: user.accessor,
			target: target.accessor,
			usedPower: usable.accessor,
		};
	}
	return testPreconditions(conditions, situation);
}

requiresTargetSelection(this: Usable) : boolean {
	switch (this.system.targets) {
		case '1-engaged':
		case '1-nearby':
			return true;
		case '1d4-random':
		case '1d3-random':
		case '1-random-enemy':
			return false;
		case '1-nearby-dead':
			return true;
		case '1d4-random-rep':
		case '1d3-random-rep':
			return false;
		case 'self':
			return false;
		case 'all-enemies':
		case 'all-allies':
		case 'all-dead-allies':
		case 'all-others':
		case 'everyone':
		case 'everyone-even-dead':
			return false;
		default:
			this.system.targets satisfies never;
			return false;
	}
}

cardConditionsToSelect( this: SocialCard) : readonly SourcedPrecondition[] {
	const extraConditionsFromTags = this.extraConditionsFromTags();
	if (extraConditionsFromTags.length == 0) {
		return ConditionalEffectManager.getConditionals(this.system.conditions, null, null);
	}
	const conditions =  this.system.conditions.concat(extraConditionsFromTags);
	return ConditionalEffectManager.getConditionals(conditions, null, null);
}

isInstantDeathAttack(this: Usable) : boolean {
	return (this.system.instantKillChance != 'none');
}

canDealDamage(this: Usable) :  boolean {
	if (this.isPower() && this.system.damageLevel == "none") {return false;}
	return this.getOnUseEffects(null)
		.some( eff => eff.consequences
			.some( cons => cons.type == "damage-new" || cons.type.includes("dmg")
			)
		);
}

extraConditionsFromTags( this: SocialCard) : SocialCard['system']['conditions'] {
	const SLCheck = function (low:number, high:number) : Precondition {
		const SLcheck: Precondition = {
			type: 'numeric',
			comparator: 'range',
			comparisonTarget: 'social-link-level',
			num: low,
			high: high,
			socialLinkIdOrTarot: 'target',
		};
		return SLcheck;
	};
	const conditionTags : typeof CARD_RESTRICTOR_TAGS[number][] = this.system.cardTags
		.filter(tag=> CARD_RESTRICTOR_TAGS.includes(tag as typeof CARD_RESTRICTOR_TAGS[number])) as typeof CARD_RESTRICTOR_TAGS[number][];
	return conditionTags.flatMap( tag => {
		switch (tag) {
			case 'real-world': {
				const realWorld : Precondition = {
					type: 'boolean',
					boolComparisonTarget: 'has-creature-tag',
					conditionTarget: 'target',
					creatureTag: 'stuck-in-metaverse',
					booleanState: false,
				};
				return [ realWorld ]; 
			}
			case 'date':
			case 'friends': {
				const isDating : Precondition = {
					type: 'boolean',
					boolComparisonTarget: 'social-availability',
					booleanState: tag == 'date',
					conditionTarget: 'user',
					socialTypeCheck: 'is-dating',
					socialLinkIdOrTarot: 'target',
				};
				return [ isDating ];
			}
			case 'student-stuff': {
				const isStudent: Precondition = {
					type: 'boolean',
					boolComparisonTarget: 'has-creature-tag',
					booleanState: true,
					conditionTarget: 'target',
					creatureTag: 'student',
				};
				return [isStudent];
			}
			case 'middle-range':
				return [SLCheck(3,8)];
			case 'trusted':
				return [SLCheck(7,10)];
			case 'introductory':
				return [SLCheck(1,3)];
			case 'one-shot':
			case 'question':
				return [];
			case 'disabled': {
				const neverHappen: Precondition = {
					type: 'never',
				};
				return [neverHappen];
			}
			default:
				tag satisfies never;
				break;
		}
		return [];
	});
}

async markEventUsed(this: SocialCard, event: CardEvent) {
	const ev = this.system.events.find(ev => ev == event);
	if (!ev) {
		PersonaError.softFail(`Can't find event ${event.name} on ${this.name}`);
		return;
	}
	if (!ev.eventTags.includes('one-shot')) {
		PersonaError.softFail(`Event ${ev.name} isnt a one shot event and thus can't be disabled!`);
		return;
	}
	ev.eventTags.pushUnique('disabled');
	const eventsArr= this.system.events.map( x=> (x as unknown as JSONAble).toJSON());
	return await this.update({'system.events': eventsArr});
}

static async DamageLevelConvert(item: PersonaItem) {
	if (!item.isUsableType()) {return;}
	if (item.isSkillCard()) {return;}
	if (!item.isPower()) {return;}
	let damageLevel : typeof item['system']['damageLevel'] | undefined;
	if (item.system.damageLevel != '-' && item.system.damageLevel != 'fixed') {return;}
	if (item.system.dmg_type == 'none') {
		damageLevel = 'none';
	} else {
		switch (item.system.subtype) {
			case 'magic':
				damageLevel= PersonaItem.#convertSpellDamage(item);
				break;
			case 'weapon':
				damageLevel = PersonaItem.#convertPhysicalDamage(item);
				break;
			default:
				break;
		}
	}
	if (damageLevel) {
		await item.update({'system.damageLevel': damageLevel});
		console.log(`Damage Type for ${item.name} set to ${damageLevel}`);
	}
}

static #convertPhysicalDamage(item: Power) :typeof item['system']['damageLevel'] | undefined  {
	switch (item.system.melee_extra_mult) {
		case -1:
			return 'miniscule';
		case 0:
			return 'basic';
		case 1:
			return 'light';
		case 2:
		case 3:
			return 'medium';
		case 4:
		case 5:
			return 'heavy';
		case 7:
			return 'severe';
		default:
			console.log(`Unknown Value for ${item.name}, ${item.system.melee_extra_mult} weapon mult`);
			return undefined;
	}
}

static #convertSpellDamage(item: Power) : typeof item['system']['damageLevel'] | undefined {
	switch (item.system.mag_mult) {
		case 0:
			return 'none';
		case 3:
			return 'light';
		case 4:
			return 'medium';
		case 6:
			if (item.system.dmg_type == 'healing')
			{return 'medium';}
			break;
		case 7:
			return 'heavy';
		case 8:
			if (item.system.dmg_type == 'healing')
			{return 'heavy';}
			break;
		case 11:
			return 'severe';
		case 12:
			if (item.system.dmg_type == 'healing')
			{return 'severe';}
			break;
		default:
	}
	console.log(`Unknown Value for ${item.name}, ${item.system.mag_mult} magic mult`);
	return undefined;
}

addsStatus(this: Usable, statusIds: StatusEffectId) : number;
addsStatus(this: Usable, statusIds: StatusEffectId[]) : number;
addsStatus(this: Usable, statusIds: StatusEffectId | StatusEffectId[]) : number {
	const ids = Array.isArray(statusIds) ? statusIds : [statusIds];
	const statusesGranted = this.statusesAdded();
	return statusesGranted.reduce( (acc,st) => acc + (ids.includes(st)? 1: 0), 0);
}

removesStatus(this: Usable, statusIds: StatusEffectId) : number;
removesStatus<T extends StatusEffectId>(this: Usable, statusIds: readonly T[]) : number;
removesStatus(this: Usable, statusIds: StatusEffectId | readonly StatusEffectId[]) : number {
	const ids = Array.isArray(statusIds) ? statusIds : [statusIds];
	const statusesRemoved = this.statusesRemoved();
	return statusesRemoved.reduce( (acc,st) => acc + (ids.includes(st)? 1: 0), 0);
}

canInstantKill(this: Usable) : boolean {
	return this.system.instantKillChance != 'none';
}

causesAilment(this: Usable) : boolean {
	if (this.system.ailmentChance != "none") {return true;}
	return false;
	// if (this.statusesAdded().some (
	//   status => STATUS_AILMENT_SET.has(status)
	// )) {
	//   return true;
	// }
	// return false;
	// return this.hasTag("ailment");
}

removesAilment(this:Power) : boolean {
	if (this.statusesRemoved().some (
		status => STATUS_AILMENT_SET.has(status)
	)) {
		return true;
	}
	return false;
	// return this.removesStatus(STATUS_AILMENT_LIST) > 0;
}

get customCost() : boolean {
	if (!this.isPower()) {return false;}
	return this.system.customCost || this.system.damageLevel == '-';
}

get ailmentRange() : {low: number, high:number} | undefined {
	if (!this.isUsableType() || this.isSkillCard()) {return undefined;}
	if (this.system.defense == "ail") {return undefined;}
	switch (this.system.ailmentChance) {
		case 'none': return undefined;
		case 'low': return {low: 17, high: 18};
		case 'medium': return {low: 15, high: 18};
		case 'high': return {low: 11, high: 20};
		case 'always': return {low: 1, high: 20};
		default:
			this.system.ailmentChance satisfies never;
	}
}

get instantDeathRange(): {low: number, high: number} | undefined {
	if (!this.isUsableType() || this.isSkillCard()) {return undefined;}
	if (this.system.defense == "kill") {return undefined;}
	switch (this.system.instantKillChance) {
		case 'none': return undefined;
		case 'low': return {low: 19, high: 20};
		case 'medium': return {low: 17, high: 20};
		case 'high': return {low: 15, high: 20};
		case 'always': return {low: 1, high: 20};
		default:
			this.system.instantKillChance satisfies never;
	}
}

isEnchantable(this: Carryable) : boolean {
	return (this.isEquippable());
}

isDamagePower(this: Usable): boolean {
	if (!this.isTrulyUsable()) {return false;}
	if (this.isSkillCard()) {return false;}
	if (this.isPower()) {
		if (this.system.damageLevel == 'none') {return false;}
		return true;
	}
	return this.system.damage.high > 0; //for consumables
}

statusesAdded(this: Usable): StatusEffectId[] {
	const effects= this.getEffects(null).flatMap( (eff) => eff.consequences.flatMap( cons => cons.type == 'addStatus'? [cons.statusName] : []));
	return effects;
}

statusesRemoved(this: Usable): StatusEffectId[] {
	const statusesRemoved = this.getEffects(null).flatMap( (eff) => eff.consequences.flatMap( cons => cons.type == 'removeStatus'? [cons.statusName] : []));
	return statusesRemoved;
}

buffsOrDebuffsAdded(this: Usable) : number {
	const statusesGranted = this.statusesAdded();
	const buffsAndDebuffs = CONFIG.statusEffects
		.filter(st => st.tags.includes('buff') || st.tags.includes('debuff'))
		.map( x=> x.id);
	return statusesGranted.reduce( (acc, st) => buffsAndDebuffs.includes(st) ? acc + 1 : acc, 0);
}

isBuffOrDebuff(this: Usable) : boolean {
	return this.buffsOrDebuffsAdded() > 0;
}

isStatusRemoval(this: Usable) : boolean {
	const removed = this.statusesRemoved();
	return removed.length > 0;
}

static resolveItemSelector(selector: ItemSelector): U<EnchantedTreasureFormat> {
	switch (selector.selectType) {
		case "specific": {
			const item= PersonaDB.getItemById(selector.itemId);
			if (item?.isCarryableType()) {
				return {
					item,
					enchantments:[],
				};
			}
		}
			break;
		case "randomTreasure": {
			return TreasureSystem.generate(selector.treasureLevel, selector.rollModifier);
		}
		default :
			selector satisfies never;
	}
	return undefined;
}

}



/** Handlebars keeps turning my arrays inside an object into an object with numeric keys, this fixes that */
export function ArrayCorrector<T>(obj: T[] | Record<string | number, T>): T[] {
	return ConditionalEffectManager.ArrayCorrector(obj);
}


export type CClass = Subtype<PersonaItem, 'characterClass'>;
export type Power = Subtype<PersonaItem, 'power'>;
export type Weapon = Subtype<PersonaItem, 'weapon'>;
export type InvItem = Subtype<PersonaItem, 'item'>;
export type Talent = Subtype<PersonaItem, 'talent'>;
export type Focus = Subtype<PersonaItem, 'focus'>;
export type Consumable = Subtype<PersonaItem, 'consumable'>;
export type Activity = SocialCard;
export type SocialCard = Subtype<PersonaItem, 'socialCard'>;
export type SkillCard = Subtype<PersonaItem, 'skillCard'>;
export type Carryable = InvItem | Weapon | Consumable | SkillCard;
export type Tag = Subtype<PersonaItem, "tag">;

type CraftingInventoryItem= InvItem & {system: {slot: "crafting"}};
export type CraftingMaterial = CraftingInventoryItem | Consumable;

export type UniversalModifier = Subtype<PersonaItem, 'universalModifier'>;

type ItemContainers = Weapon | InvItem | Focus | Talent | Power | Consumable | UniversalModifier | SkillCard | Tag;

export type ItemModifierContainer = ItemContainers;

export type ContainerTypes = ItemContainers | PersonaAE;

export interface ModifierContainer <T extends Actor | TokenDocument | Item | ActiveEffect = ContainerTypes> {
	getEffects(sourceActor : PersonaActor | null, CETypes ?: TypedConditionalEffect['conditionalType'][]) : readonly SourcedConditionalEffect[];
	parent: T["parent"];
	name: string;
	id: string;
	displayedName: string;
	accessor : UniversalAccessor<T>,
	getModifier(bonusTypes : ModifierTarget[] | ModifierTarget, sourceActor: PersonaActor | null): ModifierListItem[];

}

export type PowerContainer = Consumable | Power | ItemModifierContainer;
export type Usable = Power | Consumable ;
export type UsableAndCard = Usable | SkillCard; 

Hooks.on('updateItem', (item :PersonaItem, _diff: DeepPartial<typeof item>) => {
	item.clearCache();
	if (item.parent instanceof PersonaActor) {
		item.parent.clearCache();
	}
});

function cacheStats() {
	const {miss, total, modifierSkip, modifierRead} = PersonaItem.cacheStats;
	const missPercent = Math.round(miss/total * 100);
	const skipPercent = Math.round(100 * modifierSkip / modifierRead);
	console.log(`Effects Cache : ${missPercent}% misses`);
	console.log(`Effects Cache : ${skipPercent}% modifierSkip Rate`);
}

//@ts-expect-error isn't defined on window
window.cacheStats = cacheStats;


Hooks.on('deleteItem', async (item: PersonaItem) => {
	if (item.parent instanceof PersonaActor && item.hasPlayerOwner && item.isOwner && !game.user.isGM) {
		await Logger.sendToChat(`${item.parent.displayedName} deletes ${item.name}(${item.amount})`, item.parent);
	}

});

export type ItemSubtype <I extends Power, X extends I['system']['subtype']> = I & SystemSubtype<X>;
type SystemSubtype<X extends string> = {system: {subytpe : X }};


type AdvancedEffectsCache = {
	allEffects: WeakMapPlus,
	passiveEffects: WeakMapPlus,
	triggeredEffects: WeakMapPlus,
	defensiveEffects: WeakMapPlus,
	onUseEffects: WeakMapPlus
}

type WeakMapPlus = {
	actors: WeakMap<PersonaActor, SourcedConditionalEffect[]>;
	nullActor: U<SourcedConditionalEffect[]>;

};

type PowerSub<T extends Power['system']['subtype']> = Power & {system: {subtype: T}}
