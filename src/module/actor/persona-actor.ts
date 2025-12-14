import { ActorConverters } from "../converters/actorConverters.js";
import { LevelUpCalculator } from "../../config/level-up-calculator.js";
import { PersonaSettings } from "../../config/persona-settings.js";
import { ENCOUNTER_RATE_PROBABILITY } from "../../config/probability.js";
import { PersonaSFX } from "../combat/persona-sfx.js";
import { PERMA_BUFFS } from "../../config/perma-buff-type.js";
import { PermaBuffType } from "../../config/perma-buff-type.js";
import { Trigger } from "../../config/triggers.js";
import { PersonaRoller } from "../persona-roll.js";
import { RollSituation } from "../../config/situation.js";
import { randomSelect } from "../utility/array-tools.js";
import { Persona } from "../persona-class.js";
import { SHADOW_CREATURE_TYPE, SHADOW_ROLE } from "../../config/shadow-types.js";
import { PowerTag } from "../../config/power-tags.js";
import { POWER_TAGS_LIST } from "../../config/power-tags.js";
import { fatigueLevelToStatus } from "../../config/status-effects.js";
import { statusToFatigueLevel } from "../../config/status-effects.js";
import { FatigueStatusId } from "../../config/status-effects.js";
import { statusMap } from "../../config/status-effects.js";
import { PersonaScene } from "../persona-scene.js";
import { TriggeredEffect } from "../triggered-effect.js";
import { RealDamageType } from "../../config/damage-types.js";
import { Carryable, CraftingMaterial, SkillCard, SocialCard, Tag } from "../item/persona-item.js";
import { ValidSocialTarget } from "../social/persona-social.js";
import { ValidAttackers } from "../combat/persona-combat.js";
import { FlagData } from "../../config/actor-parts.js";
import { TarotCard } from "../../config/tarot.js";
import { removeDuplicates } from "../utility/array-tools.js";
import { testPreconditions } from "../preconditions.js";
import { CreatureTag, InternalCreatureTag } from "../../config/creature-tags.js";
import { PersonaSocial } from "../social/persona-social.js";
import { TAROT_DECK } from "../../config/tarot.js";
import { localize } from "../persona.js";
import { STATUS_EFFECT_LIST } from "../../config/status-effects.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../../config/status-effects.js";
import { Activity } from "../item/persona-item.js";
import { PersonaCombat } from "../combat/persona-combat.js";
import { PersonaActorSheetBase } from "./sheets/actor-sheet.base.js";
import { Logger } from "../utility/logger.js";
import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { Consumable } from "../item/persona-item.js";
import { SocialStat } from "../../config/student-skills.js";
import { PersonaError } from "../persona-error.js";
import { PersonaSounds } from "../persona-sounds.js";
import { Usable } from "../item/persona-item.js";
import { CClass } from "../item/persona-item.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { DAMAGETYPESLIST } from "../../config/damage-types.js";
import { SetFlagEffect, StatusEffect } from "../../config/consequence-types.js";
import { ModifierList } from "../combat/modifier-list.js";
import { Focus } from "../item/persona-item.js";
import { ModifierContainer } from "../item/persona-item.js";
import { InvItem } from "../item/persona-item.js";
import { Weapon } from "../item/persona-item.js";
import { Power } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";
import { ACTORMODELS } from "../datamodel/actor-types.js";
import { PersonaItem } from "../item/persona-item.js";
import { PersonaAE } from "../active-effect.js";
import { StatusDuration } from "../active-effect.js";
import {Calculation} from "../utility/calculation.js";
import {ConditionalEffectManager} from "../conditional-effect-manager.js";
import {Defense} from "../../config/defense-types.js";
import {EnhancedActorDirectory} from "../enhanced-directory/enhanced-directory.js";
import {FusionCombination, FusionTable} from "../../config/fusion-table.js";
import {EnchantedTreasureFormat} from "../exploration/treasure-system.js";

const BASE_PERSONA_SIDEBOARD = 5 as const;

export class PersonaActor extends Actor<typeof ACTORMODELS, PersonaItem, PersonaAE> {
	declare statuses: Set<StatusEffectId>;
	declare sheet: PersonaActorSheetBase;

	_antiloop : boolean = false;
	_trackerAntiLoop : boolean = false;

	static MPMap = new Map<number, number>;

	cache: {
		startingLevel: U<number>,
		level: U<number>,
		tarot: Tarot | undefined;
		complementRating: Map<Shadow["id"], number>;
		// triggers: U<ModifierContainer[]>;
		socialData: U<readonly SocialLinkData[]>;
		isDMon: U<boolean>;
	};

	constructor(...arr: unknown[]) {
		super(...arr);
		this.clearCache();
	}

	clearCache() {
		this.cache = {
			startingLevel: undefined,
			level: undefined,
			tarot: undefined,
			complementRating: new Map(),
			socialData: undefined,
			// triggers: undefined,
			isDMon: undefined,
		};
	}

	get mp() : number {
		switch (this.system.type) {
			case "npcAlly":
			case "pc": break;
			case "shadow":
			case "npc":
			case "tarot":
				return 0;
			default:
				this.system satisfies never;
				return 0;
		}
		return this.system.combat.mp.value;
	}

	isNPC(): this is NPC {
		return this.system.type == "npc";
	}

	isSocialLink(): this is SocialLink {
		if (!this.isNPC() && !this.isPC()) {
			return false;
		}
		if (this.tarot == undefined) {return false;}
		return true;
	}

	isPC(): this is PC {
		return this.system.type == "pc";
	}

	isNPCAlly(): this is NPCAlly {
		return this.system.type == "npcAlly";
	}

	isShadow(): this is Shadow {
		return this.system.type == "shadow";
	}

	isTarot(): this is Tarot {
		return this.system.type == "tarot";
	}

	isRealPC(): this is PC & {tarot : Tarot} {
		return this.system.type == "pc" && this.hasPlayerOwner && this.tarot != undefined;
	}

	async setAsNavigator(this: NPCAlly) {
		for (const ally of PersonaDB.NPCAllies()) {
			if (ally == this) {continue;}
			if (!ally.system.combat.isNavigator) {continue;}
			if (!ally.isOwner) {
				PersonaError.softFail(`Can't change navigator status on ${ally.name}, no ownership`);
				continue;
			}
			await ally.update({ "system.combat.isNavigator": false});
		}
		PersonaDB.clearCache();
		if (PersonaDB.getNavigator() != this) {
			PersonaError.softFail("Navigator was set improperly");
			return;
		}
		await Logger.sendToChat(`${this.name} set to party navigator`, this);
	}

	get level() : number {
		if (this.cache.level != undefined) {
			return this.cache.level;
		}
		if (!this.isValidCombatant()) {return this.cache.level = 0;}
		if (this.isPC()) {
			return this.cache.level = this.system.personaleLevel;
		}
		return this.cache.level = this.system.combat.personaStats.pLevel ?? 0;
	}

	get personalLevel(): number {
		if (!this.isPC()) {return 0;}
		return this.system.personaleLevel;
	}

	mmpCalculation(this: ValidAttackers) {
		if (this.isShadow()) {return new Calculation().eval();}
		try {
			const lvlmaxMP = this.class.getClassMMP(this.level);
			const x = new Calculation(lvlmaxMP);
			const persona = this.persona();
			const sit ={user: PersonaDB.getUniversalActorAccessor(this as PC)};
			const mpAdjustPercent = this.#mpAdjustPercent();
			const mpAdjust = this.system.mp_adjust;
			const bonuses = persona.getBonuses("maxmp");
			const maxMult = persona.getBonuses("maxmpMult");
			const nonMultMPBonus = this.system.combat.bonusMP ?? 0;
			x.add(0, mpAdjustPercent, `MP adjust (${mpAdjust})`, "multiply");
			x.add(0, bonuses, "additive bonuses", "add");
			x.add(0, maxMult, "Multiplier Bonuses" ,"noStackMultiply");
			x.add(0, nonMultMPBonus, "Permanent Bonus MP", "add");
			return x.eval(sit);

		} catch {
			return new Calculation().eval();
		}

	}

	get mmp() : number {
		if (!this.isValidCombatant()) {return 0;}
		switch (this.system.type) {
			case "npcAlly": case "pc":
				break;
			case "shadow":
				return 0;
			default:
				this.system satisfies never;
				return 0;
		}
		const val = Math.round(this.mmpCalculation().total);
		void (this as PC | NPCAlly).refreshMaxMP(val);
		return val;
	}


	static calcMP (level: number) : number {
		const mapVal = this.MPMap.get(level);
		if (mapVal != undefined) {
			return mapVal;
		}
		if (level <= 1) {return 50;}
		const prevMP = this.calcMP(level -1);
		const MP = prevMP + (prevMP * (0.33 - ((level - 2) * .02)));
		this.MPMap.set(level, MP);
		return MP;
	}

	async refreshMaxMP(this: PC | NPCAlly, amt = this.mmp) {
		if (amt == this.system.combat.mp.max) {return;}
		await this.update( { "system.combat.mp.max": amt});
	}


	async refreshTrackers(this: ValidAttackers) {
		if (this.isNPCAlly() || this.isRealPC()) {
			await this.#refreshMPTracker();
		}
		await this.#refreshHpTracker();
	}

	async #refreshMPTracker(this:PC | NPCAlly) : Promise<void> {
		await this.refreshMaxMP();
	}

	async #refreshHpTracker(this:ValidAttackers)  : Promise<void> {
		if (!game.user.isGM) {return;}
		if (this._trackerAntiLoop) {return;}
		this._trackerAntiLoop = true;
		const mhp = this.mhp;
		if (this.hp > mhp) {
			await this.update({"system.combat.hp": mhp});
		}
		if (this.system.combat.hpTracker.value != this.hp
			|| this.system.combat.hpTracker.max != mhp) {
			this.system.combat.hpTracker.max = mhp;
			this.system.combat.hpTracker.value = this.hp;
			await this.update(
				{
					"system.combat.hpTracker.value" : this.hp,
					"system.combat.hpTracker.max": mhp
				});
			if (PersonaSettings.debugMode()) {
				console.log(`Tracker Value: ${this.system.combat.hpTracker.max}`);
			}
		}
		this._trackerAntiLoop = false;
	}

	async createNewItem() {
		return (await this.createEmbeddedDocuments("Item", [{"name": "Unnamed Item", type: "item"}]))[0];
	}

	async addItem(newItem: Carryable, amount= 1) {
		if (newItem.isStackable) {
			const existing = this.items.find( item=> item.isStackableWith(newItem)) as Carryable;
			if (existing) {
				const newAmount = existing.system.amount + amount;
				await existing.update( {
					"system.amount": newAmount,
				});
				void Logger.sendToChat(`${this.name} gained ${amount} ${existing.name} (total: ${newAmount})`);
				return existing;
			}
		}
		const baseData = newItem.toJSON() as typeof newItem;
		baseData.system.amount = amount;
		const itemData = {
			...baseData
		};
		const item = (await this.createEmbeddedDocuments("Item", [itemData]))[0];
		void Logger.sendToChat(`${this.name} gained ${amount} ${item.name}`);
		return item;
	}

	async addTreasureItem( treasure: EnchantedTreasureFormat) {
		const baseItem = treasure.item;
		const tags = baseItem.system.itemTags;
		if (treasure.enchantments.length == 0) {
			return await this.addItem(baseItem);
		}
		const tagIds =
			[
				...tags,
				...treasure.enchantments.map( x=> x.id),
			];
		const tagsString = treasure.enchantments
			.map( x=>x.name )
			.join(", ");
		const name =`${baseItem.name} (${tagsString})`;
		const baseData = baseItem.toJSON() as typeof baseItem;
		baseData.system.amount = 1;
		baseData.system.itemTags = tagIds;
		const itemData = {
			...baseData,
			name,
		};
		const item = (await this.createEmbeddedDocuments("Item", [itemData]))[0];
		void Logger.sendToChat(`${this.name} gained ${item.name}`);
		return item;
	}

	get inventory() : (Consumable | InvItem | Weapon | SkillCard)[] {
		return this.items.filter( x=> x.system.type == "item" || x.system.type == "weapon" || x.system.type == "consumable" || x.system.type == "skillCard") as (Consumable | InvItem | Weapon)[];
	}

	get consumables(): Consumable[] {
		const consumables =  this.items.filter( x=> x.system.type == "consumable" || x.system.type == "skillCard") as Consumable[];
		return consumables.sort(
			(a,b) => {
				if (!a.isCraftingItem && b.isCraftingItem ) {return -1;}
				if (!b.isCraftingItem && a.isCraftingItem ) {return 1;}
				return a.name.localeCompare(b.name);
			}
		);
	}

	get trueConsumables(): Consumable[] {
		const items = this.consumables.filter( x=> !x.isCraftingMaterial() && !x.isSkillCard());
		return items.sort((a,b) => PersonaItem.sortInventoryItems(a,b));
	}

	get equippables(): (InvItem | Weapon)[] {
		const items=	this.items.filter( item => item.isEquippable() ) as (InvItem | Weapon)[];
		return items.sort((a,b) => PersonaItem.sortInventoryItems(a,b));
	}

	get skillCards(): SkillCard[] {
		const items= this.items
			.filter( item => item.isSkillCard()) as SkillCard[];
		return items.sort((a,b) => PersonaItem.sortInventoryItems(a,b));
	}

	get keyItems(): Carryable[] {
		const items= this.items
			.filter( item => item.isKeyItem()
				|| (item.system.type == "item"
					&& item.system.slot == "none")
			) as Carryable[];
		return items.sort((a,b) => PersonaItem.sortInventoryItems(a,b));
	}

	get craftingMaterials() : CraftingMaterial[] {
		const items= this.items
			.filter( item => item.isCraftingMaterial()) as CraftingMaterial[];
		return items.sort((a,b) => PersonaItem.sortInventoryItems(a,b));
	}

	hasTag(this: ValidAttackers ,tag : CreatureTag  ): boolean {
		return this.tagListPartial.some( (t : string | Tag) => t instanceof PersonaItem ? t.system.linkedInternalTag == tag : tag == t);
	}

	get nonUsableInventory() : (SkillCard | InvItem | Weapon)[] {
		const inventory = this.items.filter( i=> i.system.type == "item" || i.system.type == "weapon" || i.system.type == "skillCard") as (InvItem | Weapon)[];
		return inventory.sort( (a,b) =>  {
			const typesort = a.system.type.localeCompare(b.system.type);
			if (typesort != 0) {return typesort;}
			if (a.system.type == "item" && b.system.type == "item") {
				const slotSort = a.system.slot.localeCompare(b.system.slot);
				if (slotSort != 0) {return slotSort;}
			}
			return a.name.localeCompare(b.name);
		});
	}

	get displayedName() : string {
		switch (this.system.type) {
			case "tarot":
				return game.i18n.localize(TAROT_DECK[this.name as keyof typeof TAROT_DECK] ?? "-");
			case "npcAlly":
			case "shadow": {
				if (this.isShadow() && this.isCustomPersona()) {return this.name;}
				const combat = game.combat as PersonaCombat | undefined;
				if (!combat) {return this.name;}
				const token = combat.getCombatantByActor(this as ValidAttackers)?.token;
				if (!token) {return this.prototypeToken.name;}
				return token.name;
			}
			default:
				return this.name;
		}
	}

	get directoryName() : string {
		if (this.isPC() || this.isNPCAlly() || this.isTarot()) {
			return this.displayedName;
		}
		if (this.isShadow()) {
			const subtype = this.system.creatureType;
			const subtypeloc  = localize(SHADOW_CREATURE_TYPE[subtype]);
			if (this.basePersona.isPersona()) {
				return `${this.name} (L ${this.level}, ${subtypeloc})`;
			}
			if (game.user.isGM || this.isOwner) {
				const roles = this.roleString.toString();
				return `${this.name} (${this.level}, ${roles})`;
			}
			if (this.basePersona.scanLevelRaw > 0) {
				return `${this.displayedName} (L ${this.level})`;
			}
			return this.prototypeToken.name;
		}
		return this.name;
	}

	get displayedNameHTML() : SafeString {
		return new Handlebars.SafeString(this.displayedName);
	}

	get publicName() : string {
		if (this.isShadow() && this.isCustomPersona()) {return this.displayedName;}
		return this.prototypeToken.name;
	}

	get init() : number {
		const combat = game.combat as Combat<PersonaActor>;
		if (!combat) {
			throw new PersonaError("Can't get initiative when not in combat!");
		}
		if (combat.combatants.contents.some( x=> x.actor && x.actor.isShadow())) {
			return this.combatInit;
		}
		return this.socialInit;
	}

	get socialInit(): number {
		if (!this.isPC()) {return -999;}
		const courage= this.getSocialStat("courage").total({user:this.accessor});
		const diligence = this.getSocialStat("diligence").total({user:this.accessor});
		return courage + diligence;
	}

	/** gets the real NPC of an NPC Ally*/
	getNPCProxyActor(this: NPCAlly) : NPC | PC | undefined {
		const proxyId = this.system.NPCSocialProxyId;
		if (!proxyId)
		{return undefined;}
		const npc = PersonaDB.socialLinks()
			.find( x=> x.id == proxyId);
		if (!npc || npc.system.type != "npc" && npc.system.type != "pc") {
			PersonaError.softFail(`Can't find Proxy actor for: ${this.name}`);
		}
		return npc as NPC | PC;
	}

	isUsingBasePersona(this: ValidAttackers) : boolean {
		if ("activePersona" in this.system) {
			const active = this.system.activePersona;
			return !active  || active == this.id;
		}
		return true;
	}

	async switchPersona(this: ValidAttackers, sourceId: ValidAttackers["id"]) {
		const persona = this.personaList.find( x=> x.source.id == sourceId);
		if (!persona || !persona.source.isOwner) {
			PersonaError.softFail(`Couldn't find Persona ${sourceId} in your persona List or you aren't its owner`);
			return;
		}
		await this.update({"system.activePersona": sourceId});
		const combat = game.combat as PersonaCombat;
		if (!combat || combat.isSocial) {
			if (this.isPC()) {
				await Logger.sendToChat(`${this.name} activates Persona ${persona.publicName}`);
				return;
			} else {
				ui.notifications.notify(`${this.name} switches Persona to ${persona.publicName}`);
				return;
			}
		} else {
			// await Logger.sendToChat(`${this.name} switches to Persona ${persona.publicName}`);
			let msg = "";
			if (sourceId == this.id) {
				msg = `<div class="persona-switch">
					${this.publicName} Changes to base Persona </div>`;
			} else {
				msg = `<div class="persona-switch">
					${this.publicName} changes Persona!
					</div>
					<img class="persona-img" src="${persona.img}" title="${persona.publicName}">
					`;
			}
			const messageData: MessageData = {
				speaker: {alias: `${this.publicName}`},
				content: msg,
				style: CONST.CHAT_MESSAGE_STYLES.OTHER,
			};
			await ChatMessage.create(messageData, {});
		}
	}

	get basePersona() : Persona<ValidAttackers> {
		if (this.isNPC()) {
			const proxy = this.getNPCAllyProxy();
			if (!proxy) {
				throw new PersonaError("Can't call basePersona getter on non combatant");
			}
			return proxy.basePersona;
		}
		if (!this.isValidCombatant() && !this.isPC()) {
			throw new PersonaError("Can't call basePersona getter on non combatant");
		}
		return new Persona(this, this, this._mainPowers());
	}

	persona<T extends ValidAttackers | NPC>(this: T): Persona<T extends NPC ? NPCAlly : T> {
		type returnType = Persona<T extends NPC ? NPCAlly : T>;
		switch (this.system.type) {
			case "npc": {
				const proxy = (this as NPC).getNPCAllyProxy();
				if (!proxy) {throw new Error("Can't get persona for noncombatant");}
				return proxy.persona() as returnType;
			}
			case "npcAlly":
				return this.basePersona as returnType;
			case "pc": {
				if ((this.isPC() && (this.system.activePersona == null || this.system.activePersona == this.id || this.hasSoloPersona))) {
					return this.basePersona as returnType;
				}
				const activePersona = PersonaDB.getActorById((this as PC).system.activePersona) as ValidAttackers;
				if (!activePersona) {
					return this.basePersona as returnType;
				};
				return new Persona(activePersona, this as ValidAttackers) as returnType;
				// return Persona.combinedPersona(this.basePersona, activePersona.basePersona) as Persona<T>;
			}
			case "shadow":
				if (this.system.activePersona) {
					const activePersona = PersonaDB.getActorById((this as PC).system.activePersona) as U<ValidAttackers>;
					if(activePersona) {
						return new Persona(activePersona, this as Shadow) as returnType;
					}
				}
				return this.basePersona as returnType;
			default:
				this.system satisfies never;
				throw new PersonaError(`Can't get persona for ${this.name}`);
		}
	}

	get maxPersonas() : number {
		if (!this.isValidCombatant()) {return 0;}
		const maxCustomPersonas = this.class.system.uniquePersonas;
		const wildPersonas = this.class.system.maxPersonas;
		return Math.max( 0, maxCustomPersonas -1) + wildPersonas;
	}

	get personaList(): Persona[] {
		if (!this.isValidCombatant()) {return [];}
		const maxCustomPersonas = this.class.system.uniquePersonas;
		const actorList : ValidAttackers[] = this.system.personaList
			.map( personaId=> PersonaDB.getActorById(personaId))
			.filter(x=> x && x?.isValidCombatant()) as ValidAttackers[];
		if (this.hasSoloPersona || this.isShadow()) {
			if (this.isPC()) { return [this.basePersona];};
			actorList.pushUnique(this);
		}
		const customPersonas = actorList.reduce( (acc, actor) => acc + (actor.isShadow() && actor.isCustomPersona() == true ? 1 : 0) , 0);
		if (maxCustomPersonas > customPersonas) {
			actorList.pushUnique(this);
		}

		return actorList.map( source=> new Persona(source, this));
	}

	async addPersona(this: PC | Shadow, shadow: Shadow) {
		if (this.isPC() && (!shadow.hasPlayerOwner || !shadow.isOwner)) {
			PersonaError.softFail("Can't add this, doesn't have a player owner");
			return;
		}
		if (!this.hasSpaceForNewPersona()) {
			if (this.maxPersonaSideboard > 0) {
				await this.addSideboardPersona(shadow);
				return;
			}
			PersonaError.softFail("No Space for a new persona");
			return;
		}
		if (!shadow.isPersona()) {
			PersonaError.softFail("Can't add this, it's not a persona");
			return;
		}
		const arr = this.system.personaList.slice();
		arr.push(shadow.id);
		await this.update( {"system.personaList": arr});
		if (this.isPC()) {
			await Logger.sendToChat(`${this.name} adds Persona ${shadow.displayedName}`);
		}
	}

	hasSpaceForNewPersona(this:ValidAttackers) : boolean {
		if (this.isShadow()) {return true;}
		return this.personaList.length < this.maxPersonas;
	}


	async deletePersona(this: PC | Shadow, personaId: ValidAttackers["id"]) {
		const persona =this.personaList.find( x=> x.source.id == personaId);
		if (!persona) {
			if (this.isPC()) {
				let sideboard = this.system.combat.persona_sideboard;
				if (sideboard.includes(personaId)) {
					sideboard = sideboard.filter( x=> x != personaId);
					await this.update( {"system.combat.persona_sideboard": sideboard});
					return;
				}
			}
			PersonaError.softFail(`Couldn't find persona ${personaId}`); return;}
		const newList = this.system.personaList.filter( x=> x != personaId);
		await this.update( {"system.personaList": newList});
		if (this.isPC()) {
			await Logger.sendToChat(`${this.name} deletes Persona ${persona.displayedName}`);
		}
	}

	get combatInit(): number {
		if (!this.isValidCombatant()) {return -666;}
		const situation = {user: this.accessor};
		return this.persona().combatInit.eval(situation).total;
	}

	get accessor() : UniversalActorAccessor<typeof this> {
		return PersonaDB.getUniversalActorAccessor(this);
	}

	async toPersona(this: Shadow, newOwner ?: PC) : Promise<Shadow> {
		return ActorConverters.toPersona(this, newOwner);
	}

	get compendiumEntry() : U<Shadow> {
		if (!this.isShadow() || !this.isPersona()) {
			return undefined;
		}
		const entryId = this.system.personaConversion.compendiumId;
		if (!entryId || entryId == this.id) {return undefined;}
		const ret= PersonaDB.getActorById(entryId);
		if (!ret || !ret.isShadow() || !ret.isPersona()) {return undefined;}
		return ret;
	}

	async copyToCompendium(this: Shadow) : Promise<void> {
		if (!this.isPersona()) {
			throw new PersonaError(`Can't copy to compendium, ${this.name} isn't a valid Persona`);
		}
		const ret = await ActorConverters.copyPersonaToCompendium(this);
		if (ret && !game.user.isGM) {
			await Logger.sendToChat(`${this.name} saved to compendium`);
		}
	}

	async toDMon(this: Shadow): Promise<Shadow> {
		return ActorConverters.toDMon(this);
	}

	async _stripShadowOnlyPowers(this: Shadow) {
		//TODO: finish later

	}

	async convertOldLevelToNew(this: ValidAttackers) : Promise<number> {
		return await ActorConverters.convertOldLevelToNew(this);
	}

	get class() : Subtype<PersonaItem, "characterClass"> {
		let classNameDefault;
		switch (this.system.type) {
			case "npcAlly":
				classNameDefault = "Lone Persona User";
				break;
			case "pc":
				classNameDefault = "Lone Persona User";
				break;
			case "shadow":
				classNameDefault = "Shadow";
				// classNameDefault = "Shadow";
				break;
			case "npc":
				throw new Error("NPCs have no classes");
			case "tarot":
				throw new Error("Tarot cards have no classes");
			default:
				this.system satisfies never;
				throw new Error("Undefined type");
		}
		const id = this.system.combat.classData.classId;
		let cl = PersonaDB.getClassById(id);
		if (!cl) {
			const namesearch = PersonaDB.getClassByName(classNameDefault);
			if (!namesearch)
			{throw new Error(`Couldn't find class id: ${id} or name: ${classNameDefault}`);}
			if (namesearch.system.type != "characterClass")
			{
				throw new Error(`Bad Item named: ${classNameDefault}, expecting a character class`);
			}
			cl = namesearch as ItemSub<"characterClass">;
		}
		return cl;
	}

	async setHP(newval: number) {
		if (!this.isValidCombatant()) {return;}
		if (this.system.combat.hp == newval) {return;}
		newval = Math.clamp(newval, 0, this.mhp);
		await this.update({"system.combat.hp": newval});
		await (this as PC | Shadow).refreshHpStatus(newval);
	}


	get hp(): number {
		switch (this.system.type) {
			case "npc": return 0;
			case "tarot": return 0;
			case "pc":
			case "shadow":
			case "npcAlly":
				return this.system.combat.hp;
			default:
				this.system satisfies never;
				throw new PersonaError(`Unknown Type, can't get hp`);
		}
	}

	get mhpEstimate() : number {
		if (!this.isValidCombatant()) {return 0;}
		const mhp = this.system.combat.hpTracker.max;
		if (mhp) {return mhp;}
		return this.mhp;
	}

	get hasSoloPersona(): boolean {
		if (!this.isValidCombatant()) {return false;}
		if (this.isNPCAlly()) {return true;}
		if (this.isPC()) {
			const totalPersonas = this.class.system.uniquePersonas + this.class.system.maxPersonas;
			return totalPersonas == 1;
		}
		if (this.isShadow()) {return this.system.personaList.length <= 1;}
		this satisfies never;
		return false;
	}

	calcBaseClassMMP(this: PC | NPCAlly): number {
		//TODO: still using old level
		const lvl = this.system.combat.classData.level;

		const inc = this.system.combat.classData.incremental.mp;
		const mpBase = Math.round(PersonaActor.calcMP(lvl));
		const mpNext = Math.round(PersonaActor.calcMP(lvl + 1));
		const diff = mpNext - mpBase;
		return mpBase + Math.round((inc/3 * diff));
	}


	get baseClassHP () : number {
		if (!this.isValidCombatant()) {return 0;}
		return this.class.getClassMHP(this.level);
	}

	mhpCalculation(this: ValidAttackers) {
		const sit ={user: this.accessor};
		try {
			if (this.system == undefined) {return new Calculation().eval();}
			const lvlbase = this.baseClassHP;
			const calc = new Calculation(lvlbase);
			const persona = this.persona();
			const nonMultbonuses = persona.getBonuses("maxhp");
			const newForm = persona.getBonuses("maxhpMult-new");
			const hpAdjustPercent = this.#hpAdjustPercent();
			const hpAdjust = this.system.hp_adjust;
			calc.add(0, hpAdjustPercent,`HP Adjust (${hpAdjust})`, "multiply");
			const multmods = persona.getBonuses("maxhpMult");
			if (this.isPC() || this.isNPCAlly()) {
				const ArmorHPBoost = this.equippedItems().find(x=> x.isOutfit())?.system?.armorHPBoost ?? 0;
				if (ArmorHPBoost > 0)
				{
					calc.add(0, ArmorHPBoost, "Armor HP Bonus", "add");
				}
			}
			calc.add(0, this.system.combat.bonusHP ?? 0, "Permanent Bonus HP", "add");
			calc.add(0, newForm, "Mod List", "multiply");
			calc.add(0, multmods, "Old Form Mods", "noStackMultiply");
			calc.add(0, nonMultbonuses, "Adds", "add");
			const mhp = calc.eval(sit);
			// console.log(`MHP: ${mhp.total}`);
			return mhp;
		}	 catch(e) {
			PersonaError.softFail(`Error in calculating ${this.name} MHP`, e);
		}
		const mhp = new Calculation().eval(sit);
		return mhp;
	}



	get mhp() : number {
		if (!this.isValidCombatant()) {return 0;}
		return Math.round(this.mhpCalculation().total);
	}

	#hpAdjustPercent(this: ValidAttackers) : number {
		switch (this.system.hp_adjust) {
			case "pathetic":
				return 0.70;
			case "weak":
				return 0.85;
			case "normal":
				return 1.0;
			case "strong":
				return 1.15;
			case "ultimate":
				return 1.30;
		}
	}

	#mpAdjustPercent(this: ValidAttackers) : number {
		switch (this.system.mp_adjust) {
			case "pathetic":
				return 0.40;
			case "weak":
				return 0.70;
			case "normal":
				return 1.0;
			case "strong":
				return 1.30;
			case "ultimate":
				return 1.60;
		}
	}

	hasIncremental(type: keyof Subtype<PersonaActor, "pc">["system"]["combat"]["classData"]["incremental"]) {
		switch (this.system.type) {
			case "pc": case "shadow":
				return this.system.combat.classData.incremental[type];
			default:
				throw new Error("Doesn't have incremental");
		}
	}

	getSocialSLWithTarot(this: PC, tarot: TarotCard) : number {
		const link= this.socialLinks.find(
			link => link.actor.tarot?.name == tarot);
		if (!link) {return 0;}
		return link.linkLevel;
	}

	getSocialSLWith(this: PC, sl : SocialLink | UniversalActorAccessor<SocialLink>) : number {
		if ("actorId" in sl) {
			sl = PersonaDB.findActor(sl);

		}
		const linkData= this.system.social.find( x=> x.linkId == sl.id);
		if (!linkData) {return 0;}
		return linkData.linkLevel;
	}

	/** returns the total SLs that the PCs have with this character*/
	get totalSLs() : number {
		switch (this.system.type) {
			case "shadow":
			case "tarot": return 0;
			case "pc":
			case "npc":
			case "npcAlly": {
				let targetActor : NPC | PC | NPCAlly = this as PC;
				if (this.isNPCAlly()) {
					const proxy = this.getNPCProxyActor();
					if (!proxy) {return 0;}
					targetActor = proxy;
				}
				return PersonaDB.realPCs()
				.reduce( (acc, pc) => acc + pc.getSocialSLWith(targetActor), 0);
			}
			default:
				this.system satisfies never;
				return -1;
		}
	}

	focii(this:PersonaActor): Focus[] {
		if (this.isPC()) {return [];}
		return this.items.filter( x=> x.isFocus()) as Focus[];
	}

	get socialBenefits() : SocialBenefit[] {
		let focuses : Focus[] = [];
		switch (this.system.type) {
			case "pc": return [];
			case "shadow": return [];
			case "tarot":
				focuses = (this as Tarot).focii();
				break;
			case "npc": case "npcAlly":
				focuses = (this as NPC | NPCAlly).focii()
					.concat(this.tarot?.focii() ?? []);
				break;
			default:
					this.system satisfies never;
				throw new PersonaError("Unknwon type");
		}
		focuses.sort((a, b) => a.requiredLinkLevel() - b.requiredLinkLevel() );
		return focuses.map( focus =>({
			id: this.id,
			focus,
			lvl_requirement: focus.requiredLinkLevel(),
		}))
		;

	}

	getSocialStatToRaiseLink(this: ValidSocialTarget, classification: "primary" | "secondary") : SocialStat {
		switch (classification) {
			case "primary":
				return this.system.keyskill.primary;
			case "secondary":
				return this.system.keyskill.secondary;
			default:
				classification satisfies never;
				throw new PersonaError(`Unknown type ${classification as string}`);
		}
	}

	highestLinker(this: SocialLink) : {pc: PC | null, linkLevel: number} {
		const listOfLinkers = (game.actors.contents as PersonaActor[])
			.filter( x=> x.system.type == "pc" && x != this)
			.map( (pc : PC)=> ({
				pc,
				highest: pc.socialLinks
				.find( link=> link.actor == this)
				?.linkLevel ?? 0
			}))
			.sort ( (a,b) => b.highest - a.highest);
		const highest = listOfLinkers[0];
		if (!highest || highest.highest == 0) {
			return {pc: null, linkLevel: 0};
		}
		return {pc : highest.pc, linkLevel: highest.highest};
	}

	async addNewActivity(this: PC, activity: Activity) {
		const act= this.system.activities;
		if (act.find(x=> x.linkId == activity.id))
		{return;}
		const item : typeof act[number] = {
			linkId: activity.id,
			strikes: 0,
			currentProgress: 0,
		};
		act.push( item);
		await this.update( {"system.activities": act});
	}

	get activityLinks() : ActivityLink[] {
		if (this.system.type != "pc") {return [];}
		return this.system.activities
			.flatMap( aData => {
				const activity = PersonaDB.allActivities().find(x=> x.id == aData.linkId);
				if (!activity) {return [];}
				const aLink : ActivityLink = {
					strikes: aData.strikes ?? 0,
					available: activity.isAvailable(this as PC),
					currentProgress: aData.currentProgress,
					activity,
				};
				return aLink;
			});
	}

	isDating(linkId: string) : boolean;
	isDating( link: PersonaActor) : boolean;

	isDating( sl: PersonaActor | string) : boolean {
		switch (this.system.type) {
			case "shadow":
			case "tarot":
				return false;
			case "npcAlly":
			case "npc": {
				const id = sl instanceof PersonaActor ? sl.id: sl;
				const target =PersonaDB.allActors().find( x=> x.id == id);
				if (!target || target.system.type != "pc")  {
					return false;
				}
				return target.isDating(this as NPC);
			}
			case "pc":
				break;
			default:
				this.system satisfies never;
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				PersonaError.softFail(`Unexpected Date type: ${this.system["type"] as unknown}`);
				return false;
		}
		if (this.system.type != "pc") {return false;}
		const id = sl instanceof PersonaActor ? sl.id: sl;
		const link =  this.system.social.find(x=> x.linkId == id);
		if (!link) {return false;}
		return link.isDating || link.relationshipType == "DATE";
	}


	get socialLinks() : readonly SocialLinkData[] {
		if (!this.isPC() || !PersonaDB.isLoaded) {return EMPTYARR as SocialLinkData[];}
		function meetsSL(linkLevel: number, focus:Focus) {
			return linkLevel >= focus.requiredLinkLevel();
		};
		const PersonaCaching = PersonaSettings.agressiveCaching();
		if (!PersonaCaching || this.cache.socialData == undefined) {
			this.cache.socialData = this.system.social.flatMap(({linkId, linkLevel, inspiration, currentProgress, relationshipType}) => {
				const npc = PersonaDB.getActor(linkId);
				if (!npc) {return [];}
				const isDating = relationshipType == "DATE";
				relationshipType = relationshipType ? relationshipType : npc.baseRelationship;
				if (npc.system.type == "npc") {
					const allFocii = (npc as NPC).getSocialFocii_NPC(npc as SocialLink);
					const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
					return [{
						currentProgress,
						linkLevel,
						inspiration,
						relationshipType,
						actor:npc as SocialLink,
						linkBenefits: npc as SocialLink,
						allFocii,
						available: npc.isAvailable(this as PC),
						focii: qualifiedFocii,
						isDating,
					}];
				} else {
					if (npc == this) {
						const personalLink = PersonaDB.personalSocialLink();
						if (!personalLink)  {
							return [];
						}
						const allFocii = personalLink.getSocialFocii_PC(personalLink as SocialLink, npc as PC);
						const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
						return [{
							currentProgress,
							linkLevel,
							inspiration,
							relationshipType,
							actor:npc as SocialLink,
							linkBenefits: personalLink,
							allFocii: allFocii,
							focii: qualifiedFocii,
							available: (npc as SocialLink).isAvailable(this as PC),
							isDating,
						}];
					} else {
						const teammate = PersonaDB.teammateSocialLink();
						if (!teammate)  {
							return [];
						}
						const allFocii = teammate.getSocialFocii_PC(teammate as SocialLink, npc as PC);
						const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
						return [{
							currentProgress,
							linkLevel,
							inspiration,
							relationshipType,
							actor:npc as SocialLink,
							linkBenefits: teammate,
							allFocii: allFocii,
							focii: qualifiedFocii,
							available: (npc as SocialLink).isAvailable(this as PC),
							isDating,
						}];
					}
				}
			})
				.sort((a, b) => (a.actor.tarot?.system.sortOrder ?? 99) - (b.actor.tarot?.system.sortOrder ?? 99));
		}
		return this.cache.socialData;
	}

	get unrealizedSocialLinks() : (NPC | PC)[] {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
			case "npcAlly":
				return [];
			case "pc":
				break;
			default:
				this.system satisfies never;
				throw new PersonaError("Something weird happened");
		}
		const currentLinks = this.system.social.map(x=> x.linkId);
		const list = PersonaDB.socialLinks()
			.filter( x=> !currentLinks.includes(x.id))
			.filter( (x : PC | NPC)=> Object.values(x.system.weeklyAvailability).some(x=> x == true))
			.filter( (x : PC | NPC)=> Boolean(x.system.tarot));
		return list;
	}

	get recoveryAmt(): number {
		if (!this.isValidCombatant()) {return 0;}
		if (this.isShadow()) {return 0;}
		if (this.isPC() && !this.isRealPC()) {return 0;}
		const situation : Situation = {
			user: (this as PC).accessor
		};
		const persona = this.persona();
		const rec_bonuses = persona.getBonuses("recovery");
		const rec_mult = persona.getBonuses("recovery-mult").total(situation, "percentage");
		if (this.isNPCAlly()) {
			return Math.floor(this.baseClassHP / 10 * rec_mult);
		}
		rec_bonuses.add("Base", 10);
		const healing = rec_bonuses.total(situation);
		return healing * rec_mult;
	}


	async spendRecovery(this: ValidAttackers, socialLinkId: null): Promise<void>;
	async spendRecovery(this: PC, socialLinkId: string): Promise<void>;
	async spendRecovery(this: ValidAttackers, socialLinkId: string | null) {
		const healing = this.recoveryAmt;
		if (this.isPC() && socialLinkId != null)  {
			const linkActor = game.actors.get(socialLinkId);
			const link = this.system.social.find( x=> x.linkId == socialLinkId);
			if (!link) {
				throw new PersonaError(`Can't find link ${socialLinkId}`);
			}
			if (link.inspiration <= 0) {
				throw new PersonaError("Can't spend recovery!");
			}
			link.inspiration -= 1;
			await this.update({"system.social": this.system.social});
			await Logger.sendToChat(`${this.name} used inspiration from link ${linkActor?.name} to heal ${healing} hit points (original HP: ${this.hp})` , this);
		} else {
			await Logger.sendToChat(`${this.name} used a recovery to heal ${healing} hit points (original HP: ${this.hp})` , this);
		}
		await this.modifyHP(healing);
	}

	_mainPowers() : Power[] {
		switch (this.system.type) {
			case "npc": case "tarot": return [];
			case "npcAlly":
			case "pc": {
				const powerIds = this.system.combat.powers;
				const pcPowers : Power[] = powerIds.flatMap( id=> {
					const i = PersonaDB.getItemById(id);
					return (i ? [i as Power] : []);
				});
				return pcPowers;
			}
			case "shadow": {
				const powerIds = this.system.combat.powers;
				const compPowers : Power[] = powerIds.flatMap( id=> {
					const i = PersonaDB.getItemById(id);
					return (i ? [i as Power] : []);
				});
				const shadowPowers = this.items.filter( x=> x.system.type == "power") as Power[];
				return compPowers.concat(shadowPowers);
			}
			default:
				this.system satisfies never;
				return [];
		}
	}

	get mainPowers() : Power[] {
		switch (this.system.type) {
			case "npc": case "tarot": return [];
			case "pc":
			case "shadow":
			case "npcAlly":
				return (this as ValidAttackers).persona().mainPowers;
			default:
				this.system satisfies never;
				return [];
		}
	}

	get sideboardPowers() : Power [] {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return [];
			case "npcAlly":
			case "pc":
				break;
			default:
				this.system satisfies never;
		}
		if (!this.hasSoloPersona) {return [];}
		if (!this.class.system.canUsePowerSideboard) {return [];}
		const powerIds = this.system.combat.powers_sideboard;
		const pcPowers : Power[] = powerIds.flatMap( id=> {
			const i = PersonaDB.getItemById(id);
			return (i ? [i as Power] : []);
		});
		return pcPowers;
	}

	get sideboardPersonas(): readonly Persona[] {
		if (!this.isPC()) {return [];}
		if (!this.class.system.canUsePersonaSideboard) {return [];}
		const sideboardIds = this.system.combat.persona_sideboard;
		const personas = sideboardIds
			.flatMap( id =>  {
				const shadow = PersonaDB.getActor(id);
				return shadow != undefined && shadow.isShadow() ? [shadow] : [];
			})
			.map( shadow => new Persona(shadow, this)) ;
		return personas;
	}

	get maxPersonaSideboard() : number {
		if (!this.isPC()) {return 0;}
		if (!this.class.system.canUsePersonaSideboard) {return 0;}
		const base = BASE_PERSONA_SIDEBOARD;
		const bonuses = this.getPersonalBonuses("persona-sideboard").total( {user: this.accessor});
		return base + bonuses;
	}

	async addSideboardPersona(shadow: Shadow) : Promise<boolean> {
		if (!this.isPC() || this.maxPersonaSideboard <= 0) {
			ui.notifications.warn(`${this.name} can't add sideboard Personas`);
			return false;
		}
		if (!shadow.isPersona()) {
			ui.notifications.warn(`Can't add ${shadow.name} as sideboard persona (not a persona)`);
			return false;
		}
		const sideboardIds = this.system.combat.persona_sideboard;
		if (sideboardIds.includes(shadow.id)) {
			ui.notifications.warn(`${shadow.name} already in Persona sideboard`);
			return false;
		}
		if (sideboardIds.length >= this.maxPersonaSideboard) {
			ui.notifications.warn(` Can't add to ${this.name} Sideboard, Sideboard is full`);
			return false;
		}
		sideboardIds.push(shadow.id);
		await this.update( {"system.combat.persona_sideboard": sideboardIds});
		await Logger.sendToChat(`${this.name} added ${shadow.name} as sideboard persona`);
		return true;
	}

	get basicPowers() : readonly Power [] {
		switch (this.system.type) {
			case "npc": case "tarot":
				return [];
			case "shadow":
				return PersonaItem.getBasicShadowPowers();
			case "pc":
			case "npcAlly": {
				const arr = PersonaItem.getBasicPCPowers().slice();
				const extraSkills = [
					this.teamworkMove,
					// ...this.navigatorSkills,
				].flatMap( x=> x != undefined ? [x] : []);
				arr.push (...extraSkills);
				return arr; 
			}
			default:
				this.system satisfies never;
				return [];
		}
	}

	get maxPowers() : number {
		if (!this.isValidCombatant()) {return 0;}
		switch (this.system.type) {
			case "npcAlly":
				return 8;
			case "pc":
			case "shadow": {
				const extraMaxPowers = this.persona().getBonuses("extraMaxPowers");
				return 8 + extraMaxPowers.total ( {user: (this as PC | Shadow).accessor});
			}
			default:
				this.system satisfies never;
				return -1;
		}
	}

	async addNavigatorSkill(this: NPCAlly, pwr: Power) {
		this.system.combat.navigatorSkills.pushUnique(pwr.id);
		await this.update( {"system.combat.navigatorSkills" : this.system.combat.navigatorSkills});
		await Logger.sendToChat(`${this.name} added Navigator skill: ${pwr.name}` , this);
	}

	async deleteNavigatorSkill(this: NPCAlly, powerId: Power["id"] ) : Promise<boolean> {
		if (!this.system.combat.navigatorSkills.find( x=> powerId == x)) {return false;}
		const power = this.navigatorSkills.find( x=> x.id == powerId);
		this.system.combat.navigatorSkills= this.system.combat.navigatorSkills.filter(x=> x != powerId);
		await this.update( {"system.combat.navigatorSkills" : this.system.combat.navigatorSkills});
		await Logger.sendToChat(`${this.name} deleted Navigator skill ${power?.name ?? "unknown power"}` , this);
		return true;
	}

	get navigatorSkills(): Power[] {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
			case "pc":
				return [];
			case "npcAlly": {
				const powers = this.system.combat.navigatorSkills
				.map( id => PersonaDB.getPower(id))
				.filter( x=> x != undefined);
				return powers;
			}
			default:
				this.system satisfies never;
				return [];
		}
	}

	getUsableById(id: Usable["id"]) : Usable | undefined {
		const usables: Usable[] = (this.powers as Usable[]).concat(this.openerActions);
		const power = usables.find(pow => pow.id == id);
		if (power) {return power;}
		const usable = this.items.find( item=> item.id == id && item.isUsableType());
		if (usable) {return usable as Usable;}
		PersonaError.softFail(`Can't find Usable with Id ${id}`);
	}

	get powerLearningListFull() : readonly Readonly<{power: Power, level: number}>[] {
		if (!this.isValidCombatant()) {return [];}
		let powerList = this.system.combat.powersToLearn;
		if (this.isShadow()) {
			const baseId= (this.system.personaConversion.baseShadowId);
			if (baseId) {
				const baseShadow = PersonaDB.getActorById(baseId);
				if (baseShadow && baseShadow.isShadow()) {
					powerList = baseShadow.system.combat.powersToLearn;
				}
			}
		}
		return powerList
			.sort( (a,b) => a.level - b.level)
			.map( data => {
				const power = PersonaDB.getPower(data.powerId);
				return {
					power,
					level: data.level,
				};
			})
			.filter ( x=> x.power) as {power: Power, level: number}[];
	}

	get powerLearningList() : readonly Readonly<{power: Power, level: number}>[] {
		if (!this.isValidCombatant()) {return [];}
		const lastLearn = this.system.combat.lastLearnedLevel <= 1 ? this.startingLevel: this.system.combat.lastLearnedLevel;
		return this.powerLearningListFull
			.filter( x=> x.level > lastLearn)
			.filter( x=> this.checkPowerLegality(x.power ));
	}

	checkPowerLegality( pwr: Power)  :boolean {
		if (pwr.hasTag("shadow-only") && (!this.isShadow() || this.isPersona())) {return false;}
		return true;
	}

	get nextPowerToLearn() : Power | undefined {
		return this.powerLearningList.at(0)?.power;
	}

	get nextLevelLearnPower(): number | undefined {
		return this.powerLearningList.at(0)?.level;
	}

	get learnedSkillsRemaining(): number {
		return this.powerLearningList.length;
	}

	get topLearnedBuffer(): Power | undefined {
		return this.learnedPowersBuffer.at(0);
	}

	get learnedPowersBuffer() : Power[] {
		if (!this.isValidCombatant()) {return [];}
		return this.system.combat.learnedPowersBuffer
			.map( p => PersonaDB.getPower(p))
			.filter( p=> p != undefined);
	}

	get powers(): Power[] {
		if (!this.isValidCombatant()) {return [];}
		return [
			...this.basicPowers,
			...this.mainPowers,
			...this.persona().bonusPowers,
		].flat();
	}

	get displayedBonusPowers() : Power[] {
		if (!this.isValidCombatant()) {return [];}
		return this.persona().bonusPowers.filter( power=>
			!power.isOpener() && !power.isMinorActionItem()
		);
	}

	randomItem(this:PC): InvItem | SkillCard | Weapon | Consumable  {
		const items = this.items.filter(x=> x.isTrueItem() == true);
		return randomSelect(items) as InvItem | SkillCard | Weapon | Consumable;
	}

	get weapon() : Option<Weapon> {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return null;
			case "pc":
			case "npcAlly":
				break;
			default:
				this.system satisfies never;
		}
		const id = this.system.equipped.weapon;
		const item = this.items.find( x=> x.id == id);
		if (item) {return item as Weapon;}
		const dbitem = PersonaDB.getItemById(id);
		if (dbitem) {return dbitem as Weapon;}
		return null;
	}

	unarmedTagList() : readonly PowerTag[] {
		if (POWER_TAGS_LIST.includes (this.getUnarmedDamageType() as typeof POWER_TAGS_LIST[number])) {
			return [this.getUnarmedDamageType()] as PowerTag[];
		}
		return [];
	}

	passiveFocii(this: ValidAttackers): Focus[] {
		return this.persona().passiveFocii();
	}

	defensiveFocii(this: ValidAttackers): Focus[] {
		return this.persona().defensiveFocii();
	}

	async modifyHP( this: ValidAttackers, delta: number) {
		if (delta == 0) {return;}
		let hp = this.system.combat.hp;
		hp += delta;
		if (hp < 0 ) {
			hp = 0;
		}
		const mhp = this.mhp;
		if (hp >= mhp) {
			hp = mhp;
		}
		await this.update( {"system.combat.hp": hp});
	}

	async modifyMP( this: PC | NPCAlly, delta: number) {
		let mp = this.system.combat.mp.value;
		mp += delta;
		mp = Math.clamp(Math.round(mp), 0, this.mmp);
		await this.update( {"system.combat.mp.value": mp});
	}

	async refreshHpStatus(this: ValidAttackers, newval?: number) : Promise<void> {
		if (this._antiloop) {return;}
		this._antiloop = true;
		const startingHP = this.system.combat.hp;
		const hp = newval ?? this.system.combat.hp;
		let debugMarker = 0;
		const mhp = this.mhp;
		try {
			// console.debug(`Refreshing HP status on ${this.name}`);
			if (hp > 0) {
				debugMarker = 1;
				await this.clearFadingState();
			}
			if (hp > mhp) {
				debugMarker = 2;
				await this.update( {"system.combat.hp": mhp});
			}
			if (this.hasStatus("full-fade") && this.system.combat.hp != 0) {
				debugMarker = 3;
				await this.update( {"system.combat.hp": 0});
			}
			if (newval != undefined) {
				if (startingHP > 0  && newval <= 0) {
					debugMarker = 4;
					await this.onKO();
				}
				if (startingHP <= 0 && newval > 0) {
					debugMarker = 5;
					await this.onRevive();
				}
			}
			debugMarker = 6;
			await this.updateOpacity(hp);
		} catch (e) {
			PersonaError.softFail(`Error on Refresh HP Status for ${this.name}, ${this.id}, hp: ${hp}, mhp: ${mhp}, debug:${debugMarker}`, e);
		}
		this._antiloop = false;
	}

	async updateOpacity(this: ValidAttackers, hp: number) {
		const opacity = hp > 0 ? 1.0 : (this.isFullyFaded(hp) ? 0.2 : 0.6);
		if (this.token) {
			await this.token.update({"alpha": opacity});
		} else {
			//@ts-expect-error dependent tokens not in foundrytypes
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			for (const iterableList of this._dependentTokens.values()) {
				for (const tokDoc of iterableList) {
					try {
						await (tokDoc as TokenDocument<PersonaActor>).update({"alpha": opacity});
					} catch {
						//throw away errors from tokens that have gone out of scope as this is expected
						continue;
					}
				}
			}
		}
	}

	async isStatusResisted( id : StatusEffect["id"]) : Promise<boolean> {
		if (!this.isValidCombatant()) {return false;}
		const resist = this.persona().statusResist(id);
		switch (resist) {
			case "absorb":
			case "reflect":
			case "weakness":
			case "normal":
				break;
			case "block":
				return true;
			case "resist": {
				const save = await PersonaRoller.rollSave(this as Shadow, {
					DC: 11,
					label:`Resist status ${id}`,
					askForModifier: false,
					saveVersus: id,
					modifier: 0,
					rollTags: ["resist-status"],
				});
				await save.toModifiedMessage(true);
				if (save.success) {return true;}
				break;
			}
			default:
				resist satisfies never;
		}
		return false;
	}

	/**error catch wrapper for this funciton as Monks's statuses was throwing here and may have been breaking hooks when it failed.*/
	override async toggleStatusEffect(statusId: StatusEffectId, options?: Foundry.ToggleStatusOptions) {
		try {
			const ret = super.toggleStatusEffect(statusId, options);
			return ret;
		} catch (error ) {
			const e = error as Error;
			console.warn(`${e.toString()} \n ${e.stack}`);
			return undefined;
		}
	}

	private downResistNewStatus({duration}: StatusEffect) :boolean {
		if (this.hp > 0) {return false;}
		return PersonaAE.durationLessThanOrEqualTo(duration, {dtype: "combat"});
	}

	/** returns true if status is added*/
	async addStatus(statusEffect: StatusEffect, ignoreFatigue= false): Promise<boolean> {
		const {id, potency, duration} = statusEffect;
		try {
			if (!ignoreFatigue && statusMap?.get(id)?.tags.includes("fatigue")) {
				const lvl = statusToFatigueLevel(id as FatigueStatusId);
				const oldLvl = this.fatigueLevel;
				await this.setFatigueLevel(lvl);
				const newLvl = this.fatigueLevel;
				return oldLvl != newLvl;
			}
			if (this.downResistNewStatus(statusEffect)) {
				return false;
			}
			if (await this.isStatusResisted(id)) {return false;}
			const stateData = CONFIG.statusEffects.find ( x=> x.id == id);
			if (!stateData) {
				throw new Error(`Couldn't find status effect Id: ${id}`);
			}
			const eff = this.effects.find( eff => eff.statuses.has(id));
			if (!eff) {
				const s = [id];
				const newState = {
					...stateData,
					name: game.i18n.localize(stateData.name),
					statuses: s
				};
				if (await this.checkStatusNullificaton(id)) {return false;}
				if (this.isValidCombatant()) {
					const situation: Situation ={
						triggeringCharacter: this.accessor,
						triggeringUser: game.user,
						user: this.accessor,
						statusEffect: id,
						target: this.accessor,
					};
					const ret = (await TriggeredEffect.onTrigger("pre-inflict-status", this, situation)).finalize();
					await ret
						.emptyCheck()
						?.toMessage("Response to acquiring Status", this);
					if (ret.hasCancelRequest()) {return false;}
					const instantKillStatus : StatusEffectId[] = ["curse", "expel"];
					if ( instantKillStatus.some(status => id == status) && this.isValidCombatant()) {
						await this.setHP(0);
					}
				}
				const newEffect = (await  this.createEmbeddedDocuments("ActiveEffect", [newState]))[0] as PersonaAE;
				await newEffect.setPotency(potency ?? 0);
				const adjustedDuration = this.getAdjustedDuration(duration, id);
				await newEffect.setDuration(adjustedDuration);
				return true;
			} else  {
				await eff.mergeDuration(duration);
			}
			//TODO: update the effect
			return false;
		} catch (e) {
			PersonaError.softFail(`Error adding status :${id}`, e);
			return false;
		}
	}

	getAdjustedDuration( duration: StatusDuration, id: StatusEffect["id"]) : StatusDuration {
		if (!this.isValidCombatant()) {return duration;}
		try {
			switch (duration.dtype)  {
				case "X-rounds":
				case "3-rounds": {
					const tags = CONFIG.statusEffects.find(x=> x.id == id)?.tags;
					if (!tags) {
						PersonaError.softFail(`Bad status Id: ${id}`);
						return duration;
					}
					if (!tags.includes("baneful") || tags.includes("downtime"))  {
						return duration;
					}
					const situation : Situation = {
						user: (this as ValidAttackers).accessor,
						target: (this as ValidAttackers).accessor,
						statusEffect: id,
					};
					const modifier = this.persona().getBonuses("baleful-status-duration").total(situation);
					const reducedAmt = Math.max(0, duration.amount + modifier);
					return {
						...duration,
						amount: reducedAmt,
					};
				}
				default:
					return duration;
			}
		} catch (e) {
			PersonaError.softFail("Problem with getAdjusted Duration");
			Debug(e);
			return duration;
		}
	}

	get openerActions() : Usable[] {
		if (this.system.type == "npc" || this.system.type == "tarot")
		{return [];}
		const powerBased = (this.system.type == "shadow" ? this.mainPowers : this.consumables)
			.filter( power => power.isOpener());
		const arr : Usable[] = (this as ValidAttackers).mainModifiers({omitPowers:true})
			.filter(x=> PersonaItem.grantsPowers(x))
			.flatMap(eff=> PersonaItem.getAllGrantedPowers(eff, this as ValidAttackers) as Usable[])
			.filter( eff => eff.isOpener())
		// .flatMap(x=> x.getOpenerPowers(this as PC ) as Usable[])
			.concat(powerBased);
		return removeDuplicates(arr);
	}

	async setTeamworkMove(this: ValidAttackers, power: Power) {
		const id = power.id;
		const oldTW = this.teamworkMove;
		await this.update( {"system.combat.teamworkMove": id});
		if (oldTW) {
			await Logger.sendToChat(`${this.name} replaced Teamwork ${oldTW.displayedName.toString()} with ${power.displayedName.toString()}` , this);
		} else {
			await Logger.sendToChat(`${this.name} set Teamwork Move to ${power.displayedName.toString()}` , this);
		}

	}

	get teamworkMove() : Power | undefined {
		switch (this.system.type) {
			case "pc":
			case "npcAlly":
				break;
			case "shadow":
			case "tarot":
			case "npc":
				return undefined;
			default:
				this.system satisfies never;
				return undefined;
		}
		const id = this.system.combat.teamworkMove;
		if (!id)
		{return undefined;}
		return PersonaDB.allPowers().get(id);
	}

	hasStatus (id: StatusEffectId) : boolean {
		return this.effects.contents.some( eff => eff.statuses.has(id));

	}

	getStatus( id: StatusEffectId) : PersonaAE | undefined {
		return this.effects.contents.find( eff => eff.statuses.has(id));

	}

	get tokens() : TokenDocument<this>[] {
		if (this.token) {
			return [this.token];
		}
		//@ts-expect-error not in foundrytypes
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument
		const dependentTokens : TokenDocument<PersonaActor>[] = Array.from(this._dependentTokens.values()).flatMap(x=> Array.from(x.values()));

		return dependentTokens.filter( x=> x.actorLink == true) as TokenDocument<this>[];
	}

	/** returns true if nullfied **/
	async checkStatusNullificaton(statusId: StatusEffectId) : Promise<boolean> {
		let cont = false;
		const remList : StatusEffectId[] = [];
		switch (statusId) {
			case "defense-boost":
				remList.push("defense-nerf");
				break;
			case "defense-nerf":
				remList.push("defense-boost");
				break;
			case "attack-boost":
				remList.push("attack-nerf");
				break;
			case "attack-nerf":
				remList.push("attack-boost");
				break;
			case "damage-boost":
				remList.push("damage-nerf");
				break;
			case "damage-nerf":
				remList.push("damage-boost");
				break;
		}
		if (this.hp <= 0) {
			const allNonDowntimeStatus = this.effects.filter( x=> x.isStatus && !x.isDowntimeStatus && !x.statuses.has("fading"));
			const list = allNonDowntimeStatus.flatMap( x=> Array.from(x.statuses));
			remList.push(...list);
			cont = true;
		}
		let removed =0;

		for (const id of remList) {
			if (this.hasStatus(id)) {
				removed++;
				await this.removeStatus(id);
			}
		}
		return removed > 0 && !cont;
	}

	/** returns new status to escalate if needed  */
	async checkStatusEscalation (statusId: StatusEffectId) : Promise <StatusEffectId>  {
		const remList : StatusEffectId[] = [];
		let returnStatus: StatusEffectId = statusId;
		switch (statusId) {
			case "fatigued":
				if (!this.hasStatus("fatigued")) {break;}
				remList.push("fatigued");
				returnStatus = "tired";
				break;
			case "tired":
				if (!this.hasStatus("tired")) {break;}
				remList.push("tired");
				returnStatus = "exhausted";
				break;
			case "exhausted":
				remList.push("tired");
				returnStatus = "exhausted";
				break;
			default:
				returnStatus = statusId;
				break;
		}
		for (const id of remList) {
			await this.removeStatus(id);
		}
		return returnStatus;
	}

	async removeStatus(status: Pick<StatusEffect, "id"> | StatusEffectId) : Promise<boolean>{
		const id = typeof status == "object" ? status.id : status;
		try {
			const promises = this.effects
				.filter( eff => eff.statuses.has(id))
				.map( async (eff) => await eff.delete());
			await Promise.all(promises);
			return promises.length > 0;
		} catch (e) {
			PersonaError.softFail(`Error removing status ${id}`,e );
			return false;
		}
	}

	equippedItems() : (InvItem | Weapon)[]  {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return [];
			case "pc":
			case "npcAlly":
				break;
			default:
				this.system satisfies never;
				return [];
		}
		const inv = this.inventory;
		const slots : (keyof typeof this.system.equipped)[]=  ["weapon", "body", "accessory", "weapon_crystal"];
		const ret = slots
			.map( slot=> inv
				.find(item => item.id == (this as PC).system.equipped[slot]))
			.flatMap (x=> x? [x]: []);
		return ret as (InvItem | Weapon)[];
	}

	passiveItems(): InvItem[] {
		switch (this.system.type) {
			case "shadow":
			case "npc":
			case "tarot":
				return [];
			case "pc":
			case "npcAlly":
				break;
			default:
				this.system satisfies never;
				return [];
		}
		const inv = this.inventory;
		return inv.filter( item => item.system.type == "item" && (item.system.slot == "none" || item.system.slot =="key-item")) as InvItem[];
	}

	getPersonalBonuses(modnames : ModifierTarget | ModifierTarget[], sources: readonly ModifierContainer[] = this.actorMainModifiers()) : ModifierList  {
		const modList = new ModifierList( sources.flatMap( item => item.getModifier(modnames, this)
			.filter( mod => mod.modifier != 0)
		));
		return modList;
	}

	actorMainModifiers(options ?: {omitTags ?: boolean}): readonly ModifierContainer[] {
		const tags = (options && options.omitTags) ? [] : this.realTags();
		return [
			...this.passiveItems(),
			...this.getAllSocialFocii(),
			...this.equippedItems(),
			...tags,
			...this.statusModifiers(),
		];
	}

	statusModifiers() : ModifierContainer[]{
		return this.effects.filter( eff => eff.hasEffects());
	}

	get downtimeMinorActions() : (Usable | SocialCard)[] {
		const list = [
			...this.powers,
			...this.consumables,
		];
		const allUsable = list.filter ( pwr => pwr.hasTag("downtime-minor"));
		return [
			...PersonaDB.downtimeActions(),
			...allUsable,
		];
	}

	get usableDowntimeMinorActions(): (Usable | SocialCard)[] {
		if (!this.isPC()) {return [];};
		return this.downtimeMinorActions.filter( action=>  {
			if (action.isUsableType()) {
				return this.persona().canUsePower(action, false);
			}
			if (action.isSocialCard()) {
				return PersonaSocial.isActivitySelectable(action, this);
			}
		})
			.sort( (a,b) => a.displayedName.localeCompare(b.displayedName));
	}

	get treasureMultiplier () : number {
		if (!this.isValidCombatant()) {return 1;}
		switch (this.system.type) {
			case "pc": case "npcAlly": {
				const situation :Situation = {
					user: (this as PC | NPCAlly).accessor
				};
				const bonus= this.persona().getBonuses("shadowMoneyBoostPercent").total(situation, "percentage");
				return !Number.isNaN(bonus) ? bonus : 1;
			}
			default:
				return 1;
		}
	}

	getFatigueStatus() : FatigueStatusId | undefined {
		const eff = this.effects.contents.find( x=> x.getFatigueStatus() != undefined);
		return eff?.getFatigueStatus();
	}

	get fatigueLevel() : number {
		if (this.system.type != "pc") {return 0;}
		const st = this.getFatigueStatus();
		return statusToFatigueLevel(st);
	}

	hasAlteredFatigueToday(this:PC): boolean {
		return this.system.fatigue.hasAlteredFatigueToday ?? false;
	}

	hasMadeFatigueRollToday(this:PC) : boolean {
		return this.system.fatigue.hasMadeFatigueRollToday ?? false;
	}

	async setAlteredFatigue(val = true) {
		await this.update({"system.fatigue.hasAlteredFatigueToday": val});
	}

	async setFatigueLevel(lvl: number,log = true) : Promise<FatigueStatusId | undefined> {
		const oldLvl = this.fatigueLevel;
		const oldId = fatigueLevelToStatus(oldLvl);
		const newId = fatigueLevelToStatus(lvl);
		for (const eff of this.effects.contents) {
			if (eff.isFatigueStatus) {
				if (!eff.statuses.has(newId!))
				{await eff.delete();}
			}
		}
		if (newId) {
			await this.addStatus( {
				id: newId,
				duration: {
					dtype:"permanent",
				}
			}, true);
		}
		if (lvl < statusToFatigueLevel("exhausted")) {
			await this.addStatus( {
				id: "crippled",
				duration: {
					dtype:"permanent",
				}
			}, true);
		}
		// const newId = await this.setFatigueLevel(st);
		if (log && (oldId != newId || lvl < -1)) {
			const oldName = oldId ? localize(statusMap.get(oldId)!.name) : "Normal";
			const newName = newId ? localize(statusMap.get(newId)!.name): "Normal";
			const hospital = lvl < statusToFatigueLevel("exhausted") ? `${this.displayedName} is over-fatigued and need to be hospitalized!`: "";
			await Logger.sendToChat(`${this.displayedName}  fatigue changed from ${oldName} to ${newName}. ${hospital}`);
		}
		return newId;
	}

	async alterFatigueLevel(amt: number, log=true) : Promise<FatigueStatusId | undefined> {
		const oldLvl = this.fatigueLevel;
		const newLvl = oldLvl + amt;
		return await this.setFatigueLevel(newLvl, log);
	}

	getUnarmedDamageType(): RealDamageType {
		if (this.system.type == "shadow") {return this.system.combat.baseDamageType ?? "physical";}
		return "physical";
	}

	listComplementRatings(this: Shadow, list: Shadow[]) : string[] {
		return list.map( shadow => {
			const rating = Math.round(this.complementRating(shadow) * 10) / 10;
			return {rating, name: shadow.name};
		})
			.sort( (a,b) => b.rating - a.rating)
			.map(x => `${x.name}: ${x.rating}`);

	}

	complementRating (this: Shadow, other: Shadow) : number {
		const cachedRating = this.cache.complementRating.get(other.id);
		if (cachedRating != undefined) {
			return cachedRating;
		}
		const rating = this.#complementRating(other) + other.#complementRating(this);
		this.cache.complementRating.set(other.id, rating);
		return rating;
	}

	#complementRating (this: Shadow, other: Shadow) : number {
		let rating = 0;
		if (this == other) {return 0;} //baseline
		const scaledPairs : [Shadow["system"]["role"], Shadow["system"]["role"], number][] = [
			["soldier", "lurker", 1],
			["soldier", "support", 1],
			["soldier", "artillery", 1],
			["brute", "support", 1],
			["brute", "controller", 1],
			["assassin", "lurker", -1],
			["lurker", "support", -1],
			["lurker", "controller", 1],
			["lurker", "lurker", -0.5],
			["soldier", "soldier", -0.5],
			["support", "support", -0.5],
		] as const;
		for (const [r1,r2, amt] of scaledPairs) {
			if (this.hasRole(r1) && other.hasRole(r2)) {
				rating += amt;
			}
		}
		const thisP= this.persona();
		const otherP = other.persona();
		const weaknesses = DAMAGETYPESLIST
			.filter( dmg => dmg != "by-power" && thisP.elemResist(dmg) == "weakness") as RealDamageType[];
		rating -= 0.5 * weaknesses.length;
		const normalR = DAMAGETYPESLIST
			.filter( dmg => dmg != "by-power" && thisP.elemResist(dmg) == "normal") as RealDamageType[];
		for (const w of weaknesses) {
			const res = otherP.elemResist(w);
			switch (res)  {
				case "block":
					rating += 2;
					break;
				case "absorb":
				case "reflect":
					rating += 3;
					break;
				case "resist":
					rating += 0.5;
					break;
				case "normal":
					rating -= 1;
					break;
				case "weakness":
					rating -= 2;
					break;
				default:
					break;
			}
		}
		for (const n of normalR) {
			const res = otherP.elemResist(n);
			switch (res) {
				case "resist":
					rating += 0.1;
					break;
				case "absorb":
				case "reflect":
				case "block":
					rating += 1;
					break;
				case "weakness":
					rating -= 1;
					break;
			}
		}

		const attacks = new Set(
			this.powers
			.map(x=> x.system.dmg_type)
			.filter (dmgType => dmgType != "untyped" && dmgType != "none")
		);
		const otherAttacks =
			other.powers
			.map(x=> x.system.dmg_type)
			.filter (dmgType => dmgType != "healing" && dmgType != "untyped" && dmgType != "none");
		rating += otherAttacks.reduce( (acc, dmg) =>
			acc + (!attacks.has(dmg) ? 1 : 0)
			, 0 );
		return rating;
	}

instantKillResistanceMultiplier(this: ValidAttackers, attacker: ValidAttackers) : number {
	const situation : Situation = {
		attacker: attacker.accessor,
		user: this.accessor,
		target: this.accessor,
	};
	return this.persona().getBonuses("instantDeathResistanceMult").total(situation, "percentage");
}

mainModifiers(...args: Parameters<Persona["mainModifiers"]>): readonly SourcedConditionalEffect[] {
	if (!this.isValidCombatant()) {return [];}
	return this.persona().mainModifiers(...args);
}

userDefensiveEffects(this: ValidAttackers) : ModifierContainer [] {
	if (!this.isValidCombatant()) {return [];}
	return this.actorMainModifiers()
		.filter(x=> x.getEffects(this, {CETypes: ["defensive"]}));
}

getDefense(this: ValidAttackers,  type : Defense) : Calculation {
	return this.persona().getDefense(type);
}

get statusResists() : {id: string, img: string, local: string, val: string}[] {
	if (!this.isValidCombatant()) { return [];}
	const arr: {id: string, img: string, local: string, val: string}[]   = [];
	for (const [k, v] of Object.entries(this.system.combat.statusResists)) {
		arr.push( {
			id: k,
			val: v,
			local: localize(STATUS_EFFECT_TRANSLATION_TABLE[k as StatusEffectId]),
			img: STATUS_EFFECT_LIST.find(x=> x.id == k)?.icon ?? "",
		});
	}
	return arr;
}

get printableActiveStatuses(): {name: string, description: string}[] {
	const effects= this.effects.contents;
	const statuses = effects
		.filter( eff=> eff.isStatus)
		.flatMap (eff => {
			return eff.statusTags.map( stTag=> ({
				name: stTag.name,
				description: stTag.description.toString() + "\n" + eff.statusDurationString()
			}));
		});
	const flags = effects
		.filter( eff=> eff.isFlag() && eff.statusDuration.dtype != "permanent")
		.map (eff => ({
			name: eff.name,
			description: eff.statusDurationString()
		}));
	return statuses.concat(flags);
}

isDMon() : boolean {
	if (this.cache.isDMon) {return this.cache.isDMon;}
	return this.cache.isDMon = this.isShadow() && (this.system.creatureType == "d-mon" ||  this.hasCreatureTag("d-mon"));
}

isPersona(): boolean {
	return this.isShadow() && (this.system.creatureType == "persona" ||  this.hasCreatureTag("persona"));
}

isCompendiumEntry(this: Shadow) : boolean {
	return this.isPersona() && this.system.personaConversion.compendiumId == this.id;
}

isCustomPersona(this: ValidAttackers): boolean {
	return this.isPersona() &&
		(	this.hasTag("custom-persona") || this.hasTag("lone-persona"));
}

knowsPowerInnately(this: ValidAttackers, power : Power)  : boolean{
	const powers = this.system.combat.powers;
	if (powers.includes(power.id)) {
		return true;
	}
	if (!this.isShadow()) {
		const sideboard =  this.system.combat.powers_sideboard;
		if (sideboard.includes(power.id)) {
			return true;
		}
	}
	const buffer= this.system.combat.learnedPowersBuffer;
	if (buffer.includes(power.id)) {
		return true;

	}
	return false;
}

hasSpaceToAddPowerToMain(this: ValidAttackers) : boolean {
	const powers = this.mainPowers;
	return (powers.length < this.basePersona.maxMainPowers);
}

hasSpaceToAddToSideboard(this: ValidAttackers): boolean {
	if (this.isShadow()) {return false;}
	const sideboard = this.sideboardPowers;
	return (sideboard.length < this.basePersona.maxSideboardPowers);
}

async _promotePowers(this: ValidAttackers) {
	await this._promotePowers_learnedToMain();
	await this._promotePowers_sideboardToMain();
	await this._promotePowers_learnedToSideboard();
}

get hasPowerSideboard() : boolean  {
	if (!this.isPC()) {return false;}
	return this.class.system.canUsePowerSideboard ?? false;
}

async _promotePowers_sideboardToMain(this: ValidAttackers) {
	if (!this.hasPowerSideboard) { return false;}
	while (this.hasSpaceToAddPowerToMain()) {
		const sideboard = this.sideboardPowers.at(0);
		if (sideboard && this.isPC()) {
			await this.retrievePowerFromSideboard(sideboard.id);
			continue;
		}
		break;
	}
}

async _promotePowers_learnedToMain(this: ValidAttackers) {
	while (this.hasSpaceToAddPowerToMain()) {
		const bufferPower = this.learnedPowersBuffer.at(0);
		if (bufferPower) {
			await this.moveFromBufferToMain(bufferPower);
			continue;
		}
		break;
	}
}

async _promotePowers_learnedToSideboard(this: ValidAttackers) {
	if (!this.hasPowerSideboard) { return false;}
	while (this.hasSpaceToAddToSideboard()) {
		const bufferPower = this.learnedPowersBuffer.at(0);
		if (bufferPower && !this.isShadow()) {
			await this.moveFromBufferToSideboard(bufferPower);
			continue;
		}
		break;
	}

}

async moveFromBufferToSideboard(this: PC | NPCAlly, power : Power) {
	let buffer = this.system.combat.learnedPowersBuffer;
	const sideboard = this.system.combat.powers_sideboard;
	sideboard.push(power.id);
	buffer = buffer.filter(x=> x != power.id);
	await this.update( {"system.combat.powers_sideboard": sideboard});
	await this.update( {"system.combat.learnedPowersBuffer": buffer});
}

async moveFromBufferToMain(this: ValidAttackers, power : Power) {
	let buffer = this.system.combat.learnedPowersBuffer;
	const mainPowers = this.system.combat.powers;
	mainPowers.push(power.id);
	buffer = buffer.filter(x=> x != power.id);
	await this.update( {"system.combat.powers": mainPowers});
	await this.update( {"system.combat.learnedPowersBuffer": buffer});
}

async tryToAddToMain(this: ValidAttackers, power: Power, logChanges = true) : Promise<boolean> {
	const powers = this.system.combat.powers;
	if (this.hasSpaceToAddPowerToMain()) {
		powers.push(power.id);
		await this.update( {"system.combat.powers": powers});
		if (this.isShadow() && !this.isPersona() && !this.isDMon()) {
			await this.addLearnedPower(power, this.level);
		}
		if (logChanges && this.hasPlayerOwner) {
			await Logger.sendToChat(`${this.name} learned Power: ${power.name}`);
		}
		return true;
	}
	return false;
}

async tryToAddToSideboard(this: ValidAttackers, power: Power, logChanges: boolean) : Promise<boolean> {
	if (this.isShadow()) {return false;}
	const sideboard =  this.system.combat.powers_sideboard;
	if (this.hasSpaceToAddToSideboard()) {
		sideboard.push(power.id);
		await this.update( {"system.combat.powers_sideboard": sideboard});
		if (logChanges && this.hasPlayerOwner) {
			await Logger.sendToChat(`${this.name} learned Power: ${power.name} (placed in sideboard)`);
		}
		return true;
	}
	return false;
}

async tryToAddToLearnedPowersBuffer(this: ValidAttackers, power: Power, logChanges: boolean) : Promise<boolean> {

	const buffer= this.system.combat.learnedPowersBuffer;
	buffer.push(power.id);
	await this.update( {"system.combat.learnedPowersBuffer": buffer});
	const maxMsg = `<br>${this.name} has exceeded their allowed number of powers (${this.maxPowers})  and must forget one or more powers.`;
	if (logChanges) {
		await Logger.sendToChat(`${this.name} learned ${power.name} ${maxMsg}` , this);
	}
	return true;
	// }
}

async _learnPower(this: ValidAttackers, power: Power, logChanges = true): Promise<boolean> {
	try {
		if (power.isNavigator()) {
			if (!this.isNPCAlly()) {
				PersonaError.softFail("Only NPC Allies can learn Navigator skills!");
				return false;
			}
			await this.addNavigatorSkill(power);
			return true;
		}
		if (this.knowsPowerInnately(power)) {
			ui.notifications.notify(`You already know ${power.displayedName}`);
			return true;
		}
		if (await this.tryToAddToMain(power, logChanges)) {
			return true;
		}
		if (await this.tryToAddToSideboard(power, logChanges)) {
			return true;
		}
		await this.tryToAddToLearnedPowersBuffer(power, logChanges);
		return true;
	} catch (e) {
		if (e instanceof Error) {
			PersonaError.softFail(`There was a problem adding power to ${this.name}: ${e.toString()} `);
		}
		return false;
	}
}

isUsingMetaPod(this: ValidAttackers): boolean {
	if (this.isShadow()) {return false;}
	return this.system.combat.usingMetaPod ?? true;
}

async checkForMissingLearnedPowers(this: Shadow) {
	if (!this.isShadow()) {return;}
	const powers = this.system.combat.powers;
	const learned= this.powerLearningList;
	const missing = powers
		.filter( pwr => !learned
			.some(learnedPwr => learnedPwr.power.id == pwr))
		.map (pwr=> PersonaDB.getPower(pwr))
		.filter (pwr=> pwr != undefined);
	for (const pwr of missing) {
		await this.addLearnedPower(pwr, this.system.personaConversion.startingLevel ?? this.system.combat.personaStats.pLevel);
	}
}

async addLearnedPower(this: ValidAttackers, power: Power, level = 99) : Promise<void> {
	const arr = this.system.combat.powersToLearn;
	arr.push( { powerId: power.id, level});
	await this.update({ "system.combat.powersToLearn": arr});
}


async deletePower(this: ValidAttackers, id: string ) {
	const item = this.items.find(x => x.id == id);
	if (item) {
		await item.delete();
		return true;
	}
	const result = await this.deletefromLearnBuffer(id)
		|| await this.deleteFromMainPowers(id)
		|| (this.isNPCAlly() ? await this.deleteNavigatorSkill(id) : undefined)
		|| (!this.isShadow() ? await this.deleteFromSideboard(id) : false) ;
	await this._promotePowers();
	return result;
}

async deleteLearnablePower(this: ValidAttackers, id: Power["id"])  {
	let learnables = this.system.combat.powersToLearn;
	learnables = learnables.filter(x=> x.powerId != id);
	await this.update({"system.combat.powersToLearn": learnables});
}

async deletefromLearnBuffer(this: ValidAttackers, id: Power["id"]) : Promise<boolean> {
	let buffer = this.system.combat.learnedPowersBuffer;
	const power = PersonaDB.getItemById(id) as Power;
	if (buffer.includes(id)) {
		buffer = buffer.filter( x=> x != id);
		await this.update( {"system.combat.learnedPowersBuffer": buffer});
		await Logger.sendToChat(`${this.name} chose to forget new power:  ${power.name}` , this);
		return true;
	}
	return false;
}

async deleteFromMainPowers(this: ValidAttackers, id: Power["id"]) {
	let powers = this.system.combat.powers;
	const power = PersonaDB.getItemById(id) as Power;
	if (powers.includes(id)) {
		powers = powers.filter( x=> x != id);
		await this.update( {"system.combat.powers": powers});
		// await this.checkMainPowerEmptySpace();
		if (this.hasPlayerOwner) {
			await Logger.sendToChat(`${this.name} deleted power ${power.name}` , this);
		}
		return true;
	}
	return false;
}

async deleteFromSideboard(this: PC | NPCAlly, id: Power["id"]) {
	let sideboard = this.system.combat.powers_sideboard;
	if (sideboard && sideboard.includes(id)) {
		const power = PersonaDB.getItemById(id) as Power;
		sideboard = sideboard.filter( x=> x != id);
		await this.update( {"system.combat.powers_sideboard": sideboard});
		await Logger.sendToChat(`${this.name} deleted sideboard power ${power.name}` , this);
		return true;
	}
	return false;
}

async checkSideboardEmptySpace(this: ValidAttackers) {
	if (this.isShadow()) {return;}
	while (this.sideboardPowers.length < this.persona().maxSideboardPowers) {
		const sideboard = this.system.combat.powers_sideboard;
		const buffer = this.system.combat.learnedPowersBuffer;
		if (buffer.length > 0) {
			const bufferItem = buffer.shift()!;
			sideboard.push(bufferItem);
			await this.update( {"system.combat.powers_sideboard": sideboard});
			await this.update( {"system.combat.learnedPowersBuffer" : buffer});
			continue;
		}
		break;
	}
}

async movePowerToSideboard(this: PC, powerId: Power["id"]) {
	if (!this.class.system.canUsePowerSideboard) {
		ui.notifications.error("You don't have a sideboard");
		return;
	}
	const newPowers = this.system.combat.powers
		.filter( id => id != powerId);
	await this.update({"system.combat.powers": newPowers});
	const sideboard = this.system.combat.powers_sideboard;
	sideboard.push(powerId);
	await this.update({"system.combat.powers_sideboard": sideboard});
	const power = PersonaDB.getItemById(powerId) as Power;
	await Logger.sendToChat(`${this.name} moved power ${power.name} to sideboard` , this);
}

async retrievePowerFromSideboard(this: PC, powerId: Power["id"]) {
	if (this.mainPowers.length >= this.basePersona.maxMainPowers) {
		ui.notifications.warn(`Can't have more than ${this.basePersona.maxMainPowers} main powers.`);
		return;
	}
	const newSideboard = this.system.combat.powers_sideboard
		.filter( id => id != powerId);
	await this.update({"system.combat.powers_sideboard": newSideboard});
	const powers = this.system.combat.powers;
	powers.push(powerId);
	await this.update({"system.combat.powers": powers});
	const power = PersonaDB.getItemById(powerId) as Power;
	await Logger.sendToChat(`${this.name} moved power ${power.name} out of sideboard` , this);
}

addFocus(this: PC, focus: Focus) {
	PersonaError.softFail(`Can't drop ${focus.name}. Focii are no longer supported on PCs`);
	return;
}

async deleteFocus(focusId: string) {
	const item = this.items.find(x => x.id == focusId);
	if (item) {
		await item.delete();
		return;
	}
	const actorType = this.system.type;
	switch (actorType) {
		case "npc": return;
		case "tarot": return;
		case "pc": case "shadow": case "npcAlly": {
			let foci = this.system.combat.focuses;
			if (!foci.includes(focusId)) {return;}
			foci = foci.filter( x=> x != focusId);
			return await this.update( {"system.combat.focuses": foci});
		}
		default:
			actorType satisfies never;
	}
}

async  setClass(this: ValidAttackers, cClass: CClass) {
	await this.update( {"system.combat.classData.classId": cClass.id});
	await Logger.sendToChat(`${this.displayedName} changes class to ${cClass.name}`);
}

hasPowerInhibitingStatus() : boolean {
	switch (true) {
		case this.hasStatus("rage"):
		case this.hasStatus("sealed"):
			return true;
	}
	return false;
}

canLearnNewSkill() : boolean {
	switch (this.system.type) {
		case "shadow":
		case "npc":
		case "tarot":
			return false;
		case "npcAlly":
		case "pc":
			return this.maxPowers - this.mainPowers.length - this.sideboardPowers.length >= 0;
		default:
			this.system satisfies never;
			return false;
	}
}

getSocialStat(this: PC, socialStat: SocialStat) : ModifierList {
	const stat = this.system.skills[socialStat];
	const mods = new ModifierList();
	const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
	mods.add(skillName, stat);
	return mods.concat(this.persona().getBonuses(socialStat));
}

async createSocialLink(this: PC, npc: SocialLink) {
	if (this.system.social.find( x=> x.linkId == npc.id)) {
		return;
	}
	this.system.social.push(
		{
			linkId: npc.id,
			linkLevel: 1,
			inspiration: 1,
			currentProgress: 0,
			relationshipType: "PEER",
			isDating: false,
		}
	);
	void PersonaSounds.newSocialLink();
	await this.update({"system.social": this.system.social});
	await Logger.sendToChat(`${this.name} forged new social link with ${npc.displayedName} (${npc.tarot?.name}).` , this);
}

get baseRelationship(): string {
	switch (this.system.type) {
		case "pc":
			return "PEER";
		case "npc": case "npcAlly":
			return "PEER";
		case "shadow":
		case "tarot":
			break;
		default:
			this.system satisfies never;
	}
	return "NONE";
}

async increaseSocialLink(this: PC, linkId: string) {
	const link = this.system.social.find( x=> x.linkId == linkId);
	if (!link) {
		throw new PersonaError("Trying to increase social link you don't have");
	}
	if (link.linkLevel >= 10) {
		throw new PersonaError("Social Link is already maxed out");
	}
	link.linkLevel +=1 ;
	link.inspiration = link.linkLevel;
	if (link.linkLevel == 10) {
		void PersonaSounds.socialLinkMax();
	} else {
		void PersonaSounds.socialLinkUp();
	}
	await this.update({"system.social": this.system.social});
	const target = game.actors.get(link.linkId) as NPC | PC;
	if (target) {
		await Logger.sendToChat(`${this.name} increased Social Link with ${target.displayedName} (${target.tarot?.name}) to SL ${link.linkLevel}.` , this);
	}
}

async decreaseSocialLink(this: PC, linkId: string) {
	const link = this.system.social.find( x=> x.linkId == linkId);
	if (!link) {
		throw new PersonaError("Trying to decrease social link you don't have");
	}
	if (link.linkLevel >= 10) {
		throw new PersonaError("Social Link is already maxed out");
	}
	link.linkLevel -=1 ;
	// link.currentProgress= 0;
	link.inspiration = link.linkLevel;
	void PersonaSounds.socialLinkReverse();
	if (link.linkLevel == 0) {
		const newSocial = this.system.social.filter( x=> x != link);
		await this.update({"system.social": newSocial});
		return;
	}
	await this.update({"system.social": this.system.social});
}

getSocialLinkProgress(this: PC, linkId: string) : number {
	const link = this.system.social.find( x=> x.linkId == linkId);
	if (!link) {
		return 0;
	}
	return link.currentProgress;
}

async alterSocialLinkProgress(this: PC, linkId: string, progress: number) {
	return await this.socialLinkProgress(linkId, progress);
}

async socialLinkProgress(this: PC, linkId: string, progress: number) {
	const link = this.system.social.find( x=> x.linkId == linkId);
	if (!link) {
		PersonaError.softFail("Trying to increase social link you don't have");
		return;
	}
	const orig = link.currentProgress;
	link.currentProgress = Math.max(0,progress + link.currentProgress);
	if (progress > 0) {
		link.inspiration = link.linkLevel;
	}
	const linkActor = game.actors.get(link.linkId);
	switch (progress) {
		case 1: void PersonaSounds.socialBoostJingle(1);
			break;
		case 2: void PersonaSounds.socialBoostJingle(2);
			break;
		case 3: void PersonaSounds.socialBoostJingle(3);
			break;
	}
	await this.update({"system.social": this.system.social});
	await Logger.sendToChat(`${this.name} added ${progress} progress tokens to link ${linkActor?.name} (original Value: ${orig})` , this);
}

async activityProgress(this: PC, activityId :string, progress: number) {
	const activityData = this.system.activities.find( x=> x.linkId == activityId);
	if (!activityData) {
		PersonaError.softFail("Trying to increase activty you don't have");
		return;
	}
	const orig = activityData.currentProgress;
	activityData.currentProgress = Math.max(0,progress + activityData.currentProgress);
	await this.update({"system.activities": this.system.activities});
	const activity = PersonaDB.allActivities().find( act=> act.id == activityId);
	await Logger.sendToChat(`${this.name} added ${progress} progress tokens to ${activity?.name ?? "unknown activity"} (original Value: ${orig})` , this);

}

async activityStrikes(this: PC, activityId: string, strikes: number) {
	const activityData = this.system.activities.find( x=> x.linkId == activityId);
	if (!activityData) {
		throw new PersonaError("Trying to increase activty you don't have");
	}
	const orig = activityData.strikes;
	activityData.strikes = Math.max(0,strikes + activityData.strikes);
	await this.update({"system.activities": this.system.activities});
	const activity = PersonaDB.allActivities().find( act=> act.id == activityId);
	await Logger.sendToChat(`${this.name} added ${strikes} strikes to ${activity?.name ?? "unknown activity"} (original Value: ${orig})` , this);
}

async refreshSocialLink(this: PC, npc: SocialLink) {
	const link = this.system.social.find( x=> x.linkId == npc.id);
	if (!link) {
		throw new PersonaError(`Trying to refresh social link ${this.name} doesn't have: ${npc.name} `);
	}
	link.inspiration = link.linkLevel;
	await this.update({"system.social": this.system.social});
}

async spendInspiration(this: PC, linkId:string, amt?: number) : Promise<void> ;
async spendInspiration(this: PC, socialLink:SocialLink , amt?: number): Promise<void> ;

async spendInspiration(this: PC, socialLinkOrId:SocialLink | string, amt: number = 1): Promise<void> {
	const id = typeof socialLinkOrId == "string" ? socialLinkOrId : socialLinkOrId.id;
	const link = this.system.social.find( x=> x.linkId == id);
	if (!link) {
		throw new PersonaError("Trying to refresh social link you don't have");
	}
	if (link.inspiration <= 0) {
		throw new PersonaError("You are trying to spend Inspiration you don't have");
	}
	link.inspiration -= amt;
	link.inspiration = Math.max(0, link.inspiration);
	link.inspiration = Math.min(link.linkLevel, link.inspiration);
	await this.update({"system.social": this.system.social});
}

getInspirationWith(linkId: SocialLink["id"]): number {
	if (this.system.type != "pc") {return 0;}
	const link = this.system.social.find( x=> x.linkId == linkId);
	if (!link) {return 0;}
	return link.inspiration;
}

async addInspiration(this:PC, linkId:SocialLink["id"], amt: number) {
	const link = this.system.social.find( x=> x.linkId == linkId);
	if (!link) {
		throw new PersonaError("Trying to refresh social link you don't have");
	}
	link.inspiration += amt;
	link.inspiration = Math.min(link.linkLevel, link.inspiration);
	await this.update({"system.social": this.system.social});
}

getSocialFocii_PC(this: NPC, linkHolder: SocialLink, targetPC: PC) : Focus[] {
	const sortFn = function (a: Focus, b: Focus) {
		return a.requiredLinkLevel() - b.requiredLinkLevel();
	};
	const focii = this.items.filter( x=> x.isFocus()) as Focus[];
	const tarot = targetPC.tarot;
	if (!tarot) {
		console.debug(`No tarot found for ${this.name} or ${linkHolder.name}`);
		return focii.sort( sortFn);
	}
	const tarotFocii = tarot.items.filter( x=> x.isFocus()) as Focus[];
	return focii.concat(tarotFocii).sort(sortFn);
}

getSocialFocii_NPC(this: NPC, linkHolder: SocialLink) : Focus[] {
	const sortFn = function (a: Focus, b: Focus) {
		return a.requiredLinkLevel() - b.requiredLinkLevel();
	};
	const focii = this.items.filter( x=> x.isFocus()) as Focus[];
	const tarot = this.tarot ?? linkHolder.tarot;
	if (!tarot) {
		console.debug(`No tarot found for ${this.name} or ${linkHolder.name}`);
		return focii.sort( sortFn);
	}
	const tarotFocii = tarot.items.filter( x=> x.isFocus()) as Focus[];
	return focii.concat(tarotFocii).sort(sortFn);
}

getAllSocialFocii() : Focus[] {
	switch (this.system.type) {
		case "pc":
			return this.socialLinks.flatMap( link => {
				return link.focii;
			});
		case "npcAlly":
			return []; //coming soon
		case "shadow":
		case "npc":
		case "tarot":
			return [];
		default:
			this.system satisfies never;
			return [];
	}
}

getEffects(this: ValidAttackers, CETypes ?: TypedConditionalEffect['conditionalType'][] ) : readonly SourcedConditionalEffect[] {
	const mods =  this.persona().mainModifiers();
	if (!CETypes || CETypes.length == 0) {
		return mods;
	}
	return mods.filter ( mod => CETypes.includes(mod.conditionalType)) ;
}

canEngage() :boolean {
	return !this.isDistracted() && this.isCapableOfAction();
}

canAllOutAttack(): boolean {
	if (this.hp < 0) {return false;}
	if (this.isDistracted()) {return false;}
	if (!this.isCapableOfAction()) {return false;}
	if (this.hasBanefulStatus()) {return false;}
	return true;
}

hasBanefulStatus(): boolean {
	return Boolean(this.effects.find( (st) => st.isBaneful));
}

getSaveBonus( this: ValidAttackers) : ModifierList {
	const mods = this.mainModifiers()
		.filter( x => x.conditionalType == "passive" || x.conditionalType == "defensive");
	const modsProcessed = PersonaItem.getModifier(mods, "save");
	return new ModifierList(modsProcessed);
}

getDisengageBonus( this: ValidAttackers) : ModifierList {
	const mods = this.mainModifiers()
		.filter( x => x.conditionalType == "passive" || x.conditionalType == "defensive");
	const modsProcessed= PersonaItem.getModifier(mods, "disengage");
	return new ModifierList(modsProcessed);
}

/** returns current team (taking into account charm)*/
getAllegiance()  : Team {
	if (!this.isValidCombatant()) {return "Neutral";}
	switch (this.system.type) {
		case "pc":
			if (!this.hasPlayerOwner) {return "Neutral";}
			return "PCs";
		case "shadow":
			if (this.hasPlayerOwner) {return "PCs";}
			return "Shadows";
		case "npcAlly":
			return "PCs";
		default:
			this.system satisfies never;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			PersonaError.softFail(`Unknown type of actor, ${(this as any)?.system?.type}`);
			return "Neutral";
	}
}

async expendConsumable(item: Carryable, amountUsed = 1) {
	// if (item.system.type == "power") {
	// 	PersonaError.softFail("Can't expend a power, this function requires an item");
	// 	return;
	// }
	const amount = item.system.amount;
	if (amount <= amountUsed) {
		await item.delete();
		return;
	}
	if (amount > amountUsed) {
		await item.update({"system.amount": amount-amountUsed});
		return;
	}
}

roomModifiers() : ModifierContainer[] {
	return (game.combats.contents as PersonaCombat[])
		.filter(combat => combat.combatants.contents
			.some( comb => comb.actor == this)
		).flatMap( combat=> combat.getRoomEffects());
}

/** used for determining all out attack viability*/
isStanding() : boolean {
	return (this.hp > 0 && !this.statuses.has("down"));
}

isValidCombatant(): this is ValidAttackers {
	switch (this.system.type) {
		case "pc":
			return this.isRealPC();
		case "shadow":
		case "npcAlly":
			return true;
		case "npc":
		case "tarot":
			return false;
		default:
			this.system satisfies never;
			return false;
	}
}

isDistracted() : boolean {
	return Boolean(this.effects.find( st => st.isDistracting));
}

isCapableOfAction() : boolean {
	if (this.effects.find( st=> st.isIncapacitating)) {return false;}
	return this.hp > 0;
}

async fullHeal() {
	if (this.isValidCombatant()) {
		await this.setHP(this.mhp);
		if (this.system.type == "pc" || this.system.type == "npcAlly") {
			const mmp = this.mmp;
			if (this.system.combat.mp.value != mmp) {
				await this.update({"system.combat.mp.value" : mmp});
			}
		}
		await this.refreshTrackers();
	}
}

async onEnterMetaverse()  : Promise<void> {
	if (!this.isValidCombatant()) {return;}
	if (this.system.type == "pc" && !this.hasPlayerOwner) {return;} //deal with removing item piles and such
	try {
		await this.fullHeal();
		if (this.system.type == "pc") {
			await (this as PC).refreshSocialLink(this as PC);
		}
		const situation : Situation = {
			trigger: "enter-metaverse",
			triggeringUser: game.user,
			triggeringCharacter: this.accessor,
			user: this.accessor,
		};
		await TriggeredEffect
			.autoApplyTrigger("enter-metaverse", this, situation);
		// await TriggeredEffect
		// 	.onTrigger("enter-metaverse", this, situation)
		// 	.emptyCheck()
		// 	?.autoApplyResult();
	} catch (e) {
		console.log(e);
		PersonaError.softFail(`problem with onEnterMetaverse for ${this.name}`, e);
	}
}

async endEffectsOfDurationOrLess( duration: StatusDuration) : Promise<ActiveEffect[]> {
	const removed : ActiveEffect[] = [];
	for (const eff of this.effects) {
		if (eff.durationLessThanOrEqualTo(duration)) {
			removed.push(eff);
			await eff.delete();
		}
	}
	return removed;
}

async onExitMetaverse(this: ValidAttackers ) : Promise<void> {
	try {
		if (this.isPC() && !this.isRealPC()) {return;} //skip fake PCs like itempiles and the party token
		if (this.isRealPC()) {
			let fatigue = (this.tarot?.name == "Strength") ?
				0 : -1;
			if (this.hasStatus("full-fade")) {
				await this.removeStatus("full-fade");
				fatigue -= 2;
			}
			await this.alterFatigueLevel(fatigue);
			await this.refreshSocialLink(this);
		}
		if (this.isNPCAlly()) {
			if (this.hasStatus("full-fade")) {
				await this.alterFatigueLevel(-2);
			}
		}
		await this.fullHeal();
		await this.endEffectsOfDurationOrLess( {dtype :"expedition"});
		await TriggeredEffect.autoApplyTrigger("exit-metaverse", this);
	} catch (e) {
		Debug(e);
		console.log(e);
		ui.notifications.error(`problem with OnExitMetaverse for ${this.name}`);
	}
}

async onLevelUp_checkLearnedPowers(this: ValidAttackers, newLevel: number, logChanges= true) : Promise<void> {
	if (!newLevel) {return;}
	const powersToLearn = this.powerLearningList
	.slice()
	.sort( (a,b) => a.level - b.level);
	for (const powerData of powersToLearn) {
		if (newLevel < (powerData.level ?? Infinity) ){
			continue; }
		await this._learnPower(powerData.power, logChanges);
	}
	await this.update( {"system.combat.lastLearnedLevel": newLevel});
}

async onLevelUp_BasePersona(this: ValidAttackers, newLevel: number) : Promise<void> {
	if (this.isNPCAlly() || this.isShadow()) {
		await this.basePersona.combatStats.autoSpendStatPoints();
	}
	await this.onLevelUp_checkLearnedPowers(newLevel);
}

async levelUp_manual(this: ValidAttackers) : Promise<void> {
	if (this.isPC()) {
		const currXP = this.system.personalXP;
		const XPForNext = LevelUpCalculator.minXPForEffectiveLevel(this.system.personaleLevel + 1);
		const XPNeeded = XPForNext - currXP;
		console.log(`${this.name} XP needed: ${XPNeeded}`);
		await this.awardPersonalXP(XPNeeded, false);
	}
	await this.basePersona.levelUp_manual();
}

async resetIncrementals(this: ValidAttackers) {
	const incremental : PC["system"]["combat"]["classData"]["incremental"] = {
		hp: 0,
		mp: 0,
		attack: 0,
		defense: 0,
		magicLow: false,
		magicHigh: false,
		talent: false,
		wpnDamage: 0,
		initiative: 0,
	};
	await this.update({
		"system.combat.classData.incremental": incremental,
	});
}

meetsSLRequirement (this: PC, focus: Focus) {
	return this.system.social.some( link=>
		link.linkId == focus.parent?.id
		&& link.linkLevel >= focus.requiredLinkLevel()
	);
}

isFullyFaded(this: ValidAttackers, newhp?:number) : boolean {
	switch (this.system.type) {
		case "shadow":
			return (newhp ?? this.hp) <= 0;
		case "pc":
		case "npcAlly":
				return this.hasStatus("full-fade");
			// return this.system.combat.fadingState >= 2;
		default:
			this.system satisfies never;
			return true;
	}
}

isFading(this: ValidAttackers): boolean {
	if (this.system.type == "shadow") {return false;}
	return this.hp <= 0 && !this.hasStatus("full-fade");
}


triggersOn( trigger : Trigger) : SourcedConditionalEffect[] {
	const triggers= this.triggers;
	return triggers.filter( CE => PersonaItem.triggersOn(CE, trigger));
}

get triggers() : SourcedConditionalEffect[] {
	switch (this.system.type ) {
		case "npc":
		case "tarot":
			return [];
		case "pc":
		case "shadow":
		case "npcAlly":
			return (this as ValidAttackers).mainModifiers().filter( x=> x.conditionalType == "triggered");
		default:
			this.system satisfies never;
			return [];
	}
}

async increaseFadeState( this: ValidAttackers) {
	switch (true) {
		case this.hasStatus("full-fade"):
			return "full-fade";
		case this.hasStatus("fading"):
			await this.removeStatus("fading");
			await this.addStatus( {
				id: "full-fade",
				duration: {dtype: "permanent"}
			});
			return "full-fade";
		default :
			await this.addStatus( {
				id: "fading",
				duration: {dtype: "combat"}
			});
	}
}

async clearFadingState( this: ValidAttackers) {
	await this.removeStatus("fading");
	// await this.removeStatus("full-fade");
}

async alterSocialSkill (this: PC, socialStat: SocialStat, amt: number, logger = true) {
	const oldval = this.system.skills[socialStat];
	const newval = oldval + amt;
	const upgradeObj : Record<string, unknown> = {};
	const skillLoc = `system.skills.${socialStat}`;
	upgradeObj[skillLoc] = newval;
	await this.update(upgradeObj);
	if (logger) {
		switch (amt) {
			case 1: case 2: case 3:
				await PersonaSounds.skillBoost(amt);
		}
		const verb = amt >= 0 ? "raised" : "lowered";
		await Logger.sendToChat(`<b>${this.name}:</b> ${verb} ${socialStat} by ${amt} (previously ${oldval})`, this);
	}
}

async gainMoney(this: PC, amt: number, log :boolean, breakLimit = false) {
	if (amt < 0) {
		return this.spendMoney(amt);
	}
	if (amt > 200 && !breakLimit) {
		throw new PersonaError("Can't get this much money at once!");
	}
	const resources = this.system.money + amt;
	await this.update({ "system.money": resources});
	if (log && amt > 0) {
		await Logger.sendToChat(`${this.name} Gained ${amt} resource points`);
		await PersonaSounds.ching();
	}
}

async spendMoney(this: PC, amt: number) {
	if (amt > this.system.money) {
		throw new PersonaError("You don't have that much money!");
	}
	const amount = Math.abs(amt);
	const resources = this.system.money - amount;
	await this.update({ "system.money": resources});
	await Logger.sendToChat(`${this.name} spent ${amount} resource points`);
	await PersonaSounds.ching();
}

isAlive(): boolean {
	if (this.system.type == "npc") {return true;}
	return this.hp > 0;
}

async resetAvailability( this: SocialLink, day: SimpleCalendar.WeekdayName) {
	const avail = this.system.weeklyAvailability[day];
	await this.setAvailability(avail);
}

async setAvailability(this: SocialLink, bool: boolean) {
	if (this.system.weeklyAvailability.available == bool) {return;}
	if (game.user.isGM || this.isOwner) {
		//possible fix for the update seemingly not taking effect in time despite the await
		this.system.weeklyAvailability.available = bool;
		await	this.update( {"system.weeklyAvailability.available": bool});
	} else {
		PersonaSocial.requestAvailabilitySet(this.id, bool);
	}
}
get tarot() : (Tarot | undefined) {
	if (this.cache.tarot != undefined) {
		if (this.cache.tarot.name == "") {return undefined;}
		return this.cache.tarot;
	}
	switch (this.system.type) {
		case "shadow":
		case "pc": {
			if (this.system.tarot == "")
			{return this.cache.tarot = undefined;}
			const PC = this as PC | Shadow;
			this.cache.tarot = PersonaDB.tarotCards().find(x=> x.name == PC.system.tarot);
			break;
		}
		case "npcAlly":
			if (this.system.tarot.length > 0) {
				this.cache.tarot = PersonaDB.tarotCards().find(x=> x.name == (this as NPCAlly).system.tarot);
				break;
			}
			if (this.system.NPCSocialProxyId) {
				const actor = PersonaDB.socialLinks().find( x=> x.id == (this as NPCAlly).system.NPCSocialProxyId);
				if (actor) {return actor.tarot;}
			}
			//switch fallthrough is deliberate here
		case "npc": {
			if (this.system.tarot == "")
			{return undefined;}
			// console.debug("cached value no good (NPC)");
			const NPC = this as NPC;
			if (
				NPC == PersonaDB.personalSocialLink()
				|| NPC == PersonaDB.teammateSocialLink()
			) {
				return undefined;
			}
			this.cache.tarot =  PersonaDB.tarotCards().find(x=> x.name == NPC.system.tarot);
			break; }
		case "tarot":
			return this as Tarot;
		default:
			this.system satisfies never;
			return undefined;
	}
	return this.cache.tarot;
}

numOfIncAdvances(): number {
	switch (this.system.type) {
		case "npc":
		case "tarot":
			return 0;
	}
	const advances = this.system.combat.classData.incremental;
	return Object.values(advances).reduce<number>( (a, x) => {
		if (typeof x == "boolean" && x == true) {return a + 1;}
		if (typeof x == "number") {return a + x;}
		return a;
	}, 0);
}

get XPForNextLevel() : number {
	if (!this.isPC()) {return 999999;}
	const lvl = this.system.personaleLevel;
	return LevelUpCalculator.XPRequiredToAdvanceToLevel(lvl+1);
}

get personalXPTowardsNextLevel() : number {
	if (!this.isPC()) {return -1;}
	const lvl = this.system.personaleLevel;
	return this.system.personalXP - LevelUpCalculator.minXPForEffectiveLevel(lvl);
}

issues() : string {
	const issues : string[] = [];
	if (this.basePersona.isUnderResistCap || this.basePersona.isOverResistCap)
	{issues.push("Resists");}
	return issues.join("/");
}

totalResists (this:ValidAttackers) : number {
	const pcTranslator : Record<typeof resists["cold"], number> = {
		weakness: -2,
		normal: 0,
		resist: 1,
		block: 2,
		absorb: 3,
		reflect: 3
	} as const;

	const physicalTranslator : Record<typeof resists["cold"], number> = {
		weakness: -3,
		normal: 0,
		resist: 2,
		block: 3,
		absorb: 4,
		reflect:4,
	};
	const shadowTranslator : Record<typeof resists["cold"], number> = {
		weakness: -2.5,
		normal: 0,
		resist: 1,
		block: 2,
		absorb: 2.5,
		reflect:2.5,
	} as const;
	const shadow = this.isShadow() && !this.isCustomPersona();
	const resistTranslator = shadow ? shadowTranslator : pcTranslator;
	const resists = this.system.combat.resists;
	const entries = Object.entries(resists) as [keyof typeof resists, typeof resists["cold"]][];
	return Math.round(entries.reduce(
		function (acc, [k,res]) {
			return acc + (k != "physical"
				? resistTranslator[res]
				: physicalTranslator[res]
			);
		},0 )
	);
}

maxIncrementalAdvances(this: ValidAttackers): number {
	const x= Object.keys(this.system.combat.classData.incremental) as (keyof ValidAttackers["system"]["combat"]["classData"]["incremental"])[] ;
	return x.reduce ( (acc,k) => acc + this.maxIncrementalAdvancesInCategory(k)
		, 0);
}

maxIncrementalAdvancesInCategory(this: ValidAttackers, incrementalType: keyof ValidAttackers["system"]["combat"]["classData"]["incremental"]): number {
	const v = this.system.combat.classData.incremental[incrementalType];
	// const incremental = k;
	if (typeof v == "boolean") {return 1;}
	//@ts-expect-error doing complicated schema stuff not in foundrytypes
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const x = this.system.schema.fields.combat.fields.classData.fields.incremental.fields[incrementalType] as {max ?: number};
	if (typeof x?.max == "number")
	{return x.max;}
	PersonaError.softFail("Trouble calculating max incremental advances");
	return 0;
}

get personalELevel() : number {
	if (!this.isPC()) {return 0;}
	return this.system.personaleLevel;
}

get personalXP(): number {
	if (!this.isPC() ) {return 0;}
	return this.system.personalXP;
}

get XPForNextPersonalLevel() : number {
	if (this.isPC()) {
		return LevelUpCalculator.XPRequiredToAdvanceToLevel(this.personalLevel + 1);
	}
	if (this.isNPCAlly()) {
		return LevelUpCalculator.XPRequiredToAdvanceToLevel(this.basePersona.level + 1);
	}
	return 99999999;
}


async awardPersonalXP(this: ValidAttackers, amt: number, allowMult= true) : Promise<U<XPGainReport>> {
	if (!this.isPC() ) {return undefined;}
	if (!amt) {return;}
	const situation =  {
		user: this.accessor,
	};
	if (allowMult) {
		amt = amt * this.getPersonalBonuses("xp-multiplier").total(situation, "percentage");
	}
	const currentXP = this.system.personalXP;
	const newTotal = currentXP + amt;
	if (!PersonaSettings.freezeXPGain()) {
		await this.update({"system.personalXP": newTotal});
	}
	const levelsGained = LevelUpCalculator.levelsGained(this, newTotal);
	if (levelsGained > 0) {
		const currLvl = this.system.personaleLevel;
		const newlvl = currLvl + levelsGained;
		if (!PersonaSettings.freezeXPGain()) {
			await this.update({"system.personaleLevel" : newlvl});
		}
	}
	return {
		name: this.name,
		amount: amt,
		leveled: levelsGained > 0,
	};
}

/**gains X amount of levels */
async gainLevel(this: ValidAttackers, amt: number) : Promise<void> {
	if (this.isNPC()) {
		const proxy = this.getNPCAllyProxy();
		if (!proxy) {return;}
		return proxy.gainLevel(amt);
	}
	if (!this.isPC()) {return;}
	const currLevel = this.system.personaleLevel;
	const newLevel = amt + currLevel;
	const neededXP = LevelUpCalculator.minXPForEffectiveLevel(newLevel);
	if (!PersonaSettings.freezeXPGain()) {
		await this.update( {
			"system.personalXP" : neededXP,
			"system.personaleLevel": newLevel
		});
		await Logger.sendToChat(`${this.displayedName} gained ${amt} levels`);
	}
}

/** returns true on level up */
async awardXP(this: ValidAttackers, amt: number) : Promise<XPGainReport[]> {
	if (PersonaDB.getNavigator() == this) {
		const navigatorXP = this.persona().getBonuses("navigator-xp-mult").total({user: this.accessor});
		amt = Math.clamp(navigatorXP, 0.1, 1) * amt;
	}
	if (amt ==0) {return [];}
	const personaXPAwards = this.personaList.map<Promise<U<XPGainReport>>>( persona=> persona.awardXP(amt));
	const personaGains = (await Promise.allSettled(personaXPAwards))
	.map( pr => pr.status == "fulfilled" ? pr.value : undefined);
	const possibleLevelUps : U<XPGainReport>[] = [
		await this.awardPersonalXP(amt),
		...personaGains,
	];
	return possibleLevelUps.filter(x=> x != undefined);
}

XPValue(this: ValidAttackers) : number {
	if (!this.isShadow()) {return 0;}
	if (this.hasCreatureTag("no-xp")) {return 0;}
	const persona = this.basePersona;
	const pLevel = persona.pLevel;
	const xpValue = LevelUpCalculator.shadowXPValue(pLevel);
	const xpMult = persona.getBonuses("shadow-xp-value").total ( {user: this.accessor}, "percentage");
	return xpValue * xpMult;
}

maxActions(this: ValidAttackers): number  {
	return Math.max(0, 1 + this.persona().getBonuses("actions-per-turn").total( {user: this.accessor}));
}

async refreshActions(): Promise<number> {
	switch (this.system.type) {
		case "tarot":
		case "npc":
			return 0;
		case "pc":
		case "shadow":
		case "npcAlly":
			break;
		default:
			this.system satisfies never;
	}
	const maxActions = (this as ValidAttackers).maxActions();
	await this.update({"system.combat.actionsRemaining": maxActions});
	return maxActions;
}

async expendAction(this: ValidAttackers): Promise<number> {

	let actions = this.system.combat.actionsRemaining ?? 1;
	if (this.hasStatus("bonus-action")) {
		await this.removeStatus("bonus-action");
		return actions;
	}
	actions = Math.max(0, actions-1);
	await this.update({"system.combat.actionsRemaining": actions});
	return actions;
}

get actionsRemaining(): number {
	return this.isValidCombatant()
		? this.system.combat.actionsRemaining
		: 0;
}

get perk() : string {
	switch (this.system.type) {
		case "pc":
			return this.tarot?.perk ?? "";
		case "shadow":
				return "";
		case "npc":
		case "npcAlly":
			return this.tarot?.perk ?? "";
		case "tarot":
				return this.system.perk;
		default: {
			this.system satisfies never;
			return "";
		}
	}
}

getEffectFlag(flagId: string) : FlagData | undefined {
	const flag= this.effects.find(eff=> eff.flagId?.toLowerCase() == flagId.toLowerCase());
	if (flag) {return {
		flagId,
		duration: flag.statusDuration,
		flagName: flag.name,
		AEId: flag.id,
	};}
}

//** returns true if shadow has one of the roles in the array */
hasRole( roles: Shadow["system"]["role"] | Shadow["system"]["role"][]): boolean {
	if (this.system.type != "shadow") {return false;}
	if (!Array.isArray(roles)) {
		roles = [roles];
	}
	const shadow = this as Shadow;
	return roles.some( role => {
		return shadow.system.role == role
			|| shadow.system.role2 == role;
	});
}

isSoloType() : boolean {
	return this.hasRole("solo");
}

hasDefenderAura(): boolean {
	return this.statuses.has("sticky");
}

canUseOpener(): boolean {
	//TODO: placeholder
	return true;
}

isBossOrMiniBossType() : boolean {
	if (this.system.type != "shadow") {return false;}
	const bossRoles : Shadow["system"]["role"][] = [
		"miniboss", "boss", "solo",
	];
	return bossRoles.some( role => this.hasRole(role));
}

async onStartCombatTurn(this: ValidAttackers): Promise<string[]> {
	console.log(`${this.name} on Start turn`);
	const ret = [] as string[];
	const promises = this.effects.contents.map( async (eff) => {
		if ( await eff.onStartCombatTurn()) {
			return eff.displayedName;
		}
		return "";
	});
	try {
		const strings = (await Promise.all(promises))
			.filter( x=> x && x.length > 0)
			.join(", ");
		if (strings.length > 0) {
			ret.push(`Conditions Removed: ${strings}`);
		}
	} catch (e) {
		const msg = `Error resolving conditions at start of turn`;
		ret.push(msg);
		PersonaError.softFail(msg, e);
	}
	return ret;
}

async onEndCombatTurn(this : ValidAttackers) : Promise<string[]> {
	const ret: string[]= [];
	if (!this.isOwner) {
		PersonaError.softFail(`Illegal access of onEndCombatTurn, you are not the owner of ${this.displayedName}`);
		return ret;
	}
	const burnStatus = this.effects.find( eff=> eff.statuses.has("burn"));
	if (burnStatus) {
		const damage = burnStatus.potency;
		await this.modifyHP(-damage);
	}
	this.hasStatus("burn");
	const despair = this.hasStatus("despair");
	if (despair && !this.isShadow() ) {
		await this.modifyMP(-this.despairMPDamage());
	}
	if (this.isShadow()) {
		const situation : Situation = {
			user: this.accessor,
			activeCombat: true,
		};
		let bonusEnergy = 3 + this.persona().getBonuses("energy-per-turn").total(situation);
		if (despair) {
			bonusEnergy = Math.floor(bonusEnergy/2);
		}
		await this.alterEnergy(bonusEnergy);
	}
	ret.push(...await this.endTurnStatusEffects());
	return ret;
}

despairMPDamage(this: PC | NPCAlly): number {
	return Math.floor(this.mmp * 0.15);
}

/** should get called after a search action or after entering a new region*/
async onMetaverseTimeAdvance(): Promise<string[]> {
	const ret: string[] = [];
	for (const eff of this.effects) {
		if ( await eff.onMetaverseTimeAdvance()) {
			ret.push(`Removed Condition ${eff.displayedName} at start of turn`);
		}
	}
	return ret;
}

socialEffects(this: SocialLink) : readonly SourcedConditionalEffect[] {
	// weird bug where sometimes the this isn't set properly
	return ConditionalEffectManager.getEffects(this?.system?.socialEffects ?? [],null, this );
}

async resetFatigueChecks(this: PC) {
	if (this.hasAlteredFatigueToday() || this.hasMadeFatigueRollToday()) {
		await this.update({
			"system.fatigue.hasAlteredFatigueToday": false,
			"system.fatigue.hasMadeFatigueRollToday" : false
		});
	}
}

async onEndDay(this: PC): Promise<string[]> {
	const ret = [] as string[];
	for (const eff of this.effects) {
		if (await eff.onEndSocialTurn())
		{ret.push(`Removed Condition ${eff.displayedName} at end of day.`);}
	}
	// ret.push(...await this.fatigueRecoveryRoll());
	await this.resetFatigueChecks();
	return ret;
}

async onEndSocialTurn(this: PC) : Promise<string[]> {
	const ret = [] as string[];
	for (const eff of this.effects) {
		if (await eff.onEndSocialTurn())
		{ret.push(`Removed Condition ${eff.displayedName} at end of social turn`);}
	}
	return ret;
}

async onEndCombat(this: ValidAttackers) : Promise<void> {
	for (const eff of this.effects) {
		await eff.onEndCombat();
	}
}

encounterSizeValue() : number {
	let val = 1;
	if (!this.isValidCombatant()) {return 0;}
	const sit : Situation = {
		user: this.accessor,
	};
	const mult = this.persona().getBonuses("encounter-size-multiplier").total(sit, "percentage");
	val *= mult;
	if (this.isNewEnemy() && !this.hasRole("solo")) {val *= 1.2;}
	return val;
}

isNewEnemy(): boolean {
	if (!this.isShadow()) {return false;}
	return this.system.encounter.timesDefeated == 0 && this.persona().scanLevelRaw == 0;
}

async onDefeat(this: ValidAttackers) {
	if (this.isShadow()) {
		const defeat = this.system.encounter.timesDefeated+ 1;
		await this.update( {"system.encounter.timesDefeated": defeat});
	}
}

async endTurnStatusEffects(this: ValidAttackers) : Promise<string[]> {
	const ret = [] as string[];
	for (const eff of this.effects) {
		if (await eff.onEndCombatTurn()) {
			ret.push(`Removed Condition ${eff.displayedName} at end of turn`);
		}
	}
	return ret;
}

getFlagState(flagName: string) : boolean {
	return Boolean(this.getEffectFlag(flagName));
}

getFlagDuration(flagName: string) : StatusDuration | undefined {
	return this.getEffectFlag(flagName)?.duration;
}

async setEffectFlag(effect: Omit<SetFlagEffect, "type">) {
	if (effect.state == true) {
		const flag = await this.createEffectFlag(effect.flagId, effect.duration, effect.flagName);
		if (effect.embeddedEffects!.length> 0) {
			await flag.setEmbeddedEffects(effect.embeddedEffects!);
		}
	} else {
		await this.clearEffectFlag(effect.flagId);
	}
}

async createEffectFlag(flagId: string, duration: StatusDuration = {dtype: "instant"}, flagName ?: string) : Promise<PersonaAE> {
	flagId = flagId.toLowerCase();
	const eff = this.effects.find(x=> x.isFlag(flagId));
	const newAE = {
		name: flagName,
	};
	if (eff) {
		await eff.setDuration(duration);
		return eff;
	} else {
		const AE = (await  this.createEmbeddedDocuments("ActiveEffect", [newAE]))[0] as PersonaAE;
		await AE.setDuration(duration);
		await AE.markAsFlag(flagId);
		return AE;
	}
}

async clearEffectFlag(flagId: string) {
	const eff = this.effects.find(x=> x.isFlag(flagId));
	if (eff) {await eff.delete();}
}

async setRelationshipType(this: PC, socialLinkId: string, newRelationshipType: string) {
	const link = this.system.social.find(x=> x.linkId == socialLinkId);

	if (!link) {
		throw new PersonaError(`Can't find link for Id ${socialLinkId}`);
	}
	link.relationshipType = newRelationshipType;
	await this.update({"system.social": this.system.social});
}

isSpecialEvent(this:SocialLink, numberToCheck: number) : boolean {
	if (this.system.type == "pc") {return false;}
	const peices = (this.system.specialEvents ?? "").split(",", 20).map(x=> Number(x?.trim() ?? ""));
	return peices.includes(numberToCheck);
}

async createNewTokenSpend(this: SocialLink) {
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

async deleteTokenSpend(this: SocialLink, deleteIndex:number) {
	const list = this.system.tokenSpends;
	list.splice(deleteIndex,1);
	await this.update({"system.tokenSpends":list});
}

isAvailable(pc: PersonaActor) : boolean {
	switch (this.system.type) {
		case "shadow":
		case "tarot":
			return false;
		case "npc": case "npcAlly": {
			const npc = this as NPC | NPCAlly;
			const sit: Situation = {
				user: (pc as PC).accessor,
				socialTarget: npc.accessor,
			};
			if(!testPreconditions(npc.getAvailabilityConditions(), sit)) {
				return false;
			}
			break;
		}
		case "pc":
			break;
		default:
			this.system satisfies never;
	}
	if (PersonaSocial.disqualifierStatuses.some (st=> this.hasStatus(st))) {return false;}
	const availability = this.system.weeklyAvailability;
	if (this.isSociallyDisabled())  {
		return false;
	}
	return availability?.available ?? false;
}

getAvailabilityConditions(this: NPC | NPCAlly)  : readonly SourcedPrecondition[] {
	const conds = ConditionalEffectManager.getConditionals(this.system.availabilityConditions, null, null, null);
	return conds;
}

isSociallyDisabled(): boolean {
	switch (this.system.type) {
		case "shadow":
		case "tarot":
			return true;
		case "pc": {
			const statuses : StatusEffectId[] = ["jailed", "exhausted", "crippled", "injured"];
			return statuses.some( x=> this.hasStatus(x));
		}

		case "npcAlly":
		case "npc":
			return this.system.weeklyAvailability.disabled || this.tarot == undefined;
		default:
			this.system satisfies never;
			throw new PersonaError("Unknown type");
	}
}

canTakeNormalDowntimeActions(): boolean {
	return !this.hasStatus("jailed") && !this.hasStatus("crippled");
}

isDowned(): boolean {
	return this.hasStatus("down");
}

canTakeFollowUpAction(this: ValidAttackers) : boolean {
	return !this.isDistracted() && !this.isDowned();
}

async moneyFix() {
	//updates money to new x10 total
	switch (this.system.type) {
		case "pc": {
			const money = this.system.money * 10;
			await this.update({"system.money": money});
			break;
		}
		default:
			return;
	}
}

/** return true if target is harder to disengage from (hard diff)
 */
isSticky() : boolean {
	return this.hasStatus("sticky");
}

async setDefaultShadowCosts(this: Shadow, power: Power) {
	if (!this.items.get(power.id)) {
		ui.notifications.warn("Shadow can't edit power it doesn't own");
		return;
	}
	const {cost, required} = power.estimateShadowCosts(this);
	return await power.setPowerCost(cost, required);
}

getPoisonDamage(this: ValidAttackers): number {
	const base = Math.round(this.baseClassHP * 0.15);
	switch (this.system.type) {
		case "pc":
		case "npcAlly":
			return base;
		case "shadow":
			return base;
		default:
			this.system satisfies never;
			return 0;
	}
	// return Math.round(base * poisonDamageMultiplier(this.system.role) * poisonDamageMultiplier(this.system.role2));
}

static calcPowerRequirement(role: Shadow["system"]["role"], power: Readonly<Power>,  diff: number) : number {
	if (power.system.tags.includes("basicatk"))
	{return 0;}
	const tags = power.system.tags;
	switch (role) {
		case "support":
			if (!tags.includes("debuff")) {
				diff -= 2;
			}
			if (tags.includes("buff")
				|| tags.includes("healing")) {
				diff += 1;
			}
			break;
		default:
			break;
	}
	return Math.clamp(diff, 0, 4);
}

static calcPowerCost(_role: Shadow["system"]["role"], power: Readonly<Power>, diff: number) : Power["system"]["reqEscalation"] {
	if (power.system.tags.includes("basicatk"))
	{return 0;}
	if (diff <= 0) {return 0;}
	const esc = Math.round(Math.abs(diff) / 2);
	return Math.clamp(esc, 0, 6);
}

async increaseScanLevel(this: Shadow, amt :number) {
	const scanLevel = this.system.scanLevel ?? 0;
	if (scanLevel >= amt) {return;}
	if (this.token) {
		await this.token.baseActor.increaseScanLevel(amt);
	}
	await this.update({"system.scanLevel": amt});
	if (amt > 0) {
		this.ownership.default = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
		await this.update({"ownership": this.ownership});
	}
}

async decreaseScanLevel(this: Shadow, lvl: number) {
	const scanLevel = this.system.scanLevel ?? 0;
	if (scanLevel <= lvl) {return;}
	if (this.token) {
		await this.token.baseActor.decreaseScanLevel(lvl);
	}
	await this.update({"system.scanLevel": lvl});
}

async clearScanLevel(this:Shadow) {
	const scanLevel = this.persona().scanLevelRaw ?? 0;
	if (scanLevel == 0) {return;}
	await this.update({"system.scanLevel": 0});
}

get maxEnergy() : number {
	if (!this.isShadow()) {return 0;}
	const BASE_MAX_ENERGY = 10;
	const situation = {
		user: this.accessor,
	};
	const maxEnergy = BASE_MAX_ENERGY + this.basePersona.getBonuses("max-energy").total(situation);
	return maxEnergy;
}

get energy() : number {
	if (!this.isShadow()) {return 0;}
	return this.system.combat.energy.value;
}

async setVariable ( varName: string, value: number) : Promise<void> {
	const vars : Record<string, number> = this.getFlag("persona", "variables") ?? {};
	vars[varName] = value;
	await this.setFlag("persona", "variables", vars);
}

getVariable(varName: string) : number {
	const vars : Record<string, number> = this.getFlag("persona", "variables") ?? {};
	return vars[varName] ?? 0;
}

get variables(): Record<string, number>  {
	const vars : Record<string, number> = this.getFlag("persona", "variables") ?? {};
	return vars;
}

async setEnergy(this: Shadow, amt: number) {
	const maxEnergy = this.maxEnergy;
	if (this.system.combat.energy.max != maxEnergy) {
		await this.update( { "system.combat.energy.max": maxEnergy});
	}
	amt = Math.clamp(amt, -1, maxEnergy);
	await this.update({"system.combat.energy.value": amt});
}

async alterEnergy(this: Shadow, amt: number) {
	console.log(`Altering Energy ${amt}`);
	await this.setEnergy(this.system.combat.energy.value + amt);
}

async onRoll(situation: RollSituation & Situation) {
	console.log(`${this.name} is making a roll with tags: ${situation.rollTags.join(", ")}`);
	if (!this.isValidCombatant()) {return;}
	if (this.isPC() ) {
		if (situation.rollTags.includes("fatigue")) {
			await this.update({"system.fatigue.hasMadeFatigueRollToday" : true});
		}
	}
	const rollSituation : Situation = {
		user: this.accessor,
		triggeringCharacter: this.accessor,
		trigger: "on-roll",
		rollTags: situation.rollTags,
		naturalRoll: situation.naturalRoll,
		rollTotal: situation.rollTotal,
		triggeringUser: game.user,
	};
	await TriggeredEffect.autoApplyTrigger("on-roll", this, rollSituation);
}

async onCombatStart() {
}


async onKO() : Promise<void> {
	console.log("Calling onKO");
	await Promise.allSettled(this.effects
		.filter( eff => eff.removesOnDown())
		.map(eff => eff.delete())
	);
}

onRevive() : Promise<void> {
	console.log("Calling onRevive");
	return Promise.resolve();
}


get tagListNames(): string[] {
	return this.tagListPartial
		.map( tag=> {
			return PersonaDB.allTags().get(tag)?.displayedName?.toString()
				?? tag;
		});
}

realTags() : Tag[] {
	const ret =  this.tagListPartial.flatMap( tag => {
		const x = PersonaItem.searchForPotentialTagMatch(tag);
		if (x) {return [x];}
		else {return [];}
	});
	return ret;
}

get tagListPartial() : CreatureTag[] {
	//NOTE: This is a candidate for caching
	if (this.isTarot()) { return []; }
	const list : CreatureTag[] = this.system.creatureTags.slice();
	if (this.isValidCombatant()) {
		list.push(...this.persona().tagListPartial());
	}
	if (this.isValidCombatant()) {
		const extraTags = this.mainModifiers({omitPowers:true, omitTalents: true, omitTags: true})
			.flatMap( CE=> PersonaItem.getConferredTags(CE , this as ValidAttackers));
		for (const tag of extraTags) {
			if (!list.includes(tag))
			{list.push(tag);}
		}
	}
	switch (this.system.type) {
		case "pc":
			if (!list.includes("pc")) {
				list.pushUnique("pc");
			}
			return list;
		case "npcAlly":
			if (!list.includes("npc-ally")) {
				list.pushUnique("npc-ally");
			}
			return list;
		case "npc": return list;
		case "shadow": {
			list.pushUnique(this.system.creatureType);
			if (this.system.creatureType == "d-mon" && this.hasPlayerOwner) {
				list.pushUnique("pc-d-mon");
			}
			return list;
		}
		case "tarot":
			return [];
		default:
			this.system satisfies never;
			return [];
	}
}

get tagList() : (Tag | InternalCreatureTag)[] {
	return this.tagListPartial
		.map(tag => PersonaItem.searchForPotentialTagMatch(tag) ?? (tag as InternalCreatureTag));
}

hasCreatureTag(tagNameOrId: CreatureTag) : boolean{
	const tag = PersonaDB.allTags().get(tagNameOrId);
	const tagList = this.tagListPartial;
	if (!tag) {
		return tagList.includes(tagNameOrId);
	}
	return tagList.includes(tag.id)
	|| tagList.includes(tag.system.linkedInternalTag)
	|| tagList.includes(tag.name);
}

async deleteCreatureTag(index: number) : Promise<void> {
	const tags = this.system.creatureTags;
	tags.splice(index, 1);
	await this.update( {"system.creatureTags": tags});
}

async addCreatureTag(tag ?: Tag) : Promise<void> {
	const tags = this.system.creatureTags;
	if (tag && tag instanceof PersonaItem) {
		tags.push(tag.id);
	} else {
		tags.push("neko");
	}
	await this.update( {"system.creatureTags": tags});
}

async onAddToCombat() {
	if (!game.user.isGM) {return;}
	switch (this.system.type) {
		case "shadow": {
			if (!this.isShadow()) {return;}// a double check purely for TS to recognize it;
			const energy = this.startingEnergy();
			await this.setEnergy(energy);
			break;
		}
		case "pc":
		case "npc":
		case "tarot":
			break;
	}
}

startingEnergy(this: Shadow) : number {
	const sit : Situation = {
		user: this.accessor,
	};
	const bonusEnergy = this.persona().getBonuses("starting-energy").total(sit);
	// const inc = this.system.combat.classData.incremental.mp;
	const baseStartingEnergy = 3;
	return baseStartingEnergy + bonusEnergy;
}

/** rate that shadow is encountered in the a scene
 */
getEncounterWeight(this: Shadow, scene: PersonaScene = game.scenes.current as PersonaScene) : number {
	const rate = this.system.encounter.dungeonEncounters.find(x => x.dungeonId == scene.id);
	if (!rate) {return 0;}
	const baseProb = ENCOUNTER_RATE_PROBABILITY[rate.frequencyNew];
	if (baseProb == undefined) {
		console.warn (`Invalid value for frequencynew: ${rate.frequencyNew}`);
		return 0;
	}
	return baseProb;
}

get questions(): NPC["system"]["questions"] {
	switch (this.system.type) {
		case "shadow":
		case "tarot":
			return [];
		case "npcAlly":
			return (this as NPCAlly).getNPCProxyActor()?.questions ?? [];
		case "pc":
		case "npc":
				return this.system.questions;
	}
}

async restoreAllQuestions(this: NPC) {
	const questions = this.system.questions.map (x=> x.toJSON ? x.toJSON() as NPC["system"]["questions"][number] : x );
	for (const question of questions) {
		question.expended = false;
	}
	await this.update({"system.questions": questions});
}

async markQuestionUsed(this: NPC, index: number) {
	this.system.questions[index].expended = true;
	const questions = this.system.questions.map( x=> (x as unknown as JSONAble).toJSON());
	await this.update({system: {questions}});
}

async addQuestion(this: NPC | PC) {
	const choices : NPC["system"]["questions"][number]["choices"] = [
		{
			name: "A",
			response: "",
			progressSuccess: 0,
		}, {
			name: "B",
			response: "",
			progressSuccess: 0,
		}, {
			name: "C",
			response: "",
			progressSuccess: 0,
		}
	];
	const question : NPC["system"]["questions"][number] =
		{
			name: "Unnamed Question",
			text: "",
			label: "",
			choices,
			expended: false,
			requiresDating: false,
			SLmin: 1,
			SLmax: 10,
		};
	this.system.questions.push(question);
	await this.update( { "system.questions": this.system.questions});
}

async deleteQuestion(this: NPC | PC, index: number) {
	this.system.questions.splice(index, 1);
	await this.update( { "system.questions": this.system.questions});
}

get roleString() : SafeString {
	if (!this.isShadow()) {return new Handlebars.SafeString("");}
	const roles: (typeof this.system.role)[] = [];
	roles.push(this.system.role);
	roles.push(this.system.role2);
	const localized = roles
		.filter( x=> x != undefined && x != "base")
		.map( x=> localize(SHADOW_ROLE[x]))
		.join(", ");
	return new Handlebars.SafeString(localized); }

async setWeaponDamageByLevel(this: Shadow, lvl: number) {
	const low = 3 + Math.floor(lvl /2);
	const high = 5 + Math.floor((lvl +1) /2);
	await this.update( {
		"system.combat.wpndmg.low" : low,
		"system.combat.wpndmg.high": high
	});
}

get treasureString() : SafeString {
	if (this.system.type != "shadow") {return new Handlebars.SafeString("");}
	const treasure = this.system.encounter.treasure;
	const items = [treasure.item0, treasure.item1, treasure.item2]
		.filter( id=> id)
		.map( id => PersonaDB.treasureItems().find(x=> x.id == id))
		.flatMap(item => item ? [item.name] : []);
	const cardPower = treasure.cardPowerId ? PersonaDB.allPowersArr().filter( x=> treasure.cardPowerId == x.id): [];
	const cardName = cardPower.map( pwr => `${pwr.name} Card`);
	return new Handlebars.SafeString(items.concat(cardName).join(", "));
}

get isTrueOwner() : boolean {
	switch (this.system.type) {
		case "tarot":
		case "npcAlly":
		case "shadow":
		case "npc":
			return game.user.isGM;
		case "pc":
			return game.user.isGM || game.user.id == this.system.trueOwner;
	}
}

get fusionCombinations() : FusionCombination[] {
	const arr = this.personaList
		.concat(this.sideboardPersonas);
	return FusionTable.fusionCombinationsOutOf(arr);
}

fusionCombinationsRaw() {
	const arr = this.personaList
		.concat(this.sideboardPersonas);
	return FusionTable.fusionCombinationsOutOf(arr, true);
}

getPrimaryPlayerOwner() : typeof game.users.contents[number] | undefined {
	if ("trueOwner" in this.system) {
		return game.users.get(this.system.trueOwner);
	}
	const userIdPair = Object.entries(this.ownership)
		.find( ([k,v]) => {
			if (v < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {return false;}
			const user = game.users.get(k);
			if (user && !user.isGM) {return true;}
			return false;
		});
	if (!userIdPair) {return undefined;}
	return game.users.get(userIdPair[0]);
}

get startingPowers() : Power[] {
	if (!this.isShadow()) {return [];}
	const startingLevel = this.system.personaConversion.startingLevel;
	const learnedPowers = this.powerLearningListFull.filter( x=> x.level <= startingLevel);
	return learnedPowers.map( x=> x.power);
}

getNPCAllyProxy(this: NPC) : U<NPCAlly> {
	return PersonaDB.NPCAllies().find( x=> x.system.NPCSocialProxyId == this.id);
}

async addPermaBuff(this: ValidAttackers | NPC, buffType: PermaBuffType, amt: number) : Promise<void> {
	if (amt <= 0) {
		PersonaError.softFail(`Negative amount for perma buff for ${this.name}`);
		return;}
	if (this.isNPC()) {
		const proxyAlly = this.getNPCAllyProxy();
		if (!proxyAlly) {return;}
		return proxyAlly.addPermaBuff(buffType, amt);
	}
	if (typeof amt != "number" || amt == 0 || Number.isNaN(amt)) {return;}
	switch (buffType) {
		case "max-hp": {
			const newHP = this.system.combat.bonusHP + amt;
			await this.update( {"system.combat.bonusHP": newHP});
			break;
		}
		case "max-mp": {
			const newMP = this.system.combat.bonusMP + amt;
			await this.update( {"system.combat.bonusMP": newMP});
			break;
		}
		case "str":
		case "mag":
		case "end":
		case "agi":
		case "luk": {
			const persona = this.persona();
			if (persona.source != this) {
				return await persona.source.addPermaBuff(buffType, amt);
			}
			const bonuses = this.system.combat.personaStats.permanentStatsBonuses;
			if (this.hasSoloPersona) {amt = Math.max(1, Math.round(amt / 2));}
			bonuses[buffType] += amt;
			await this.update({ "system.combat.personaStats.permanentStatBonuses": bonuses});
		}
			break;
		default:
			buffType satisfies never;
			return;
	}
	const permaBuffLocalized = localize(PERMA_BUFFS[buffType]);
	void PersonaSFX.onPermaBuff(this, buffType, amt);
	await Logger.sendToChat(`+${amt} ${permaBuffLocalized} applied to ${this.name}`);
}

fusionsInto(this: Shadow, min= 2, max=999) : [Shadow, Shadow][] {
	return FusionTable.fusionCombinationsInto(this, min, max);
}

moneyDropped(): number {
	if (!this.isShadow() || this.isPersona()) {return 0;}
	const moneyHigh = Math.floor(this.level / 5);
	const moneyLow = Math.floor(this.level / 10);
	const variability = moneyHigh - moneyLow;
	const situation = {
		user: this.accessor,
	};
	const mult = this.basePersona.getBonuses("shadowMoneyBoostPercent").total(situation, "percentage");
	if (variability >= 0) {
		const bonus = Math.floor(Math.random() * (variability +1));
		return Math.floor(mult * (moneyLow + bonus));
	}
	return Math.floor(mult * moneyLow);
}

get startingLevel() : number {
	const cVal = this.cache.startingLevel;
	if (cVal != undefined) {
		return cVal;
	}
	if (!this.isShadow()) {return this.cache.startingLevel = 0;}
	const lvl = this.system.personaConversion.startingLevel;
	if (lvl == 1) {return this.cache.startingLevel = this.level;}
	return this.cache.startingLevel = lvl;
}

async swapPersona( this: PC, p1: Persona, p2: Persona) {
	if (this.maxPersonaSideboard == 0) {
		return;
	}
	if (await this._trySwapPersona(p1, p2)) {
		await Logger.sendToChat(`${p1.name} moved from sideboard to active, replacing ${p2.name}`);
		return;
	}
	if (await this._trySwapPersona(p2, p1)) {
		await Logger.sendToChat(`${p2.name} moved from sideboard to active, replacing ${p1.name}`);
		return;
	}
	ui.notifications.notify("These two personas can't be swapped");
}

private async _trySwapPersona(this: PC, p1: Persona, p2: Persona)  : Promise<boolean> {
	const sideboardIds = this.system.combat.persona_sideboard;
	const personaList = this.system.personaList;
	if (sideboardIds.includes(p1.source.id)) {
		if (personaList.includes(p2.source.id)) {
			sideboardIds.splice(sideboardIds.indexOf(p1.source.id), 1, p2.source.id);
			personaList.splice(personaList.indexOf(p2.source.id), 1, p1.source.id);
			await this.update( {
				"system.combat.persona_sideboard": sideboardIds,
				"system.personaList": personaList,
			});
			return true;
		}
	}
	return false;
}

}//end of class

Hooks.on("preUpdateActor", async (actor: PersonaActor, changes) => {
	if (!actor.isOwner) {return;}
	switch (actor.system.type) {
		case "npc": return;
		case "tarot": return;
		case "pc":
		case "npcAlly":
		case "shadow":  {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			const newHp = changes?.system?.combat?.hp as number | undefined;
			if (newHp == undefined)
			{return;}
			await (actor as ValidAttackers).refreshHpStatus(newHp);
			return ;
		}
		default:
			actor.system satisfies never;
			throw new PersonaError(`Unknown Type`);
	}
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
Hooks.on("updateActor", async (actor: PersonaActor, changes: {system: any}) => {
	if (!game.user.isGM) {return;}
	if (!actor.isOwner) {return;}
	if (!actor.isValidCombatant()) {return;}
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	const lvl =changes?.system?.combat?.personaStats?.pLevel as U<number>;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
	if (changes?.system?.combat?.personaStats?.pLevel != undefined && lvl) {
		console.log("Actor XP update");
		const minXP = LevelUpCalculator.minXPForEffectiveLevel(lvl);
		const maxXP = LevelUpCalculator.minXPForEffectiveLevel(lvl + 1);
		if (actor.system.combat.personaStats.xp < minXP) {
			console.log("Actor XP update raised");
			await actor.update({"system.combat.personaStats.xp" : minXP});
		}
		if (actor.system.combat.personaStats.xp >= maxXP) {
			console.log("Actor XP update lowered");

			await actor.update({"system.combat.personaStats.xp" : minXP});
		}
		await actor.basePersona.resetCombatStats(true);
		if (actor.isPC() || actor.isNPCAlly()) {
			await actor.refreshMaxMP();
		}
		await actor.refreshHpStatus();
		//NEEd to refresh stat points on level change
	}
	if (lvl != undefined) {
		await actor.onLevelUp_checkLearnedPowers(lvl, !actor.isShadow());
	}
	switch (actor.system.type) {
		case "npcAlly": {
			const PCChanges = changes.system as Partial<NPCAlly["system"]>;
			if (PCChanges?.combat?.isNavigator == true) {
				await (actor as NPCAlly).setAsNavigator();
			}
			if (PCChanges?.combat?.usingMetaPod != undefined)
			{
				await Logger.sendToChat(`${actor.name} changed Metaverse Pod status to ${PCChanges.combat.usingMetaPod}`);
			}
			break; }
		case "pc": {
			const PCChanges = changes.system as Partial<PC["system"]>;
			if (PCChanges?.combat?.usingMetaPod != undefined)
			{
				await Logger.sendToChat(`${actor.name} changed Metaverse Pod status to ${PCChanges.combat.usingMetaPod}`);
			}
			break;
		}
		case "shadow":
			break;
		default:
			actor.system satisfies never;
	}
	await	actor.refreshTrackers();
});

Hooks.on("createToken", async function (token: TokenDocument<PersonaActor>)  {
	if (!game.user.isGM) { return;}
	if (token.actor && game.user.isGM && token.actor.system.type == "shadow") {
		await token.actor.fullHeal();
	}
});

export type SocialBenefit = {
	id: string,
	focus: Focus,
	lvl_requirement: number,
};

export type PC = Subtype<PersonaActor, "pc">;
export type Shadow = Subtype<PersonaActor, "shadow">;
export type NPC = Subtype<PersonaActor, "npc">;
export type NPCAlly =Subtype<PersonaActor, "npcAlly">;
export type Tarot = Subtype<PersonaActor, "tarot">;
export type SocialLink = PC | NPC | NPCAlly;

export type ActivityLink = {
	strikes: number,
	available: boolean,
	activity: Activity,
	currentProgress: number,
}

export type SocialLinkData = {
	linkLevel: number,
	actor: SocialLink,
	inspiration: number,
	linkBenefits: SocialLink,
	focii: Focus[],
	currentProgress:number,
	relationshipType: string,
	available: boolean,
	isDating: boolean,
}

type Team = "PCs" | "Shadows" | "Neutral" ;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EMPTYARR :any[] = [] as const; //to speed up things by not needing to create new empty arrays for immutables;

Object.seal(EMPTYARR);

Hooks.on("createActor", async function (actor: PersonaActor) {
	if (actor.isShadow()) {
		await actor.update({
			"prototypeToken.displayBars": 50,
			"prototypeToken.displayName": 30,
			"prototypeToken.bar1": {attribute: "combat.hpTracker"},
			"prototypeToken.bar2": {attribute: "combat.energy"}
		});
	}
	if (actor.isShadow() && !actor.hasTag("persona") && !actor.hasTag("d-mon")  && actor.level <= 1) {
		const avgLevel = PersonaDB.averagePCLevel();
		await actor.update({ "system.combat.personaStats.pLevel" : avgLevel});
		await actor.setWeaponDamageByLevel(avgLevel);
	}
});

Hooks.on("updateActor", async function (actor: PersonaActor) {
	actor.clearCache();
	if (actor.isShadow()) {
		const xp= LevelUpCalculator.minXPForEffectiveLevel(actor.system.combat.personaStats.pLevel);
		if (actor.system.combat.personaStats.xp < xp) {
			await actor.update({"system.combat.personaStats.xp" : xp});
		}
	}
});

export type XPGainReport = {
	name: string,
	amount: number,
	leveled: boolean,
};

Hooks.on("updateActor", function (actor: PersonaActor, diff)  {
	if (!actor.isToken && diff?.prototypeToken?.name) {
		EnhancedActorDirectory.refresh();
	}
	if (actor.isValidCombatant()) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if (diff?.system?.combat?.personaStats?.pLevel != undefined) {
			EnhancedActorDirectory.refresh();
		}
	}
});
