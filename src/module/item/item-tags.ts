import {EquipmentTagOrId} from "../../config/equipment-tags.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {POWER_TAGS, POWER_TAGS_LIST, POWER_TYPE_TAGS, PowerTagOrId, STATUS_AILMENT_POWER_TAGS} from "../../config/power-tags.js";
import {Persona} from "../persona-class.js";
import {PersonaError} from "../persona-error.js";
import {FullTag, TagManager} from "../tag-manager.js";
import {CacheBase, PermanentCache, TimedCache} from "../utility/cache.js";
import {PersonaItem} from "./persona-item.js";

export class ItemTagManager<I extends PersonaItem> extends TagManager<TagType>{
  private item: I;

  private _cache : {
    autoTags_power: CacheBase<TagType[]>;
    tagListRaw: CacheBase<readonly TagType[]>;

  };

  protected CACHE_TIME = 15000 as const;

  constructor (item: I) {
    super();
    this.item = item;
    this.setupCache();
  }

  private setupCache() {
    this._cache = {
      autoTags_power: this.item.isPower()
      ? new TimedCache( () => this.#autoTags_power(this.item as Power), this.CACHE_TIME)
      : new PermanentCache( () => []),

      tagListRaw: new TimedCache( () => this._tagListRaw(null, 0), this.CACHE_TIME),
    };

    if (PersonaSettings.debugMode()) {
      this._cache.autoTags_power.setTestMode( (a: TagType[], b: TagType[]) => a.length != b.length);
    }
  }

  clearCache() {
    Object.values(this._cache)
      .forEach( cache => cache.clear());
  }

  // private get cache() { return this.item.cache; }

  tagList(user: UN<ValidAttackers> | Persona) : readonly FullTag<TagType>[] {
    if (user instanceof Persona) {
      //TODO: might want to change this to better get personas tags
      user = user.user;
    }
    const tagListData = this.tagListRaw(user ?? null).slice()
      .pushUnique(...this.baseItemExtraTags(user ?? null));
    return tagListData.map(tagData=> TagManager.resolveTag(tagData));
  }

  private tagListRaw(user : N<ValidAttackers>, depth : number = 0) : readonly TagType[] {
    if (depth >= 3) {
      PersonaError.softFail(`Over Depth in tag List ${this.item.name}`);
      return [];
    }
    return this._tagListRaw(user, depth);
  }

    private _tagListRaw(user : N<ValidAttackers>, depth: number): readonly TagType[] {
    const baseTags = this._tagListRawBase(user);
    const realTags = baseTags
      .map(tag=> TagManager.searchForPotentialTagMatch(tag))
      .filter( tag=> tag != undefined);
    const extraTags = realTags
      .flatMap(tag => tag.tags.tagListRaw(user, depth+1));
    if (extraTags.length == 0) {return baseTags;}
    const combinedTags = baseTags.slice();
    combinedTags.pushUnique(...extraTags);
    return combinedTags;
  }

  private _tagListRawBase(user : N<ValidAttackers>) : readonly TagType[] {
    const item = this.item;
    switch (true) {
      case item.isPower(): {
        return this.getTags_power(item, user);
      }

      case item.isConsumable(): {
        return this.getTags_consumable(item, user);
      }
      case item.isInvItem(): {
        return this.getTags_InvItem(item, user);
      }
      case item.isWeapon(): {
        return this.getTags_weapon(item, user);
      }
      case item.isSkillCard(): {
        return [
          'skill-card'
        ];
      }
      case item.isTalent():
      case item.isFocus() : {
        return this.getTags_talentOrFocus(item);
      }
      case item.isTag():
        return this.getTags_tag(item);
      case item.isCharacterClass():
      case item.isUniversalModifier():
      case item.isSocialCard():
        return [];
      default:
        PersonaError.softFail(`Unknown Item Type ${item.system.type} can't get tagList`);
        return [];
    }
  }

  private baseItemExtraTags(user: N<ValidAttackers>) : readonly TagType[] {
    const itemBase= this.item.itemBase;
    if (this.item == itemBase) {
      return [];
    }
    return itemBase.tags.tagListRaw(user);
  }

  private _getUniformAutoTags() : readonly TagType[] {
    if (!this.item.isPower()) {
      throw new PersonaError("Non-Power trying to get autotags");
    }
    return this._cache.autoTags_power.value;
    //if (this.cache.tags == undefined) {
    //  this.cache.tags = this.#autoTags_power(this.item);
    //  return this.cache.tags;
    //}
    ////Safety check to see if there's cache corruption
    //if (PersonaSettings.debugMode()) {
    //  const checkTags =  this.#autoTags_power(this.item);
    //  if (checkTags.length != this.cache.tags.length) {
    //    PersonaError.softFail(`Tag Length mismatch, possible cache corruption on ${this.item.name}`, checkTags, this.cache.tags);
    //  }
    //}
    // return this.cache.tags;
  }

  #autoTags_power(power : Power): TagType[] {
    const list : TagType [] = [];
    if (power.system.subtype == "weapon" || power.system.subtype == "magic") {
      list.pushUnique(power.system.subtype);
    }
    if (power.system.instantKillChance != 'none') {
      list.pushUnique('instantKill');
    }
    if (power.causesAilment()) {
      list.pushUnique('ailment');
      for (const ail of power.ailmentsCaused(false)) {
        if (POWER_TAGS[ail as keyof typeof POWER_TAGS] != undefined) {
          list.pushUnique(ail as keyof typeof POWER_TAGS);
        }
      }
    }
    switch (power.system.rarity) {
      case "rare":
        list.pushUnique("exotic");
        break;
      case "rare-plus":
        break;
      case "never":
        list.pushUnique("non-inheritable");
        list.pushUnique("exotic");
        break;
    }
    if (power.getBaseDamageType() == 'by-power') {
      list.pushUnique('variable-damage');
    }
    if (power.system.attacksMax > 1) {
      list.pushUnique('flurry');
    }
    if (power.isAoE()) {
      list.pushUnique("multi-target");
    }
    if (STATUS_AILMENT_POWER_TAGS.some(tag=> list.includes(tag))) {
      list.pushUnique('ailment');
    }
    const subtype : typeof POWER_TYPE_TAGS[number]  = power.system.subtype as typeof POWER_TYPE_TAGS[number];
    if (POWER_TYPE_TAGS.includes(subtype) && !list.includes(subtype)) { list.pushUnique(subtype);}
    list.pushUnique(...(power.system?.tags ?? []));
    return list;
  }

  //this can vary by user so has to be in its own function
  private getWeaponDamageTypeTags(power: Power, user: N<ValidAttackers>) :  TagType[] {
    const list : TagType[]  = [];
    if (power.system.damageLevel != "none") {
      const damageType = user ? power.getDamageType(user) : power.getBaseDamageType();
      switch (damageType) {
        case "none":
        case "all-out":
          break;
        case "cold":
          list.pushUnique("ice");
          break;
        case "by-power":
          list.pushUnique("variable-damage");
          break;
        case "lightning":
          list.pushUnique("elec");
          break;
        case "untyped":
          list.pushUnique("almighty");
          break;
        default:
          list.pushUnique(damageType);
      }
    }
    return list;
  }


  private getTags_power(item : Power, user: N<ValidAttackers>) : readonly TagType[] {
    const retTags : TagType[] = this._getUniformAutoTags().slice();
    if (item.getCooldown(user ?? null)) {
      retTags.pushUnique(`cooldown`);
    }
    const dmgTags = this.getWeaponDamageTypeTags(item, user ?? null);
    retTags.pushUnique(...dmgTags);
    return retTags;
  }

  private getTags_consumable(item : Consumable, user: N<ValidAttackers>) : readonly TagType[] {
    const list : TagType[] =
      ([] as TagType[])
      .concat( item.system.tags)
      .concat(item.system.itemTags)
      .pushUnique(...this.baseItemExtraTags(user ?? null));
    if (!list.includes(item.system.type as TagType)) {
      list.pushUnique(item.system.type as TagType);
    }
    if (!list.includes( item.getBaseDamageType() as typeof list[number]) && POWER_TAGS_LIST.includes( (item).getBaseDamageType() as typeof POWER_TAGS_LIST[number])) {
      if (item.getBaseDamageType() != "none") {
        list.pushUnique(item.getBaseDamageType());
      }
    }
    if (STATUS_AILMENT_POWER_TAGS.some(tag=> list.includes(tag))) {
      list.pushUnique('ailment');
    }
    const subtype = item.system.subtype;
    list.pushUnique(subtype);
    return list;
  }

  private getTags_InvItem(item : InvItem, user: N<ValidAttackers>) : readonly TagType[] {
    const list= (item.system.itemTags.slice() as TagType[])
      .pushUnique(...this.baseItemExtraTags(user ?? null));
    const subtype = item.system.slot;
    switch (subtype) {
      case 'body':
      case 'accessory':
      case 'weapon_crystal':
      case 'key-item':
        if (!list.includes(subtype))
        {list.pushUnique(subtype);}
        break;
      case 'none':
        list.pushUnique('non-equippable');
        break;
      case 'crafting':
        list.pushUnique('non-equippable');
        list.pushUnique('crafting');
        break;
      default:
        subtype satisfies never;
    }
    return list;
  }

  private getTags_weapon(item : Weapon, user: N<ValidAttackers>) : readonly TagType[] {
    const list = (item.system.itemTags.slice() as TagType[])
      .pushUnique(...this.baseItemExtraTags(user ?? null));
    if (!list.includes(item.getBaseDamageType() as typeof list[number]) && POWER_TAGS_LIST.includes(item.getBaseDamageType() as typeof POWER_TAGS_LIST[number])) {
      list.pushUnique( item.getBaseDamageType());
    }
    list.pushUnique(item.system.type as TagType);
    return list;
  }

  private getTags_talentOrFocus(item : Talent | Focus) : readonly TagType[] {
    const list : TagType[] = [];
    if (item.system.defensive) {
      list.pushUnique('defensive');
    } else {
      list.pushUnique('passive');
    }
    return list;
  }

  private getTags_tag(item : Tag) : readonly TagType[] {
    const tagList = (item.system.tags as TagType[])
    .concat (item.system.itemTags)
    .concat (item.system.tags);
    return tagList;
  }

}


type TagType = Tag["id"] | PowerTagOrId | EquipmentTagOrId;

