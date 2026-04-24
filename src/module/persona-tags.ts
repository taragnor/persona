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

  resetCache() {
    this.cache.clear();
  }

  override tagList(_context?: null): readonly FullTag<TagType>[] {
    const ret =  this.tagListPartial()
      .flatMap( tag => TagManager.resolveTag(tag));
    return ret;
    // const ret =  this.tagListPartial().flatMap( tag => {
    //   const IdCheck = PersonaDB.allTags().get(tag as Tag["id"]);
    //   if (IdCheck) {return [IdCheck];}
    //   const nameCheck = PersonaDB.allTagLinks().get(tag);
    //   if (nameCheck) {return [nameCheck];}
    //   return [];
    // });
    // return ret;
  }

  get source() { return this.persona.source; }
  get user() { return this.persona.user; }

  tagListPartial() : (PersonaTag | Tag["id"] | InternalCreatureTag)[] {
    return this.cache.value;
  }

  _tagListPartial() : (PersonaTag | Tag["id"] | InternalCreatureTag)[] {
    type ret = (PersonaTag | Tag["id"] | InternalCreatureTag)[];
    const base = this.source.system.combat.personaTags.slice() as ret;
    base.pushUnique (...this.source.system.creatureTags);
    base.pushUnique(...this._autoTags());
    base.pushUnique(...this._getConferredTags());
    return base;
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
    const extraTags = this.persona.mainModifiers({omitPowers:true, omitTalents: true, omitTags: true, omitAuras: true})
      .flatMap( CE=> TagManager.getConferredTags(CE , this.user));
    return extraTags as TagType[];
  }

}
type TagType = PersonaTag | InternalCreatureTag;
