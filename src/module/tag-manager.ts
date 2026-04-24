import {Consequence} from "../config/consequence-types.js";
import {ConditionalEffectC} from "./conditionalEffects/conditional-effect-class.js";
import {PersonaItem} from "./item/persona-item.js";
import {PersonaDB} from "./persona-db.js";

export abstract class TagManager<TagTypeRaw extends string = string> {

  abstract tagList(context: N<unknown>): readonly FullTag<TagTypeRaw>[];

  hasTag<T extends Tag | TagTypeRaw> (tagOrArr: T | T[], ...args: Parameters<this["tagList"]>):  boolean {
    //@ts-expect-error TS hates this but it should work
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    const list = this.tagList(...args as any);
    const tags = this.getTagArr(tagOrArr);
    return TagManager.hasTag(list, tags);
  }

  static hasTag( tagListToSearch: readonly (Tag | string)[], tagsToLookFor: (string | Tag)[]) : boolean {
    const modTagList = tagsToLookFor.map( tag => tag instanceof PersonaItem ? tag.system.linkedInternalTag ?? tag.id : tag);
    return modTagList.some( tag=> tagListToSearch
      .some(t=> t instanceof PersonaItem ? t.system.linkedInternalTag == tag || t.id == tag : t == tag )
    );
  }

  private getTagArr <T extends TagTypeRaw | FullTag<TagTypeRaw>> (tags: T | T[]) : T[] {
    if (!Array.isArray(tags)) {
      return [tags];
    }
    return tags;
  }

  static resolveTag<const T extends (string | Tag | Tag["id"])>(tag: T) : Tag | Exclude<T, Tag | Tag["id"]>  {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    if (tag instanceof PersonaItem) {return tag as Tag;}
    const tagGetTest = PersonaDB.allTags().get(tag as Tag["id"]);
    if (tagGetTest) {return tagGetTest;}
    const linkTagTest = PersonaDB.allTagLinks().get(tag);
    if (linkTagTest) {return linkTagTest;}
    return tag as Exclude<T, Tag | Tag["id"]>;
  }

  static searchForPotentialTagMatch (idOrInternalTag: string) : U<Tag> {
    const IdCheck = PersonaDB.allTags().get(idOrInternalTag as Tag["id"]);
    if (IdCheck) {return IdCheck;}
    const linkedNameCheck = PersonaDB.allTagLinks().get(idOrInternalTag);
    if (linkedNameCheck) {return linkedNameCheck;}
    const realNameCheck = PersonaDB.allTagNames().get(idOrInternalTag);
    if (realNameCheck) {return realNameCheck;}
    return undefined;
  }

  static getConferredTags (eff: ConditionalEffectC, actor: ValidAttackers) : (string | Tag["id"])[] {
    const situation = {
      user: actor.accessor,
    };
    //need this double check to prevent infinite loops
    const hasTagGivingCons =  eff.consequences.filter( c=> c.type == 'add-creature-tag') as (Consequence & {type : 'add-creature-tag'})[] ;
    if (hasTagGivingCons.length == 0) {return [];}
    const activeCons = eff.getActiveConsequences(situation);
    const tagGivingCons =  activeCons.filter( c=> c.type == 'add-creature-tag') as (Consequence & {type : 'add-creature-tag'})[] ;
    return tagGivingCons.map( x=> x.creatureTag);
  }

}


export type FullTag<TagTypeRaw extends string> = Exclude<TagTypeRaw | Tag, Tag["id"]>;



