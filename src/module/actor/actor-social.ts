import {PersonaSettings} from "../../config/persona-settings.js";
import {TarotCard} from "../../config/tarot.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {testPreconditions} from "../preconditions.js";
import {PersonaSocial} from "../social/persona-social.js";
import {TimedCache} from "../utility/cache.js";
import {PersonaActor, SocialBenefit} from "./persona-actor.js";

export class ActorSocial <T extends PersonaActor> {
  private actor: T;

  cache : TimedCache<readonly SocialLinkData[]>;

  constructor (parent: T) {
    this.actor = parent;
    this.cache = new TimedCache( () => this._refreshSocialLinkData(), 3000);
  }

  get parent() {
    return this.actor;
  }

  clearCache() : void {

  }

  get tarot() {
    return this.actor.tarot;
  }

  isSocialLink(): this is SocialLink {
    const actor = this.actor;
    if (!actor.isNPC() && !actor.isPC()) {
      return false;
    }
    if (this.tarot == undefined) {return false;}
    return true;
  }

  get socialInit(): number {
    const actor = this.actor;
    if (!actor.isPC()) {return -999;}
    const courage= actor.getSocialStat("courage").total({user:actor.accessor});
    const diligence = actor.getSocialStat("diligence").total({user:actor.accessor});
    return courage + diligence;
  }

  getSocialSLWithTarot( this: ActorSocial<PC>, tarot: TarotCard | Tarot) : number {
    const actor = this.actor;
    tarot = tarot instanceof PersonaActor ? tarot.name as TarotCard : tarot;
    const link= actor.socialLinks.find(
      link => link.actor.tarot?.name == tarot);
    if (!link) {return 0;}
    return link.linkLevel;
  }

  getSocialSLWith( sl : Tarot | SocialLink | UniversalActorAccessor<SocialLink>) : number {
    if (!this.actor.isPC()) {return 0;}
    if (sl instanceof PersonaActor && sl.isTarot()) {
      return (this as ActorSocial<PC>).getSocialSLWithTarot(sl);
    }
    if ("actorId" in sl) {
      sl = PersonaDB.findActor(sl);

    }
    const linkData= this.actor.system.social.find( x=> x.linkId == sl.id);
    if (!linkData) {return 0;}
    return linkData.linkLevel;
  }

  /** returns the total SLs that the PCs have with this character*/
  get totalSLs() : number {
    switch (this.actor.system.type) {
      case "shadow":
      case "tarot": return 0;
      case "pc":
      case "npc":
      case "npcAlly": {
        let targetActor : NPC | PC | NPCAlly = this.actor as PC;
        if (this.actor.isNPCAlly()) {
          const proxy = this.actor.getNPCProxyActor();
          if (!proxy) {return 0;}
          targetActor = proxy;
        }
        return PersonaDB.realPCs()
        .reduce( (acc, pc) => acc + pc.getSocialSLWith(targetActor), 0);
      }
      default:
        this.actor.system satisfies never;
        return -1;
    }
  }

  get socialBenefits() : SocialBenefit[] {
    const actor = this.actor;
    let focuses : Focus[] = [];
    switch (actor.system.type) {
      case "pc": return [];
      case "shadow": return [];
      case "tarot":
        focuses = (actor as Tarot).focii();
        break;
      case "npc": case "npcAlly":
        focuses = (actor as NPC | NPCAlly).focii()
          .concat(this.tarot?.focii() ?? []);
        break;
      default:
          actor.system satisfies never;
        throw new PersonaError("Unknwon type");
    }
    focuses.sort((a, b) => a.requiredLinkLevel() - b.requiredLinkLevel() );
    return focuses.map( focus =>({
      id: actor.id,
      focus,
      lvl_requirement: focus.requiredLinkLevel(),
    })) ;
  }

  highestLinker(this: ActorSocial<SocialLink>) : {pc: PC | null, linkLevel: number} {
    const listOfLinkers = (game.actors.contents as PersonaActor[])
      .filter( x=> x.isPC() && x != this.actor)
      .map( (pc : PC)=> ({
        pc,
        highest: pc.socialLinks
        .find( link=> link.actor == this.actor)
        ?.linkLevel ?? 0
      }))
      .sort ( (a,b) => b.highest - a.highest);
    const highest = listOfLinkers[0];
    if (!highest || highest.highest == 0) {
      return {pc: null, linkLevel: 0};
    }
    return {pc : highest.pc, linkLevel: highest.highest};
  }

  async addNewActivity(this: ActorSocial<PC>, activity: Activity) {
    const act= this.actor.system.activities;
    if (act.find(x=> x.linkId == activity.id))
    {return;}
    const item : typeof act[number] = {
      linkId: activity.id,
      strikes: 0,
      currentProgress: 0,
    };
    act.push( item);
    await this.actor.update( {"system.activities": act});
  }

  get activityLinks() : ActivityLink[] {
    if (!this.actor.isPC()) {return [];}
    return this.actor.system.activities
      .flatMap( aData => {
        const activity = PersonaDB.allActivities().find(x=> x.id == aData.linkId);
        if (!activity) {return [];}
        const aLink : ActivityLink = {
          strikes: aData.strikes ?? 0,
          available: PersonaSocial.isAvailable(activity, this.actor as PC),
          currentProgress: aData.currentProgress,
          activity,
        };
        return aLink;
      });
  }

  isDating(linkId: string) : boolean;
  isDating( link: PersonaActor) : boolean;

  isDating( sl: PersonaActor | string) : boolean {
    switch (this.actor.system.type) {
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
        return target.social.isDating(this.actor as NPC);
      }
      case "pc":
        break;
      default:
        this.actor.system satisfies never;
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        PersonaError.softFail(`Unexpected Date type: ${this.actor.system["type"] as unknown}`);
        return false;
    }
    if (this.actor.system.type != "pc") {return false;}
    const id = sl instanceof PersonaActor ? sl.id: sl;
    const link =  this.actor.system.social.find(x=> x.linkId == id);
    if (!link) {return false;}
    return link.isDating || link.relationshipType == "DATE";
  }

  socialLinks() : readonly SocialLinkData[] {
    if (!this.actor.isPC() || !PersonaDB.isLoaded) {return [] as SocialLinkData[];}
    return this.cache.value;
  }

  private _refreshSocialLinkData() : readonly SocialLinkData[] {
    if (!this.actor.isPC() || !PersonaDB.isLoaded) {return [] as SocialLinkData[];}
    return this.actor.system.social.flatMap(({linkId, linkLevel, inspiration, currentProgress, relationshipType}) => {
      const npc = PersonaDB.getActor(linkId);
      if (!npc) {return [];}
      function meetsSL(linkLevel: number, focus:Focus) {
        return linkLevel >= focus.requiredLinkLevel();
      };
      const isDating = relationshipType == "DATE";
      relationshipType = relationshipType ? relationshipType : npc.baseRelationship;
      if (npc.isNPC()) {
        const allFocii = (npc).getSocialFocii_NPC(npc);
        const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
        return [{
          currentProgress,
          linkLevel,
          inspiration,
          relationshipType,
          actor:npc,
          linkBenefits: npc,
          allFocii,
          available: npc.social.isAvailable(this.actor as PC),
          // available: PersonaSocial.isAvailable(npc, this),
          focii: qualifiedFocii,
          isDating,
        }];
      } else {
        if (npc == this.actor) {
          const personalLink = PersonaDB.personalSocialLink();
          if (!personalLink)  {
            return [];
          }
          const allFocii = personalLink.getSocialFocii_PC(personalLink, npc as PC);
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
            available: (npc as PC).social.isAvailable(this.actor as PC),
            isDating,
          }];
        } else {
          const teammate = PersonaDB.teammateSocialLink();
          if (!teammate)  {
            return [];
          }
          const allFocii = teammate.getSocialFocii_PC(teammate, npc as PC);
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
            available: (npc as NPC).social.isAvailable(this.actor as PC),
            isDating,
          }];
        }
      }
    })
      .sort((a, b) => (a.actor.tarot?.system.sortOrder ?? 99) - (b.actor.tarot?.system.sortOrder ?? 99));
  }

  // private _refreshSocialLinkData() : readonly SocialLinkData[] {
  //   if (!this.actor.isPC() || !PersonaDB.isLoaded) {return [] as SocialLinkData[];}
  //   function meetsSL(linkLevel: number, focus:Focus) {
  //     return linkLevel >= focus.requiredLinkLevel();
  //   };
  //   const PersonaCaching = PersonaSettings.agressiveCaching();
  //   if (!PersonaCaching || this.cache.socialData == undefined) {
  //     this.cache.socialData = this.system.social.flatMap(({linkId, linkLevel, inspiration, currentProgress, relationshipType}) => {
  //       const npc = PersonaDB.getActor(linkId);
  //       if (!npc) {return [];}
  //       const isDating = relationshipType == "DATE";
  //       relationshipType = relationshipType ? relationshipType : npc.baseRelationship;
  //       if (npc.isNPC()) {
  //         const allFocii = (npc).getSocialFocii_NPC(npc);
  //         const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
  //         return [{
  //           currentProgress,
  //           linkLevel,
  //           inspiration,
  //           relationshipType,
  //           actor:npc,
  //           linkBenefits: npc,
  //           allFocii,
  //           available: PersonaSocial.isAvailable(npc, this),
  //           focii: qualifiedFocii,
  //           isDating,
  //         }];
  //       } else {
  //         if (npc == this) {
  //           const personalLink = PersonaDB.personalSocialLink();
  //           if (!personalLink)  {
  //             return [];
  //           }
  //           const allFocii = personalLink.getSocialFocii_PC(personalLink, npc as PC);
  //           const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
  //           return [{
  //             currentProgress,
  //             linkLevel,
  //             inspiration,
  //             relationshipType,
  //             actor:npc as SocialLink,
  //             linkBenefits: personalLink,
  //             allFocii: allFocii,
  //             focii: qualifiedFocii,
  //             available: PersonaSocial.isAvailable(npc as PC, this),
  //             isDating,
  //           }];
  //         } else {
  //           const teammate = PersonaDB.teammateSocialLink();
  //           if (!teammate)  {
  //             return [];
  //           }
  //           const allFocii = teammate.getSocialFocii_PC(teammate, npc as PC);
  //           const qualifiedFocii = allFocii.filter( f=> meetsSL(linkLevel, f));
  //           return [{
  //             currentProgress,
  //             linkLevel,
  //             inspiration,
  //             relationshipType,
  //             actor:npc as SocialLink,
  //             linkBenefits: teammate,
  //             allFocii: allFocii,
  //             focii: qualifiedFocii,
  //             available: PersonaSocial.isAvailable(npc as PC, this),
  //             isDating,
  //           }];
  //         }
  //       }
  //     })
  //       .sort((a, b) => (a.actor.tarot?.system.sortOrder ?? 99) - (b.actor.tarot?.system.sortOrder ?? 99));
  //   }
  //   return this.cache.socialData;
  // }

  get unrealizedSocialLinks() : (NPC | PC)[] {
    if (!this.actor.isPC()) {return [];}
    const currentLinks = this.actor.system.social.map(x=> x.linkId);
    const list = PersonaDB.socialLinks()
      .filter( x=> !currentLinks.includes(x.id))
      .filter( (x : PC | NPC)=> Object.values(x.system.weeklyAvailability).some(x=> x == true))
      .filter( (x : PC | NPC)=> Boolean(x.system.tarot));
    return list;
  }

    isAvailable(this: ActorSocial<SocialLink>, pc: PC): boolean {
      const sl = this.actor;
      const sit: Situation = {
        user: pc.accessor,
        target: sl.accessor,
      };
      if(!testPreconditions(sl.getAvailabilityConditions(), sit)) {
        return false;
      }
      if (PersonaSocial.availabilityDisqualifierStatuses.some (st=> sl.hasStatus(st))) {return false;}
      const availability = sl.system.weeklyAvailability;
      if (!pc.canTakeNormalDowntimeActions()) {
        // 		ui.notifications.warn("You're currently unable to take this action, you must recover first");
        return false;
      }
      return availability?.available ?? false;
    }

  async refreshSocialActions( this: ActorSocial<PC>) {
    const socialActions = {
      minor: 1,
      standard: 1,
    };
    await this.actor.setFlag("persona", "socialActions", socialActions);
  }

  getDowntimeActionsRemaining(this: ActorSocial<PC>, type: keyof DowntimeActionData) : number {
    if (PersonaSettings.debugMode()) {return 1;}
    const data = this.actor.getFlag<DowntimeActionData>("persona", "socialActions");
    return data ? data[type] ?? 0 : 0;
  }

  async expendDowntimeAction(this: ActorSocial<PC>, type: keyof DowntimeActionData)  {
    await this.alterDowntimeAction(type, -1);
    // const data = this.actor.getFlag<DowntimeActionData>("persona", "socialActions") ?? {minor: 0, standard:0};
    // data[type]= Math.max( 0, data[type]-1);
    // await this.actor.setFlag("persona", "socialActions", data);
  }

  hasMainSocialAction(this: ActorSocial<PC>) : boolean {
    return this.getDowntimeActionsRemaining("standard") > 0;
  }

  hasMinorSocialAction(this: ActorSocial<PC>) : boolean {
    return this.getDowntimeActionsRemaining("minor") > 0;
  }

  async alterDowntimeAction(this: ActorSocial<PC>, type: keyof DowntimeActionData, amt = -1 )  {
    const data = this.actor.getFlag<DowntimeActionData>("persona", "socialActions") ?? {minor: 0, standard:0};
    data[type]= Math.max( 0, data[type]+amt);
    await this.actor.setFlag("persona", "socialActions", data);
  }

}

export interface DowntimeActionData {
  minor: number;
  standard: number;
};



