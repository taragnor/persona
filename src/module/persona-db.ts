import { TAROT_DECK, TarotCard } from "../config/tarot.js";
import { ModifierContainer } from "./item/persona-item.js";
import { PersonaError } from "./persona-error.js";
import { PersonaItem } from "./item/persona-item.js";
import { DBAccessor } from "./utility/db-accessor.js";
import { PersonaActor } from "./actor/persona-actor.js";
import { BASIC_PC_POWER_NAMES } from "../config/basic-powers.js";
import { BASIC_SHADOW_POWER_NAMES } from "../config/basic-powers.js";
import {SocialEncounterCard} from "./social/social-card-executor.js";
import {PermanentCache, TimedCache} from "./utility/cache.js";

const STORES_CACHE_DURATION = 60000 as const;

declare global {
  interface HOOKS {
    "DBrefresh": (db: PersonaDatabase) => unknown,
      "DBLoaded": (db: PersonaDatabase) => unknown,
  }
}

class PersonaDatabase extends DBAccessor<PersonaActor, PersonaItem> {

  #cache: PersonaDBCache;
  failLog: Map<string, string> = new Map();

  private timedCaches = {
    storesCache: new TimedCache(() => this._getAllStores(), STORES_CACHE_DURATION),
  } as const;

  private permanentCaches = {
    allTags: new PermanentCache( () => this._allTags()),
    allPowers: new PermanentCache( () => this._allPowers()),
    allTalents: new PermanentCache( () => this._allTalents()),
    allPowersArr: new PermanentCache( () => this._allPowersArr()),
    sceneModifiers: new PermanentCache( () => this._getSceneModifiers()),
    NPCs : new PermanentCache( () => this._allNPCs()),
    PCs : new PermanentCache( () => this._allPCs()),
    NPCAllies: new PermanentCache( () => this._NPCAllies()),
    classes: new PermanentCache( () => this._classes()),
    allSocialCards: new PermanentCache( () => this._allSocialCards()),
    tagsArr: new PermanentCache( () => this._tagsArr()),
    enchantments: new PermanentCache( () => this._enchantments()),
    personalSocialLink: new PermanentCache( () => this._personalSocialLink()),
    craftingItems: new PermanentCache( () => this._craftingItems()),
    allCarryables: new PermanentCache( () => this._allCarryables()),
  };

  constructor() {
    super();
    this.#resetCache();
  }

  #resetCache() : PersonaDBCache {
    Object.values(this.permanentCaches)
      .forEach( cache=> cache.clear());
    Object.values(this.timedCaches)
      .forEach (cache=> cache.clear());
    const newCache =  this.#cache = {
      powers: undefined,
      NPCs: undefined,
      shadows: undefined,
      socialLinks: undefined,
      treasureItems: undefined,
      tarot: undefined,
      navigator: undefined,
      pcs: undefined,
      teammateSocialLink: undefined,
      personalSocialLink: undefined,
      NPCAllies: undefined,
      sceneModifiers: undefined,
      worldModifiers: undefined,
      worldPassives: undefined,
      worldDefensives: undefined,
      tags: undefined,
      tagInternalTag: undefined,
      tagsArr: undefined,
      tagNames: undefined,
      enchantments: undefined,
      classes: undefined,
      possiblePersonas: undefined,
      personaCompendium: undefined,
      allUniversalModifierTypes: undefined,
      roomModifiers: undefined,
    };
    Hooks.callAll("DBrefresh", this);
    return newCache;
  }

  override postLoadActions() {
    this.#resetCache();
    Hooks.callAll("DBLoaded", this);
  }

  clearCache() {
    this.#resetCache();
  }

  override async onLoadPacks() {
    await super.onLoadPacks();
    this.#resetCache();
  }

  onCreateActor(_actor : PersonaActor) {
    this.#resetCache();
  }

  onCreateItem(_item: PersonaItem) {
    this.#resetCache();
  }

  getClassById(id: CClass["id"]): Option<CClass> {
    const item = this.getItemById(id);
    if (!item) {return null;}
    if (item.system.type == "characterClass") {
      return item as ItemSub<"characterClass">;
    }
    throw new Error("Id ${id} points towards invalid type");
  }

  getClassByName(name: string) : U<CClass> {
    const classes=  this.classes();
    return classes.find (x=> x.name == name);
  }


  async refreshCombatStats() {
    for (const actor of this.allActors()) {
      if (!actor.isValidCombatant()) {continue;}
      if (actor.tarot == undefined) {continue;}
      if (actor.isPC()) {continue;}
      try {
        await actor.basePersona.resetCombatStats(true);
      } catch (e) {
        console.error(`Problem resetting stats for ${actor.name} (${actor.id})`);
        Debug(e);
      }
    }
  }

  async refreshItemBases() {
    const tokenActors = game.scenes.contents
      .flatMap(scene => scene.tokens.contents.flatMap
        (tok => tok.actor ? [tok.actor as PersonaActor] : [])
      );
    const allActors = [
      ...this.allActors(),
      ...tokenActors,
    ];
    const nullItems : Carryable[] = [];
    for (const actor of allActors) {
      const items : Carryable[] = actor.items
        .filter( item=> item.isCarryableType()) as Carryable[];
      for (const item of items) {
        const ret = await item.refreshItemBase();
        if (ret == null) { nullItems.push(item); }
      }
    }
    for (const item of PersonaDB.allItems()) {
      if (item.isCarryableType()) {
        const ret = await item.refreshItemBase();
        if (ret == null) { nullItems.push(item); }
      }
    }
    return nullItems;
  }

  getGlobalDefensives(): readonly UniversalModifier [] {
    if (this.#cache.worldDefensives == undefined) {
      this.#cache.worldDefensives = this.getGlobalModifiers()
        .filter(um=> um.hasDefensiveEffects(null));
    }
    return this.#cache.worldDefensives;
  }

  getGlobalPassives() : readonly UniversalModifier [] {
    if (this.#cache.worldPassives == undefined) {
      this.#cache.worldPassives = this.getGlobalModifiers()
        .filter(um=> um.hasPassiveEffects(null));
    }
    return this.#cache.worldPassives;
  }

  getGlobalModifiers() : readonly UniversalModifier [] {
    if (this.#cache.worldModifiers == undefined) {
      const UMs = this.allUniversalModifierTypes();
      this.#cache.worldModifiers = UMs.filter(um=> um.system.scope == "global");
    }
    return this.#cache.worldModifiers;
  }

  getRoomModifiers() : readonly UniversalModifier [] {
    if (this.#cache.roomModifiers == undefined) {
      const UMs = this.allUniversalModifierTypes();
      this.#cache.roomModifiers = UMs
        .filter(um=> um.system.scope == "room")
        .sort ( (a,b) => a.name.localeCompare(b.name));
    }
    return this.#cache.roomModifiers;
  }

  allUniversalModifierTypes() : readonly UniversalModifier[] {
    if (!this.isLoaded) {
      throw new PersonaError("Trying to access universl mods before PersonaDB is loaded");
    }
    if (this.#cache.allUniversalModifierTypes == undefined) {
      const items = this.getAllByType("Item") as PersonaItem[];
      const UMs = items.filter( x=> x.system.type == "universalModifier") as UniversalModifier[];
      this.#cache.allUniversalModifierTypes = UMs;
    }
    return this.#cache.allUniversalModifierTypes;
  }

  getSceneModifiers() : readonly UniversalModifier [] {
    return this.permanentCaches.sceneModifiers.value;
  }

  _getSceneModifiers() : readonly UniversalModifier [] {
    // if (this.#cache.sceneModifiers == undefined) {
    //   const UMs = this.allUniversalModifierTypes();
    //   this.#cache.sceneModifiers = UMs
    //     .filter(um=> um.system.scope == "scene")
    //     .sort ( (a,b) => a.name.localeCompare(b.name));
    // }
    // return this.#cache.sceneModifiers;
      const UMs = this.allUniversalModifierTypes();
      return UMs
        .filter(um=> um.system.scope == "scene")
        .sort ( (a,b) => a.name.localeCompare(b.name));
  }

  getSceneAndRoomModifiers() : readonly UniversalModifier[] {
    return [
      ... this.getRoomModifiers(),
      ... this.getSceneModifiers()
    ] .sort ( (a,b) => a.name.localeCompare(b.name));
  }


  allPowersArr(): readonly Power[] {
    return this.permanentCaches.allPowersArr.value;
    // return Array.from(this.allPowers().values());
  }

  _allPowersArr(): readonly Power[] {
    return Array.from(this.allPowers().values());
  }

  allTalents(): readonly Talent[] {
    return this.permanentCaches.allTalents.value;
  }

  _allTalents(): readonly Talent[] {
    return this.allItems().filter( x=> x.isTalent());
  }

  allPowers() : Map<string, Power> {
    return this.permanentCaches.allPowers.value;
  }

  private _allPowers() : Map<string, Power> {
    // if (this.#cache.powers) {return this.#cache.powers;}
    // const items = this.allItems();
    // return this.#cache.powers =
    const items = this.allItems()
    .filter( x=> x.system.type == "power")
    .map( pwr => [pwr.id, pwr]) as [Power["id"], Power][];
    return this.#cache.powers = new Map(items);
  }

  getBasicPower( name: typeof BASIC_SHADOW_POWER_NAMES[number] | typeof BASIC_PC_POWER_NAMES[number]) : Power | undefined {
    const power = PersonaDB.getItemByName(name) as Power | undefined;
    if (!power && !this.failLog.has(name))  {
      const msg =`Can't get basic power ${name}`;
      this.failLog.set(name, msg);
      PersonaError.softFail(msg);
    }
    return power;
  }

  shadows(): readonly Shadow[] {
    if (this.#cache.shadows) {return this.#cache.shadows;}
    const actors = this.allActors();
    return this.#cache.shadows = actors
      .filter( act=> act.isShadow());
  }

  tarotCards(): readonly Tarot[] {
    if (this.#cache.tarot) {return this.#cache.tarot;}
    const actors = this.allActors();
    return this.#cache.tarot = actors
      .filter( actor=> actor.isTarot())
      .sort((a,b) => a.system.sortOrder - b.system.sortOrder);

  }

  getSocialLinkByTarot(tarotCardNameOrId: TarotCard | (Tarot["id"] & {})) : U<NPC | PC> {
    return this.socialLinks()
    .find( x=> x.tarot
      && (
        x.tarot.name == tarotCardNameOrId
        || x.tarot.id == tarotCardNameOrId
      )
    );
  }

  treasureItems(): readonly TreasureItem[] {
    if (this.#cache.treasureItems) {return this.#cache.treasureItems;}
    const items = this.allItems();
    this.#cache.treasureItems = items
      .filter ( item =>
        item.system.type == "weapon"
        || item.system.type == "consumable"
        || item.system.type == "item"
      )
      .filter( (x : TreasureItem)=> !x.hasTag("key-item", null) && !x.hasTag("mundane", null)) as TreasureItem[];
    return this.#cache.treasureItems;
  }

  allCarryables() : readonly Carryable[] {
    return this.permanentCaches.allCarryables.value;
  }

  private _allCarryables() : readonly Carryable[] {
    const items = this.allItems()
      .filter ( item =>
        item.isWeapon()
        || item.isConsumable()
        || item.isInvItem()
      );
    return items;
  }

  craftableItems() : readonly TreasureItem[] {
    return this.treasureItems()
      .filter (item => item.system.craftingRecipes
        && item.system.craftingRecipes.length > 0);
  }

  craftingItems() : readonly TreasureItem[] {
    return this.permanentCaches.craftingItems.value;
  }

  _craftingItems() : readonly TreasureItem[] {
    return this.allCarryables()
      .filter( item => item.isCraftingItem || item.isSecondaryCraftingItem)
      .sort( (a, b) => a.name.localeCompare(b.name));
  }

  partyTokenActor() : U<PC> {
    const actor = this.allActors().find( x=>
      x.isPC() && x.hasPlayerOwner && !x.isRealPC() && x.hasTag("party-token"));
    return actor?.isPC() ? actor : undefined;
  }

  dungeonScenes(): readonly Scene[] {
    return game.scenes.contents;
  }

  allSocialCards() : readonly SocialCard[] {
    return this.permanentCaches.allSocialCards.value;
  }

  _allSocialCards() : readonly SocialCard[] {
    return this.allItems()
      .filter( x=> x.system.type == "socialCard") as SocialCard[];
  }

  tagsOfCategory(cat: MaybeArray<Tag["system"]["tagType"]>) : Tag[] {
    if (typeof cat == "string") {
      cat  = [cat];
    }
    return this.tagsArr().filter( x=> cat.includes(x.system.tagType));
  }

  tagsOfCategoryLoc(cat: MaybeArray<Tag["system"]["tagType"]>): Record<Tag["id"], Tag["name"]> {
    const tags = this.tagsOfCategory(cat);
    return Object.fromEntries(
      tags
      .sort( (a,b) => a.name.localeCompare(b.name))
      .map( tag => [tag.id, tag.name])
    );
  }

  createMergedTagLocList(cat: MaybeArray<Tag["system"]["tagType"]>, originalLocObject: Record<string, string>) : Record<string, string> {
    const tags = this.tagsOfCategory(cat);
    const locListEntries = Object.entries(originalLocObject)
    .filter( ([tagName,_locString]) => {
      return !tags.some( tag => tagName != "" && tag.system.linkedInternalTag == tagName);
    });
    const locObj = {
      ...Object.fromEntries(locListEntries),
      ...this.tagsOfCategoryLoc(cat),
    };
    return this.sortLocalizationObject(locObj);
  }

  tagsArr(): readonly Tag[] {
    return this.permanentCaches.tagsArr.value;
    // if (this.#cache.tagsArr != undefined) {return this.#cache.tagsArr;}
    // const tags= this.allItems()
    //   .filter (x=> x.isTag());
    // return this.#cache.tagsArr = tags;
  }

  private _tagsArr(): readonly Tag[] {
    return this.allItems()
      .filter (x=> x.isTag());
  }

  allTags() :  Map<Tag["id"],Tag> {
    return this.permanentCaches.allTags.value;
    // if (!PersonaDB.isLoaded) {throw new PersonaError("DB not loaded yet");}
    // if (this.#cache.tags) {return this.#cache.tags;}
    // const tags= this.tagsArr()
    // .map( tag=> [tag.id, tag] as [Tag["id"], Tag]);
    // return this.#cache.tags = new Map(tags);
  }

  private _allTags() :  Map<Tag["id"],Tag> {
    if (!PersonaDB.isLoaded) {throw new PersonaError("DB not loaded yet");}
    const tags = this.tagsArr()
    .map( tag=> [tag.id, tag] as [Tag["id"], Tag]);
    return new Map(tags);
    // if (!PersonaDB.isLoaded) {throw new PersonaError("DB not loaded yet");}
    // if (this.#cache.tags) {return this.#cache.tags;}
    // const tags= this.tagsArr()
    // .map( tag=> [tag.id, tag] as [Tag["id"], Tag]);
    // return this.#cache.tags = new Map(tags);
  }

  enchantments() : readonly Tag[] {
    return this.permanentCaches.enchantments.value;
    // if (this.#cache.enchantments) {return this.#cache.enchantments;}
    // const tags= this.tagsArr()
    //   .filter(tag=> tag.isEnchantmentTag());
    // return this.#cache.enchantments = tags;
  }

  private _enchantments() : readonly Tag[] {
    return this.tagsArr()
      .filter(tag=> tag.isEnchantmentTag());
  }

  PCsAndAllies() : readonly (PC | NPCAlly) [] {
    return [
      ...this.realPCs(),
      ...this.NPCAllies(),
    ];
  }

  allTagLinks() : Map<Tag["system"]["linkedInternalTag"], Tag> {
    if (this.#cache.tagInternalTag) {return this.#cache.tagInternalTag;}
    const tags= this.tagsArr()
    .filter (x=> x.system.linkedInternalTag)
    .map( tag => [tag.system.linkedInternalTag, tag] as [string, Tag]);
    return this.#cache.tagInternalTag = new Map(tags);
  }

  allTagNames() : Map<Tag["system"]["linkedInternalTag"], Tag> {
    if (this.#cache.tagNames) {return this.#cache.tagNames;}
    const tags= this.tagsArr()
    .map( tag => [tag.name, tag] as [string, Tag]);
    return this.#cache.tagNames = new Map(tags);
  }

  socialEncounterCards(): readonly SocialEncounterCard[] {
    return this.allSocialCards()
      .filter( x=> x.system.cardType == "social") as SocialEncounterCard[];
  }

  /** Actual PCs not counting things with just PC type like item piles and party token*/
  realPCs(): readonly  PC[] {
    return this.PCs().filter( x=> x.isRealPC());
  }

  activePCParty() : readonly (PC | NPCAlly) [] {
    return [
      ...this.realPCs(),
      ...this.NPCAllies(),
    ].filter ( x=> x.inActiveParty);
  }

  PCs() : readonly PC[] {
    return this.permanentCaches.PCs.value;
    // if (this.#cache.pcs) {return this.#cache.pcs;}
    // this.#cache.pcs=  this.allActors().filter( actor => actor.isPC() && actor.isRealPC());
    // return this.#cache.pcs;
  }

  private _allPCs() : readonly PC[] {
    return this.allActors()
      .filter( actor => actor.isPC() && actor.isRealPC());
  }

  allNPCs(): readonly NPC[] {
    return this.permanentCaches.NPCs.value;
    // if (this.#cache.NPCs) {return this.#cache.NPCs;}
    // this.#cache.NPCs=  this.allActors().filter( actor => actor.isNPC());
    // return this.#cache.NPCs;
  }

  private _allNPCs(): readonly NPC[] {
    return  this.allActors()
      .filter( actor => actor.isNPC());
    // return this.#cache.NPCs;
  }

  allActivities(): readonly Activity[] {
    return this.allSocialCards()
      .filter( x=> (x.system.cardType !="social"));
  }

  standardActionActivities(): readonly Activity[] {
    return this.allActivities()
      .filter( x=> (x.system.cardType == "job"
        || x.system.cardType =="training"
        || x.system.cardType == "recovery"
        || x.system.cardType == "other")
      );
  }

  minorActionActivities() : readonly SocialCard[] {
    return this.allSocialCards()
      .filter( card=> card.isMinorActionItem());
  }

  personalSocialLink(): NPC {
    return this.permanentCaches.personalSocialLink.value;
  }

  _personalSocialLink(): NPC {
    const actor = this.getActorByName("Personal Social Link");
    if (actor == undefined || !actor.isNPC()) {
      throw new PersonaError("Personal Social Link not found");
    }
    return actor;
  }

  teammateSocialLink(): NPC {
    if (!this.#cache.teammateSocialLink) {
      this.#cache.teammateSocialLink =  PersonaDB.getActorByName("Teammate Social Link") as NPC;
    }
    return this.#cache.teammateSocialLink;
  }

  socialLinks(): readonly (PC | NPC)[] {
    if (this.#cache.socialLinks) {return this.#cache.socialLinks;}
    return this.#cache.socialLinks = (game.actors.contents  as PersonaActor[])
      .filter( (actor :PersonaActor) =>
        (actor.isNPC() || actor.isPC())
      )
      .filter( actor => actor.tarot != undefined)
      .sort((a, b) => (a.tarot?.system.sortOrder ?? 99) - (b.tarot?.system.sortOrder ?? 99));
  }

  skillCards(): readonly SkillCard[] {
    return this.allItems()
      .filter( item => item.isSkillCard());
  }

  getPower(id: Power["id"]) : Power | undefined {
    return this.getItemById(id) as Power | undefined;
  }

  NPCAllies() : readonly NPCAlly[] {
    return this.permanentCaches.NPCAllies.value;
    // if (this.#cache.NPCAllies == undefined) {
    //   this.#cache.NPCAllies = this.allActors().filter( x=>
    //     x.system.type == "npcAlly") as NPCAlly[];
    // }
    // return this.#cache.NPCAllies;
  }

  private _NPCAllies() : readonly NPCAlly[] {
    return this.allActors().filter( x=>
      x.system.type == "npcAlly") as NPCAlly[];
  }

  getAllStores(): readonly TokenDocument<PersonaActor>[] {
    return this.timedCaches.storesCache.value;
  }

  _getAllStores(): readonly TokenDocument<PersonaActor>[] {
    if (!game.itempiles) {
      PersonaError.softFail("Item Piles not defined, can't get all stores");
      return [];
    }
    const IP = game.itempiles.API;
    return game.scenes.contents.flatMap( sc =>
      sc.tokens
      .filter(  (tok) => IP.isItemPileMerchant(tok))
    ) as TokenDocument<PersonaActor>[];
  }

  stockableItems() : readonly Carryable[] {
    return this.allItems()
      .filter ( (x: PersonaItem)=>
      x.isCarryableType()
      && (x.system?.storeId?.length ?? 0) > 0
      && (x.system?.storeMax ?? 0) > 0
    ) as Carryable[];
  }

  getNavigator() : NPCAlly | undefined {
    if (!this.#cache.navigator) {
      const navigator = this.NPCAllies().find( ally => ally.system.combat.isNavigator);
      this.#cache.navigator = navigator;
    }
    return this.#cache.navigator;
  }

  personaCompendium() : readonly Shadow[] {
    if (!this.#cache.personaCompendium) {
      this.#cache.personaCompendium = this.allActors()
        .filter ( x=> x.isShadow())
        .filter( x=> x.isCompendiumEntry )
        .sort( (a,b)=> a.name.localeCompare(b.name) );
    }
    return this.#cache.personaCompendium;
  }

  navigatorModifiers(): readonly ModifierContainer[] {
    const navigator = this.getNavigator();
    if (!navigator) {return [];}
    const skills = navigator.navigatorSkills
      .filter(sk => sk.isPassive());
    return skills;
  }

  classes(): readonly CClass[] {
    return this.permanentCaches.classes.value;
    // if (!this.#cache.classes) {
    //   this.#cache.classes = this.allItems().filter(item=> item.isCharacterClass());
    // }
    // return this.#cache.classes;
  }

  private _classes(): readonly CClass[] {
    return  this.allItems()
      .filter(item=> item.isCharacterClass());
  }

  possiblePersonas() : readonly Shadow[] {
    if (this.#cache.possiblePersonas) {
      return this.#cache.possiblePersonas;
    }
    const shadows = this.allActors()
      .filter ( x=> x.isShadow()
        && !x.isPersona()
        && !x.isDMon()
        && x.persona().isEligibleToBecomeWildPersona()
      ) as Shadow[];
    return this.#cache.possiblePersonas = shadows;
  }

  possiblePersonasByStartingLevel(min: number, max: number, fusableOnly = false) : Shadow[] {
    return this.possiblePersonas().filter (x=>
      x.startingLevel >= min
      && x.startingLevel <= max
      && (!fusableOnly || x.basePersona.isFusable())
    );
  }

  PersonaableShadowsOfArcana(min: number, max: number, fuseableOnly= false) : Partial<Record<TarotCard, Shadow[]>> {
    const shadows = this.possiblePersonasByStartingLevel(min, max, fuseableOnly)
    .sort( (a,b) => (b.tarot?.displayedName ?? "").localeCompare(a.tarot?.displayedName ?? ""));
    const tarotList = {} as Partial<Record<TarotCard, Shadow[]>>;
    for (const tarot of Object.keys(TAROT_DECK)) {
      tarotList[tarot as TarotCard] = shadows.filter(sh => sh.isShadow() && sh.tarot?.name == tarot);
    }
    return tarotList;
  }


  averagePCLevel(): number {
    const pcs = this.realPCs();
    const totalLevels = pcs.reduce ((acc, i : PC) => acc + i.system.personaleLevel, 0 );
    const avgLevel = Math.round(totalLevels/ pcs.length);
    return avgLevel;
  }

  shadowAmbush() : U<UniversalModifier> {
    const name = "Ambush (Enemy Advantage)";
    const item =  this.getItemByName(name);
    if (item && item.isUniversalModifier()) {
      return item;
    }
    PersonaError.softFail(`Can't find Universal Modifier named ${name}`);
    return undefined;
  }

  PCAmbush() : U<UniversalModifier> {
    const name  = "Ambush (PC Advantage)";
    const item =  this.getItemByName(name);
    if (item && item.isUniversalModifier()) {
      return item;
    }
    PersonaError.softFail(`Can't find Universal Modifier named ${name}`);
    return undefined;
  }

  async recalcShadowStatMods() {
    const promises= [...this.shadows(), ...this.NPCAllies()]
      .map (x=> x.basePersona)
      .filter( p=> p.canAutoSpendStatPoints())
      .map( p=> p.resetCombatStats(true));
    return await Promise.allSettled(promises);
  }

}

export const PersonaDB = new PersonaDatabase();

//@ts-expect-error adding to global objects
window.PersonaDB = PersonaDB;

Hooks.on("createItem", (item: PersonaItem) => {
  PersonaDB.onCreateItem(item);
});

Hooks.on("createActor", (actor : PersonaActor) => {
  PersonaDB.onCreateActor(actor);
});

type PersonaDBCache =	{
  powers: Map<Power["id"], Power> | undefined,
  shadows: Shadow[] | undefined;
  socialLinks: (PC | NPC)[] | undefined;
  treasureItems: TreasureItem[] | undefined;
  tarot: Tarot[] | undefined;
  navigator: NPCAlly | undefined;
  enchantments: U<Tag[]>;
  pcs: PC[] | undefined;
  NPCs: NPC[] | undefined;
  teammateSocialLink: NPC | undefined;
  personalSocialLink: NPC | undefined;
  NPCAllies: U<NPCAlly[]>;
  sceneModifiers: U<UniversalModifier[]>;
  roomModifiers: U<UniversalModifier[]>;
  worldModifiers: U<UniversalModifier[]>;
  worldPassives: U<UniversalModifier[]>;
  worldDefensives: U<UniversalModifier[]>;
  allUniversalModifierTypes: U<UniversalModifier[]>;
  tags: U<Map<Tag["id"], Tag>>;
  tagInternalTag: U<Map<Tag["system"]["linkedInternalTag"], Tag>>;
  tagNames: U<Map<Tag["name"], Tag>>;
  tagsArr: U<Tag[]>;
  classes: U<CClass[]>;
  possiblePersonas: U<Shadow[]>;
  personaCompendium: U<Shadow[]>;
};

