import {InternalCreatureTag, PersonaTag} from "../config/creature-tags.js";
import {Persona} from "./persona-class.js";
import {FullTag, TagManager} from "./tag-manager.js";
import {TimedCache} from "./utility/cache.js";

export class PersonaTagManager<PType extends Persona> extends TagManager<TagType> {
  private persona: PType;
  private cache : TimedCache<(PersonaTag | Tag["id"] | InternalCreatureTag)[]>;

  constructor (persona: PType) {
    super();
    this.persona = persona;
    this.cache = new TimedCache( () => this._tagListPartial());
  }

  clearCache() {
    this.cache.clear();
  }

  override tagList(_context?: null): readonly FullTag<TagType>[] {
    const ret =  this.tagListPartial()
      .flatMap( tag => TagManager.resolveTag(tag));
    return ret;
  }

  get source() { return this.persona.source; }
  get user() { return this.persona.user; }

  tagListPartial() : (PersonaTag | Tag["id"] | InternalCreatureTag)[] {
    return this.cache.value;
  }

  _tagListPartial() : (PersonaTag | Tag["id"] | InternalCreatureTag)[] {
    type ret = (PersonaTag | Tag["id"] | InternalCreatureTag)[];
    // const base = this.source.system.combat.personaTags.slice() as ret;
    const sources = [
      ...this.source.system.combat.personaTags.slice() as ret,
      ...this.source.system.creatureTags,
      ...this._autoTags(),
      ...this._getConferredTags(),
      ...this.userTypeTags(),
    ];
    const base = ([] as ret)
      .pushUnique(...this.idCheck(sources));

    // base.pushUnique (...this.source.system.creatureTags);
    // base.pushUnique(...this._autoTags());
    // base.pushUnique(...this._getConferredTags());
    // base.pushUnique(...this.userTypeTags());
    const extraTags = base.map(tag => TagManager.searchForPotentialTagMatch(tag))
      .filter (x=> x != undefined)
    //this maybe should be user instead of source
      .flatMap( tag=> tag.tags["tagListRaw"](this.source)) ;
    if (extraTags.length == 0) {return base;}
    const combinedTags = base.slice();
    combinedTags.pushUnique(...this.idCheck(extraTags) as TagType[]);
    return combinedTags;
  }

  userTypeTags() : TagType[]{
    switch (this.user.system.type) {
      case "pc":
        return ["pc"];
      case "npcAlly":
        return ["npc-ally"];
      case "shadow": {
        const list : TagType[] = [];
        list.pushUnique(this.user.system.creatureType as InternalCreatureTag);
        if (this.user.system.creatureType == "d-mon" && this.user.hasPlayerOwner) {
          list.pushUnique("pc-d-mon");
        }
        return list;
      }
      default:
        this.user.system satisfies never;
        return [];
    }
  }

  realTags() : Tag[] {
    return this.tagListPartial()
      .map( tag => TagManager.searchForPotentialTagMatch(tag))
      .filter ( tag => tag != undefined);
  }

  private _autoTags() : PersonaTag[] {
    const autoPTags :PersonaTag[]= [];
    if (this.source.isPC() || this.source.isNPCAlly()){
      autoPTags.pushUnique("persona");
    }
    if (this.user.isUsingMetaPod()) {
      autoPTags.pushUnique("simulated");
    }
    switch (this.source.system.creatureType) {
      case "enemy-metaverse-user":
      case "persona":
        autoPTags.pushUnique("persona");
        break;
      case "d-mon":
        autoPTags.pushUnique("d-mon");
        break;
    }
    if (this.source.isShadow()) {
      if ( this.source.system.creatureType == "daemon") {
        autoPTags.pushUnique("simulated");
      }
    }
    if (this.user.isShadow()) {
      if (this.user.system.role != "base") {
        autoPTags.pushUnique(this.user.system.role);
      }
      if (this.user.system.role2 != "base") {
        autoPTags.pushUnique(this.user.system.role2);
      }
    }
    if (autoPTags.includes("persona") && this.source.isPC() &&  this.source.hasSoloPersona) {
      autoPTags.pushUnique("lone-persona");
    }
    return autoPTags;
  }

  private _getConferredTags() {
    const extraTags = this.persona.allModifiers({omitPowers:true, omitTalents: true, omitTags: true, omitAuras: true})
      .flatMap( CE=> TagManager.getConferredTags(CE , this.user));
    return extraTags as TagType[];
  }

}
type TagType = PersonaTag | InternalCreatureTag;
