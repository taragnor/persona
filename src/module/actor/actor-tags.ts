import {InternalCreatureTag, PersonaTag} from "../../config/creature-tags.js";
import {FullTag, TagManager} from "../tag-manager.js";
import {TimedCache} from "../utility/cache.js";
import {PersonaActor} from "./persona-actor.js";

export class ActorTagManager<AType extends PersonaActor> extends TagManager<TagType>{
  actor: AType;

  static CACHE_EXPIRATION_TIME = 1000;
  private cache : {
    tagList: TimedCache<FullTag<TagType>[]> ;
    tagListRaw: TimedCache<TagType[]> ;
  };


  constructor (actor: AType) {
    super();
    this.actor = actor;
    this.cache = {
      tagList: new TimedCache( () => this._tagListGen(),
        ActorTagManager.CACHE_EXPIRATION_TIME),
      tagListRaw: new TimedCache( () => this._tagListRawGen(),
        ActorTagManager.CACHE_EXPIRATION_TIME),
    };
  }


  get system() {return this.actor.system;}

  clearCache() {
    for (const cache of Object.values(this.cache)) {
      cache.clear();
    }
  }


  tagList(_context?: null ) : (Tag | InternalCreatureTag)[] {
    return this.cache.tagList.value;
  }

  _tagListGen() : (Tag | InternalCreatureTag)[] {
    const tagList = this.tagListRaw
      .map(tag => TagManager.searchForPotentialTagMatch(tag) ?? (tag as InternalCreatureTag));
    return tagList;
  }


  get tagListRaw() : (InternalCreatureTag | Tag["id"] | PersonaTag)[]
  {
    return this.cache.tagListRaw.value;
  }

  private _tagListRawGen() : (InternalCreatureTag | Tag["id"])[] {
    const actor = this.actor;
    if (actor.isTarot()) { return []; }
    const list : (Tag["id"] | InternalCreatureTag)[] = this.system.creatureTags.slice();
    if (this.actor.isValidCombatant()) {
      const p = this.actor.persona();
      const personaTags = p.tags.tagListPartial();
      list.pushUnique(...personaTags as TagType[]);
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
        list.pushUnique(this.system.creatureType as InternalCreatureTag);
        if (this.system.creatureType == "d-mon" && this.actor.hasPlayerOwner) {
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

  realTags() : Tag[] {
    return this.tagListRaw
      .map( tag => TagManager.searchForPotentialTagMatch(tag))
      .filter ( tag => tag != undefined);
  }

}

type TagType = Tag["id"] | InternalCreatureTag;

