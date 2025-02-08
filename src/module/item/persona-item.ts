import { ValidAttackers } from "../combat/persona-combat.js";
import { EQUIPMENT_TAGS } from "../../config/equipment-tags.js";
import { Consequence } from "../../config/consequence-types.js";
import { CreatureTag } from "../../config/creature-tags.js";
import { Precondition } from "../../config/precondition-types.js";
import { CARD_TAGS } from "../../config/card-tags.js";
import { SimpleDamageCons } from "../../config/consequence-types.js";
import { Helpers } from "../utility/helpers.js";
import { PersonaAE } from "../active-effect.js";
import { PersonaCombat } from "../combat/persona-combat.js";
import { removeDuplicates } from "../utility/array-tools.js";
import { EquipmentTag } from "../../config/equipment-tags.js";
import { PowerTag } from "../../config/power-tags.js";
import { ConditionalEffectManager } from "../conditional-effect-manager.js";
import { localize } from "../persona.js";
import { POWER_TAGS } from "../../config/power-tags.js";
import { ModifierList } from "../combat/modifier-list.js";
import { testPreconditions } from "../preconditions.js";
import { CardChoice } from "../../config/social-card-config.js";
import { CardEvent } from "../../config/social-card-config.js";
import { BASIC_PC_POWER_NAMES } from "../../config/basic-powers.js";
import { BASIC_SHADOW_POWER_NAMES } from "../../config/basic-powers.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { getActiveConsequences } from "../preconditions.js";
import { PersonaError } from "../persona-error.js";
import { PersonaActor } from "../actor/persona-actor.js";
import { UniversalItemAccessor } from "../utility/db-accessor.js";
import { Situation } from "../preconditions.js";
import { SLOTTYPES } from "../../config/slot-types.js";
import { ModifierListItem } from "../combat/modifier-list.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { PowerType } from "../../config/effect-types.js";
import { PC } from "../actor/persona-actor.js";
import { Shadow } from "../actor/persona-actor.js";
import { ITEMMODELS } from "../datamodel/item-types.js";
import { PersonaDB } from "../persona-db.js";

declare global {
	type ItemSub<X extends PersonaItem["system"]["type"]> = Subtype<PersonaItem, X>;
}

export class PersonaItem extends Item<typeof ITEMMODELS, PersonaActor, PersonaAE> {

	cache: {
		effectsNull: ConditionalEffect[] | undefined;
		effectsMap: WeakMap<ValidAttackers, ConditionalEffect[]>;
		containsModifier: boolean | undefined;
		containsTagAdd: boolean | undefined;
		statsModified: Map<ModifierTarget, boolean>,
	}

	static cacheStats = {
		miss: 0,
		total: 0,
		modifierSkip: 0,
		modifierRead: 0,
	};

	constructor(...args: any[]) {
		//@ts-ignore
		super (...args)
		this.clearCache();
	}

	clearCache() {
		this.cache = {
			effectsNull: undefined,
			effectsMap: new WeakMap(),
			containsModifier: undefined,
			containsTagAdd: undefined,
			statsModified: new Map(),
		};
	}

	getClassProperty<T extends keyof CClass["system"]["leveling_table"][number]> (this: CClass,lvl: number, property:T)  : CClass["system"]["leveling_table"][number][T] {
		const adjustedLvl = Math.clamp(lvl, 0, 11);
		const data = this.system.leveling_table[adjustedLvl][property];
		if (property == "slots") return ArrayCorrector(data as any) as any;
		return data;
	}

	get accessor() : UniversalItemAccessor<typeof this> {
		return PersonaDB.getUniversalItemAccessor(this);
	}

	static getBasicPCPowers() : Power[] {
		const basic = BASIC_PC_POWER_NAMES;
		return basic.flatMap( powerName =>  {
			const power = PersonaDB.getBasicPower(powerName);
			if (!power) return [];
			return [power as Power];
		});
	}

	static getBasicShadowPowers() : Power[] {
		const basic = BASIC_SHADOW_POWER_NAMES;
		return basic.flatMap( powerName =>  {
			const power = PersonaDB.getBasicPower(powerName);
			if (!power) return [];
			return [power as Power];
		});
	}

	isUsable() : this is UsableAndCard  {
		switch (this.system.type) {
			case "power":
			case "skillCard":
			case "consumable":
				return true;
			case "characterClass":
			case "focus":
			case "talent":
			case "universalModifier":
			case "socialCard":
			case "item":
			case "weapon":
				return false;
			default:
				this.system satisfies never;
				return false;
		}
	}

	get tags() : string {
		let tags : string[] = [];
		if ("itemTags" in this.system) {
			tags = tags.concat(
				this.system.itemTags
				.map(tag => localize(EQUIPMENT_TAGS[tag]))
			);
		}
		if ("tags" in this.system) {
			tags = tags.concat(
				this.system.tags
				.map(tag => localize(POWER_TAGS[tag]))
			)
		}
		return tags.join(", ");
	}

	get cardTags() : string {
		if ("cardTags" in this.system) {
			const tags= this.system.cardTags.map(tag => localize(CARD_TAGS[tag]));
			return tags.join(", ");
		}
		return "";
	}

	async addItemTag(this: Consumable | InvItem | Weapon): Promise<void> {
		const tags = this.system.itemTags;
		tags.push("nil");
		await this.update( {"system.itemTags": tags});
	}

	async addCardTag(this: SocialCard): Promise<void> {
		const tags = this.system.cardTags;
		tags.push("");
		await this.update( {"system.cardTags": tags});
	}

	async deleteItemTag(this: Consumable | InvItem | Weapon, index: number) : Promise<void> {
		const tags = this.system.itemTags;
		tags.splice(index, 1);
		await this.update( {"system.itemTags": tags});
	}

	async deleteCardTag(this: SocialCard, index: number) : Promise<void> {
		const tags = this.system.cardTags;
		tags.splice(index, 1);
		await this.update( {"system.cardTags": tags});
	}

	hasTag(this: Usable, tag: PowerTag) : boolean;
	hasTag(this: InvItem | Weapon | SkillCard, tag: EquipmentTag): boolean;
	hasTag(this: UsableAndCard, tag: PowerTag | EquipmentTag) : boolean;
	hasTag(this: UsableAndCard | InvItem | Weapon, tag: PowerTag | EquipmentTag) : boolean;
	hasTag(this: UsableAndCard | InvItem | Weapon, tag: PowerTag | EquipmentTag) : boolean {
		let list : (PowerTag | EquipmentTag)[];
		switch (this.system.type) {
			case "power":
				list = (this as Power).tagList();
				break;
			case "consumable":
				list = (this as Consumable).tagList();
				break;
			case "item":
			case "weapon":
				list = (this as Weapon | InvItem).tagList();
				break;
			case "skillCard":
				list = (this as SkillCard).tagList();
				break;
			default:
				this.system satisfies never;
				PersonaError.softFail(`Can't check tag list for ${this.system["type"]}`);
				return false;
		}
		return list.includes(tag);
	}

	tagList(this : Power): PowerTag[];
	tagList(this : Consumable): (PowerTag | EquipmentTag)[];
	tagList(this: UsableAndCard) : PowerTag[];
	tagList(this : InvItem | Weapon): EquipmentTag[];
	tagList(this: SkillCard | Usable | InvItem | Weapon) : (PowerTag | EquipmentTag)[] {
		const itype = this.system.type;
		switch (itype) {
			case "power": {
				const list= this.system.tags.slice();
				if (!list.includes(itype))
				list.push(itype);
				return list;
			}
			case "consumable": {
				const list : (PowerTag | EquipmentTag)[]= (this.system.tags as (PowerTag | EquipmentTag)[]).concat(this.system.itemTags);
				if (!list.includes(itype))
				list.push(itype);
				return list;
			}
			case "item": {
				const list= this.system.itemTags.slice();
				const subtype = this.system.slot;
				if (subtype != "none") {
					if (!list.includes(subtype))
						list.push(subtype);
				} else {
					if (!list.includes("non-equippable"))
						list.push("non-equippable");
				}
				return list;
			}
			case "weapon": {
				const list = this.system.itemTags.slice();
				if (!list.includes(itype))
				list.push(itype);
				return list;
			}
			case "skillCard": {
				return [
					"skill-card"
				];
			}
			default:
				itype satisfies never;
				PersonaError.softFail(`Can't get tag list for ${itype}`);
				return [];
		}
	}

	get amount() : number {
		if (this.system.type != "consumable") {
			return 1;
		}
		return this.system.amount;
	}

	async addItem(this: Consumable, amt: number) : Promise<typeof this> {
		console.log("Adding 1 to amunt");
		const newAmt = this.system.amount += amt;
		await this.update({"system.amount": newAmt});
		return this;
	}

	get costString() : string {
		switch (this.system.type) {
			case "power":
				return (this as Power).powerCostString();
			case "consumable":
				return "consumable";
			default:
				return "free";
		}
	}

	isAnyItemType() : this is (InvItem | Weapon | Consumable) {
		switch (this.system.type) {
			case "consumable":
			case "item":
			case "weapon":
				return true;
			default:
				return false;
		}
	}

	powerCostString(this: Power) : string {
		if (!this.parent || this.parent.type == "pc")
			return this.powerCostString_PC();
		if (this.parent.type == "shadow")
			return this.powerCostString_Shadow();
		else return "";
	}

	grantsPowers(this: ModifierContainer): boolean {
		try{
			return this.getEffects(null).some(
				eff => eff.consequences.some(
					cons => cons.type == "add-power-to-list"
				));
		} catch (e) {
			console.log(this);
			return false;
		}
	}

	testOpenerPrereqs (this: UsableAndCard, situation: Situation, user: PersonaActor) : boolean {
		switch (this.system.type) {
			case "skillCard": return false;
			case "power": case "consumable":
				break;
			default:
				this.system satisfies never;
		}
		const conditions = ConditionalEffectManager.getConditionals(this.system.openerConditions, this,user );
		return testPreconditions(conditions, situation, this as Usable);
	}

	testTeamworkPrereqs (this: UsableAndCard, situation: Situation, user: PersonaActor) : boolean {
		switch (this.system.type) {
			case "skillCard": return false;
			case "power": case "consumable":
				break;
			default:
				this.system satisfies never;
		}
		const conditions = ConditionalEffectManager.getConditionals(this.system.teamworkConditions, this,user );
		return testPreconditions(conditions, situation, this as Usable);
	}

	getGrantedPowers(this: ModifierContainer, user: PC | Shadow, situation?: Situation): Power[] {
		return this.getAllGrantedPowers(user, situation);
		// .filter(pwr => !pwr.hasTag("opener"));
	}

	getOpenerPowers(this: ModifierContainer, user: PC | Shadow, situation?: Situation): Power[] {
		return this.getAllGrantedPowers(user, situation)
			.filter (pwr=> pwr.hasTag("opener"));
	}

	getAllGrantedPowers(this: ModifierContainer, user: PC | Shadow, situation?: Situation): Power[] {
		if (!this.grantsPowers()) return [];
		if (!situation) {
			situation = {
				user: user.accessor
			};
		}
		const powers=  this.getEffects(user)
			.filter(
				eff => eff.consequences.some(
					cons => cons.type == "add-power-to-list"
				))
			.flatMap(eff=> getActiveConsequences(eff, situation, this))
			.flatMap(x=> x.type == "add-power-to-list" ? [x.id] : [])
			.map(id=> PersonaDB.allPowers().find( x=>x.id == id))
			.flatMap( pwr=> pwr? [pwr]: []);
		return removeDuplicates(powers);
	}

	powerCostString_PC(this: Power) : string {
		switch (this.system.subtype) {

			case "weapon":
				if (this.system.hpcost)
					return `${this.system.hpcost} HP`;
				else return "free";
			case "magic":
				const mpcost = this.system.mpcost;
				return `${mpcost} MP`;
			case "social-link":
				if (this.system.inspirationCost > 0) {
					return `${this.system.inspirationCost} Inspiration`;
				}

			case "other":
			case "passive":
			case "none":
			case "standalone":
			case "defensive":
			case "downtime":
				break;
			default:
				this.system.subtype satisfies never;
		}
		return "free";
	}

	powerCostString_Shadow(this: Power) : string {
		let costs : string[] = [];
		if (this.system.energy.required > 0) {
			costs.push(`EN>=${this.system.energy.required}`);
		}
		if (this.system.energy.cost > 0) {
			costs.push(`EN-${this.system.energy.cost}`);
		}
		return costs.join(", ");
	}

	static getSlotName(num : number) {
		return game.i18n.localize(SLOTTYPES[num]);
	}

	targets(this: UsableAndCard): Power["system"]["targets"] {
		if (this.system.type == "skillCard") return "self";
		return this.system.targets;
	}

	static async createSkillCardFromPower(power: Power) : Promise<SkillCard> {
		return await PersonaItem.create( {
			name: `${power.name} card`,
			type: "skillCard",
			system: {
				skillId: power.id,
			}
		}) as SkillCard;
	}

	/** required because foundry input hates arrays*/
	async sanitizeEffectsData(this: PowerContainer) {
		if (this.system.type == "skillCard") return;
		const isArray = Array.isArray;
		let update = false;
		let effects = this.system.effects;
		try {
			if (!isArray(this.system.effects)) {
				effects = ArrayCorrector(this.system.effects);
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
			await this.update({"system.effects": effects});
		}
	}

	get displayedName() : string {
		switch (this.system.type) {
			case "skillCard": {
				const skillId = this.system.skillId;
				const power = PersonaDB.allItems().find(x=> x.id == skillId);
				if (power && power.system.type == "power") {
					return `${power.displayedName} Card`;
				}
				else return "Unlinked Skill Card";
			}
		}
		return this.name;
	}

	toModifierList(this: ModifierContainer, bonusTypes : ModifierTarget[] | ModifierTarget, sourceActor: PC | Shadow | null): ModifierList {
		const modifiers = this.getModifier(bonusTypes, sourceActor);
		return new ModifierList(modifiers);
	}

	getModifier(this: ModifierContainer, bonusTypes : ModifierTarget[] | ModifierTarget, sourceActor: ValidAttackers | null) : ModifierListItem[] {
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
				hasBonus = ConditionalEffectManager.canModifyStat(this.getEffects(sourceActor), modifier);
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
			.filter( eff => eff.consequences.some( cons => "modifiedFields" in cons || "modifiedField" in cons))
		;
		this.cache.containsModifier = filteredEffects.length > 0;
		return filteredEffects
			.map(x =>
				({
					name: this.name,
					source: PersonaDB.getUniversalItemAccessor(this),
					conditions: ArrayCorrector(x.conditions),
					modifier: ModifierList.getModifierAmount(x.consequences, bonusTypes),
					variableModifier: ModifierList.getVariableModifiers(x.consequences, bonusTypes),
				})
			);
	}

	getConferredTags(this: ModifierContainer, actor: PC | Shadow) : CreatureTag[] {
		if (this.cache.containsTagAdd === false) {
			return [];
		}
		const effects = this.getEffects(actor);
		if (!effects.some( e => e.consequences.some( cons => 
			cons.type == "add-creature-tag"))) {
			this.cache.containsTagAdd = false;
			return [];
		}
		const situation = {
			user: actor.accessor,
		};
		const cons : (Consequence & {type : "add-creature-tag"})[] = ConditionalEffectManager.getAllActiveConsequences(effects, situation, this)
			.filter( c=> c.type == "add-creature-tag") as any ;
		return cons.map( c => c.creatureTag);
	}

	getDamage(this:ModifierContainer , user: ValidAttackers, type: "high" | "low", situation: Situation = {user: user.accessor , usedPower: (this as Usable).accessor, hit: true,  attacker: user.accessor}, typeOverride : SimpleDamageCons["damageType"] = "none") : number {
		//TODO: handle type override check to see if power damage is by-power or has other type
		if (!("dmg_type" in this.system)) return 0;
		if (!typeOverride || typeOverride == "by-power") {
			if (this.system.dmg_type == "none") return 0;
		}
		const subtype : PowerType  = this.system.type == "power" ? this.system.subtype : "standalone";
		switch(subtype) {
			case "weapon" : {
				const dmg = user.wpnDamage();
				const bonus = user.getBonuses("wpnMult");
				const mult = user.wpnMult() + (this.system.melee_extra_mult ?? 0) + bonus.total(situation);
				const bonusDamage = user.getBonusWpnDamage();
				const dmgamt =  {
					low: dmg.low * mult + bonusDamage.low.total(situation),
					high: dmg.high * mult + bonusDamage.high.total(situation),
				}[type];
				return dmgamt;
			}
			case "magic": {
				const dmg = user.magDmg();
				const mult = this.system.mag_mult;
				const high_bonus = user.getBonuses("magHigh").total(situation);
				const low_bonus = user.getBonuses("magLow").total(situation);
				const baseLow =  (dmg.low + low_bonus)  * mult;
				const baseHigh =  (dmg.high + high_bonus) * mult;
				const finalBonus =  user.getBonuses("magDmg").total(situation);
				const modified = {
					low: baseLow + (baseLow > 0 ? finalBonus: 0),
					high: baseHigh + (baseHigh > 0 ? finalBonus: 0),
				};
				return modified[type];
			}
			case "standalone": {
				const dmg = this.system.damage;
				return dmg[type];
			}
			default:
				return 0;
		}
	}

	/** used for damage calculation estaimate for char sheet*/
	getDamageMultSimple(this: ModifierContainer, user: ValidAttackers, situation: Situation = {user: user.accessor , usedPower: (this as Usable).accessor, hit: true, attacker: user.accessor} ) {
		const mainMods = user.getEffects();

		const multCons = this.getEffects(user)
			.concat(mainMods)
			.map ( eff => getActiveConsequences(eff,situation, this))
			.flat()
			.filter( x=> x.type == "dmg-mult" || ( x.type == "damage-new" && x.damageSubtype == "multiplier"));
		return multCons.reduce( (acc, cons) =>
			acc * ("amount" in cons ? cons.amount ?? 1: 1)
			,1);
	}

	critBoost(this: Usable, user: ValidAttackers) : ModifierList {
		const x = this.getModifier("criticalBoost", user);
		let list = new ModifierList(x);
		list = list.concat(user.critBoost());
		list.add("Power Modifier", this.system.crit_boost ?? 0);
		return list;
	}

	canBeReflectedByPhyiscalShield(this: UsableAndCard): boolean {
		if (this.system.type == "skillCard") return false;
		return this.system.dmg_type == "physical";
	}

	canBeReflectedByMagicShield(this: UsableAndCard) : boolean {
		if (this.system.type == "skillCard") return false;
		switch (this.system.dmg_type) {
			case "fire":
			case "wind":
			case "light":
			case "dark":
			case "cold":
			case "lightning":
				return true;
			case "none":
			case "healing":
			case "physical":
			case "untyped":
			case "all-out":
				break;
			default:
				this.system.dmg_type satisfies never;
		}
		return false;

	}
	isOpener(this: UsableAndCard) : boolean {
		return this.hasTag("opener");
	}

	isPassive(this: UsableAndCard) : boolean {
		if (this.system.type == "skillCard") {return false;}
		const item = this as Usable;
		return item.system.subtype == "passive" ||
			item.hasTag("passive");;
	}

	isTeamwork(this: UsableAndCard): boolean {
		return this.hasTag("teamwork");
	}

	isNavigator(this: UsableAndCard): boolean {
		return this.hasTag("navigator");
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
			case "1-engaged":
			case "1-nearby":
			case "1d4-random":
			case "1d4-random-rep":
			case "1d3-random":
			case "1d3-random-rep":
				if (!target.isAlive()) return false;
				break;
			case "1-nearby-dead":
				if (target.isAlive()) return false;
				break;
			case "self":
				if (user != target) return false;
				break;
			case "1-random-enemy":
			case "all-enemies":
				if (PersonaCombat.isSameTeam(user, target)) return false;
				if (!target.isAlive()) return false;
				break;
			case "all-allies":
				if (!PersonaCombat.isSameTeam(user, target)) return false;
				if (!target.isAlive()) return false;
			case "all-dead-allies":
				if (!PersonaCombat.isSameTeam(user, target)) return false;
				if (target.isAlive()) return false;
			case "all-others":
				if (user == target) return false;
				if (target.isAlive()) return false;
				break;
			case "everyone":
				break;
			default:
				this.system.targets satisfies never;
		}
		if (this.isOpener()) {
			const conditions = this.system.openerConditions;
			if (!testPreconditions(conditions, situation, this)) return false;
		}
		return testPreconditions(this.system.validTargetConditions, situation, this);
	}

	isBasicPower(this: Usable) : boolean {
		if (this.system.type == "consumable") {return false;}
		const basics = [
			...PersonaItem.getBasicPCPowers(),
			...PersonaItem.getBasicShadowPowers(),
		];
		return basics.includes(this as Power);
	}

	baseCritSlotBonus(this: Usable) : number {
		if (this.system.type == "consumable") {return 0;}
		if (this.hasTag("basicatk")) return 0;
		if (this.isBasicPower()) return 0;
		switch (this.system.slot) {
			case 0:
				return 5;
			case 1:
				return 7;
			case 2:
				return 9;
			case 3:
				return 11;
			default:
				PersonaError.softFail(`Unknwon Slot Type :${this.system.slot}`);
				return 0;
		}
	}

	mpCost(this: Usable, user: ValidAttackers) {
		if (this.system.type == "consumable") return 0;
		const sit : Situation = {
			user: user.accessor,
			usedPower: this.accessor,
		}
		let list = user.getBonuses("mpCostMult");
		const bonuses = this.getModifier("mpCostMult", user);
		list = list.concat(new ModifierList(bonuses));
		const mult = 1 + list.total(sit);
		return Math.round(this.system.mpcost * mult);
	}

	getSourcedEffects(this: ModifierContainer, sourceActor: ValidAttackers): {source: ModifierContainer, effects: ConditionalEffect[]} {
		return {
			source: this,
			effects: this.getEffects(sourceActor)
		};
	}

	generateSkillCardTeach(this: SkillCard): ConditionalEffect {
		if (!this.system.skillId) {
			return {
				conditions: [],
				consequences: []
			};
		}
		const cardEffect: ConditionalEffect = {
			conditions: [
				{type: "always"}
			],
			consequences: [{
				type: "teach-power",
				id: this.system.skillId,
			}]
		};
		return cardEffect;
	}

	getEffects(this: ModifierContainer, sourceActor : ValidAttackers | null): ConditionalEffect[] {
		if (this.system.type == "skillCard") {
			return [
				(this as SkillCard).generateSkillCardTeach()
			];
		}
		PersonaItem.cacheStats.total++;
		if (sourceActor == null) {
			if (!this.cache.effectsNull) {
				PersonaItem.cacheStats.miss++;
				this.cache.effectsNull = ConditionalEffectManager.getEffects(this.system.effects, this, sourceActor);
			}
			return this.cache.effectsNull;
		} else {
			const data = this.cache.effectsMap.get(sourceActor);
			if (data) return data;
			PersonaItem.cacheStats.miss++;
			const newData=  ConditionalEffectManager.getEffects(this.system.effects, this, sourceActor);
			this.cache.effectsMap.set(sourceActor, newData);
			return newData;
		}
	}

	requiredLinkLevel(this: Focus) : number  {
		let requirement = 0;
		for (const eff of this.getEffects( null)) {
			for (const cond of eff.conditions) {
				if (
					cond.type != "numeric"
					|| cond.comparisonTarget != "social-link-level"
				) {
					continue;
				}
				if (
					cond.socialLinkIdOrTarot == "SLSource"
					|| cond.socialLinkIdOrTarot == this.parent?.id
					|| cond.socialLinkIdOrTarot == this.parent?.name
					|| cond.socialLinkIdOrTarot == this.parent?.tarot?.name
				) {
					return "num" in cond ? cond.num ?? 0 : 0;
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
		if (this.system.weeklyAvailability.disabled) return false;
		if(!testPreconditions(this.system.conditions,sit, null)) return false;
		return this.system.weeklyAvailability.available;
	}

	announce(this: SocialCard, pc: PC): boolean {
		if (!this.system.announceWhenAvailable) {
			return false;
		}
		return this.isAvailable(pc);
	}

	async setAvailability(this: SocialCard, bool: boolean) {
		await	this.update( {"system.weeklyAvailability.available": bool});
	}

	async addCardEvent(this: SocialCard) {


		const newEv : SocialCard["system"]["events"][number] = {
			sound: "",
			text: "",
			img: "",
			volume: 1.0,
			placement: {
				starter: true,
				middle: true,
				finale: true,
				special: false,
			},
			label: "",
			name: "Unnamed Event",
			frequency: 1,
			choices: [],
			conditions: [],
		};
		this.system.events.push( newEv);
		this.update({"system.events": this.system.events});
	}

	async deleteCardEvent(this: SocialCard, eventIndex: number) {
		this.system.events.splice(eventIndex, 1);
		this.update({"system.events": this.system.events});
	}

	async addEventChoice(this: SocialCard, eventIndex: number) {
		const event = this.system.events[eventIndex];
		const arr = ArrayCorrector(event.choices);
		const newChoice: CardChoice = {
			name: "Unnamed Choice",
			conditions: [],
			text: "",
			postEffects: {effects:[]},
			roll: {rollType: "none"},
		};
		arr.push( newChoice);
		event.choices = arr;
		await this.update({"system.events": Helpers.expandObject(this.system.events)});
	}

	async deleteEventChoice(this: SocialCard, eventIndex: number, choiceIndex: number) {
		const event = this.system.events[eventIndex];
		const arr = ArrayCorrector(event.choices);
		arr.splice(choiceIndex, 1);
		event.choices = arr;
		await this.update({"system.events": Helpers.expandObject(this.system.events)});
	}


	get perk() : string {
		switch (this.system.type) {
			case "socialCard":
				return this.system.perk;
			default:
				return "";
		}
	}

	async createNewTokenSpend(this: Activity | SocialCard) {
		const list = this.system.tokenSpends;
		const newItem : typeof list[number] = {
			conditions: [],
			amount: 1,
			text: "",
			consequences: []
		};
		list.push(newItem);
		await this.update({"system.tokenSpends":list});
	}

	async deleteTokenSpend(this: Activity | SocialCard, deleteIndex:number) {
		const list = this.system.tokenSpends;
		list.splice(deleteIndex,1);
		await this.update({"system.tokenSpends":list});
	}

	async priceFix() {
		//updates money to new x10 total
		switch (this.system.type) {
			case "item":
			case "consumable":
				const price = this.system.price * 10;
				await this.update({"system.price": price});
			default:
				return;
		}
	}

	isMultiTarget(this: UsableAndCard) : boolean {
		if (this.system.type == "skillCard") return false;
		switch (this.system.targets) {
			case "1-nearby-dead":
			case "1-nearby":
			case "1-engaged":
			case "1-random-enemy":
			case "self":
				return false;
			case "1d4-random":
			case "1d4-random-rep":
			case "1d3-random":
			case "1d3-random-rep":
			case "all-enemies":
			case "all-allies":
			case "all-dead-allies":
			case "all-others":
			case "everyone":
				return true;
			default:
				this.system.targets satisfies never;
				PersonaError.softFail(`Unknown target type: ${this.system.targets}`);
				return false;
		}
	}

	isAoE(this: UsableAndCard) : boolean {
		if (this.system.type == "skillCard") return false;
		switch (this.system.targets) {
			case "1-nearby-dead":
			case "1-nearby":
			case "1-engaged":
			case "self":
			case "1d4-random":
			case "1d4-random-rep":
			case "1d3-random":
			case "1d3-random-rep":
			case "1-random-enemy":
				return false;
			case "all-enemies":
			case "all-allies":
			case "all-dead-allies":
			case "all-others":
			case "everyone":
				return true;
			default:
				this.system.targets satisfies never;
				PersonaError.softFail(`Unknown target type: ${this.system.targets}`);
				return false;
		}
	}

	/** used for determining shadows usage limits
	 */
	powerEffectLevel(this: Power) : number {
		const base = this.system.slot * 3;
		const tags = this.system.tags;
		let mod = 0;
		if (tags.includes("healing")) {
			mod += 1;
		}
		// const multiMod = this.isMultiTarget() ? 1 : 0;
		const dmgtype = this.system.dmg_type;
		if (dmgtype == "dark" || dmgtype == "light")
			mod+= 1;
		if (this.isAoE()) {
			mod += 2;
		}
		return base + mod;
	}

	targetMeetsConditions(this: UsableAndCard, user: ValidAttackers, target: ValidAttackers, situation?: Situation) : boolean {
		if (this.system.type == "skillCard") return target.canLearnNewSkill();
		const usable = this as Usable;
		if (!usable.system.validTargetConditions) return true;
		const conditions  = ConditionalEffectManager.getConditionals(this.system.validTargetConditions, this, user);
		if (!situation) {
			situation = {
				attacker : user.accessor,
				user: user.accessor,
				target: target.accessor,
				usedPower: usable.accessor,
			};
		}
		return testPreconditions(conditions, situation, usable);
	}

	cardConditionsToSelect( this: SocialCard) : SocialCard["system"]["conditions"] {
		const extraConditionsFromTags = this.extraConditionsFromTags();
		if (extraConditionsFromTags.length == 0) {
			return this.system.conditions;
		}
		return this.system.conditions.concat(extraConditionsFromTags);
	}

	isInstantDeathAttack(this: Usable) : boolean {
		switch (this.system.dmg_type) {
			case "dark":
			case "light": return true;
			default: break; 
		}
		return this.hasTag("instantKill");

	}

	extraConditionsFromTags( this: SocialCard) : SocialCard["system"]["conditions"] {
		const SLCheck = function (low:number, high:number) : Precondition {
			const SLcheck: Precondition = {
				type: "numeric",
				comparator: "range",
				comparisonTarget: "social-link-level",
				num: low,
				high: high,
				socialLinkIdOrTarot: "target",
			};
			return SLcheck;
		};
		return this.system.cardTags.flatMap( tag => {
			switch (tag) {
				case "date":
				case "friends":
					const isDating : Precondition = {
						type: "boolean",
						boolComparisonTarget: "social-availability",
						booleanState: tag == "date",
						conditionTarget: "user",
						socialTypeCheck: "is-dating",
						socialLinkIdOrTarot: "target",
					};
					return [ isDating ]
				case "student-stuff": {
					const isStudent: Precondition = {
						type: "boolean",
						boolComparisonTarget: "has-creature-tag",
						booleanState: true,
						conditionTarget: "target",
						creatureTag: "student",
					};
					return [isStudent];
				}
				case "middle-range":
					return [SLCheck(3,8)];
				case "trusted":
					return [SLCheck(7,10)];
				case "introductory":
					return [SLCheck(1,3)];
				case "":
					return [];
				case "disabled":
					const neverHappen: Precondition = {
						type: "never",
					};
					return [neverHappen];
				default:
					tag satisfies never;
					break;
			}
			return [];
		});
	}
}


/** Handlebars keeps turning my arrays inside an object into an object with numeric keys, this fixes that */
export function ArrayCorrector<T extends any>(obj: (T[] | Record<string | number, T>)): T[] {
	return ConditionalEffectManager.ArrayCorrector(obj);
}

export type CClass = Subtype<PersonaItem, "characterClass">;
export type Power = Subtype<PersonaItem, "power">;
export type Weapon = Subtype<PersonaItem, "weapon">;
export type InvItem = Subtype<PersonaItem, "item">;
export type Talent = Subtype<PersonaItem, "talent">;
export type Focus = Subtype<PersonaItem, "focus">;
export type Consumable = Subtype<PersonaItem, "consumable">;
export type Activity = SocialCard;
export type SocialCard = Subtype<PersonaItem, "socialCard">;
export type SkillCard = Subtype<PersonaItem, "skillCard">;

export type UniversalModifier = Subtype<PersonaItem, "universalModifier">;

export type ModifierContainer = Weapon | InvItem | Focus | Talent | Power | Consumable | UniversalModifier | SkillCard;

export type PowerContainer = Consumable | Power | ModifierContainer;
export type Usable = Power | Consumable ;
export type UsableAndCard = Usable | SkillCard; 

Hooks.on("updateItem", (item :PersonaItem) => {
	item.clearCache();
});

function cacheStats() {
	const {miss, total, modifierSkip, modifierRead} = PersonaItem.cacheStats;
	const missPercent = Math.round(miss/total * 100);
	const skipPercent = Math.round(100 * modifierSkip / modifierRead);
	console.log(`Effects Cache : ${missPercent}% misses`);
	console.log(`Effects Cache : ${skipPercent}% modifierSkip Rate`);
}

//@ts-ignore
window.cacheStats = cacheStats;
