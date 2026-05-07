import {TarotCard} from "../../config/tarot.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSounds} from "../persona-sounds.js";
import {testPreconditions} from "../preconditions.js";
import {PersonaSocial} from "../social/persona-social.js";
import {TimedCache} from "../utility/cache.js";
import {Logger} from "../utility/logger.js";
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
    this.cache.clear();
  }

  async update(...args: Parameters<PersonaActor["update"]>) {
    await this.actor.update(...args);
    this.clearCache();
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
    const courage = actor.getSocialStat("courage").total({user:actor.accessor});
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
    await this.update( {"system.activities": act});
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
      relationshipType = relationshipType ? relationshipType : npc.social.baseRelationship;
      if (npc.isNPC()) {
        const allFocii = npc.social.getSocialFocii_NPC(npc);
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
          const allFocii = personalLink.social.getSocialFocii_PC(personalLink, npc as PC);
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
          const allFocii = teammate.social.getSocialFocii_PC(teammate, npc as PC);
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
    const data = this.actor.getFlag<DowntimeActionData>("persona", "socialActions");
    return data ? data[type] ?? 0 : 0;
  }

  async expendDowntimeAction(this: ActorSocial<PC>, type: keyof DowntimeActionData)  {
    await this.alterDowntimeAction(type, -1);
  }

  hasMainSocialAction(this: ActorSocial<PC>) : boolean {
    return this.getDowntimeActionsRemaining("standard") > 0;
  }

  hasMinorSocialAction(this: ActorSocial<PC>) : boolean {
    return this.getDowntimeActionsRemaining("minor") > 0;
  }

  async alterDowntimeAction(this: ActorSocial<PC>, type: keyof DowntimeActionData, amt = -1 )  {
    const data = this.actor.getFlag<DowntimeActionData>("persona", "socialActions") ?? {minor: 0, standard:0};
    const old = data[type];
    data[type]= Math.max( 0, data[type]+amt);
    await this.actor.setFlag("persona", "socialActions", data);
    if (amt > 0) {
      void Logger.sendToChat( ` ${this.actor.name} gained ${amt} extra ${type} Downtime action (previous: ${old})`);
    }
  }

  getSocialLinkActor(socialLinkId: N<SocialLink["id"] | SocialLink>) : U<SocialLink> {
    if (!socialLinkId) {return undefined;}
    if (!this.actor.isPC()) {return undefined;}
    if (socialLinkId instanceof PersonaActor) {return socialLinkId;}
    return this.actor.system.social.find( x=> x.linkId == socialLinkId) as U<SocialLink>;
  }

  async spendInspiration(this: ActorSocial<PC>, socialLinkOrId:SocialLink | SocialLink["id"], amt: number = 1): Promise<void> {
    const id = typeof socialLinkOrId == "string" ? socialLinkOrId : socialLinkOrId.id;
    const link = this.actor.system.social.find( x=> x.linkId == id);
    if (!link) {
      throw new PersonaError("Trying to refresh social link you don't have");
    }
    if (link.inspiration <= 0) {
      throw new PersonaError("You are trying to spend Inspiration you don't have");
    }
    link.inspiration -= amt;
    link.inspiration = Math.max(0, link.inspiration);
    link.inspiration = Math.min(link.linkLevel, link.inspiration);
    await this.update({"system.social": this.actor.system.social});
  }

  getInspirationWith(linkId: SocialLink["id"]): number {
    if (!this.actor.isPC()) {return 0;}
    const link = this.actor.system.social.find( x=> x.linkId == linkId);
    if (!link) {return 0;}
    return link.inspiration;
  }

  async addInspiration(this: ActorSocial<PC>, linkId:SocialLink["id"] | SocialLink, amt: number) {
    if (linkId instanceof PersonaActor) {
      linkId = linkId.id;
    }
    const link = this.actor.system.social.find( x=> x.linkId == linkId);
    if (!link) {
      throw new PersonaError("Trying to refresh social link you don't have");
    }
    link.inspiration += amt;
    link.inspiration = Math.min(link.linkLevel, link.inspiration);
    await this.update({"system.social": this.actor.system.social});
  }

  getSocialFocii_PC(this: ActorSocial<NPC>, linkHolder: SocialLink, targetPC: PC) : Focus[] {
    const sortFn = function (a: Focus, b: Focus) {
      return a.requiredLinkLevel() - b.requiredLinkLevel();
    };
    const focii = this.actor.items.filter( x=> x.isFocus()) as Focus[];
    const tarot = targetPC.tarot;
    if (!tarot) {
      console.debug(`No tarot found for ${this.actor.name} or ${linkHolder.name}`);
      return focii.sort( sortFn);
    }
    const tarotFocii = tarot.items.filter( x=> x.isFocus()) as Focus[];
    return focii.concat(tarotFocii).sort(sortFn);
  }

  getSocialFocii_NPC(this: ActorSocial<NPC>, linkHolder: SocialLink) : Focus[] {
    const sortFn = function (a: Focus, b: Focus) {
      return a.requiredLinkLevel() - b.requiredLinkLevel();
    };
    const focii = this.actor.items.filter( x=> x.isFocus()) as Focus[];
    const tarot = this.tarot ?? linkHolder.tarot;
    if (!tarot) {
      console.debug(`No tarot found for ${this.actor.name} or ${linkHolder.name}`);
      return focii.sort( sortFn);
    }
    const tarotFocii = tarot.items.filter( x=> x.isFocus()) as Focus[];
    return focii.concat(tarotFocii).sort(sortFn);
  }

  getAllSocialFocii() : Focus[] {
    if (!this.actor.isPC()) {return [];}
    const x = this.socialLinks()
      .flatMap( link => link.focii);
    return x;
  }

  async createSocialLink(this: ActorSocial<PC>, npc: SocialLink) {
    if (this.actor.system.social.find( x=> x.linkId == npc.id)) {
      return;
    }
    this.actor.system.social.push(
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
    await this.update({"system.social": this.actor.system.social});
    await Logger.sendToChat(`${this.actor.name} forged new social link with ${npc.displayedName} (${npc.tarot?.name}).` , this.actor);
  }

  get baseRelationship(): string {
    switch (this.actor.system.type) {
      case "pc":
        return "PEER";
      case "npc": case "npcAlly":
        return "PEER";
      case "shadow":
      case "tarot":
        break;
      default:
        this.actor.system satisfies never;
    }
    return "NONE";
  }

  async increaseSocialLink(this: ActorSocial<PC>, linkId: string) {
    const link = this.actor.system.social.find( x=> x.linkId == linkId);
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
    await this.update({"system.social": this.actor.system.social});
    const target = game.actors.get(link.linkId) as NPC | PC;
    if (target) {
      await Logger.sendToChat(`${this.actor.name} increased Social Link with ${target.displayedName} (${target.tarot?.name}) to SL ${link.linkLevel}.` , this.actor);
    }
  }

  async decreaseSocialLink(this: ActorSocial<PC>, linkId: string) {
    const link = this.actor.system.social.find( x=> x.linkId == linkId);
    if (!link) {
      throw new PersonaError("Trying to decrease social link you don't have");
    }
    if (link.linkLevel >= 10) {
      throw new PersonaError("Social Link is already maxed out");
    }
    link.linkLevel -=1 ;
    link.inspiration = link.linkLevel;
    void PersonaSounds.socialLinkReverse();
    if (link.linkLevel == 0) {
      const newSocial = this.actor.system.social.filter( x=> x != link);
      await this.update({"system.social": newSocial});
      return;
    }
    await this.update({"system.social": this.actor.system.social});
  }

  getSocialLinkProgress(this: ActorSocial<PC>, linkId: SocialLink["id"] | Activity["id"]) : number {
    const link = this.actor.system.social.find( x=> x.linkId == linkId);
    if (!link) {
      return 0;
    }
    return link.currentProgress;
  }

  async alterSocialLinkProgress(this: ActorSocial<PC>, linkId: string, progress: number) {
    return await this.socialLinkProgress(linkId, progress);
  }

  async socialLinkProgress(this: ActorSocial<PC>, linkId: string, progress: number) {
    const link = this.actor.system.social.find( x=> x.linkId == linkId);
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
    await this.update({"system.social": this.actor.system.social});
    await Logger.sendToChat(`${this.actor.name} added ${progress} progress tokens to link ${linkActor?.name} (original Value: ${orig})` , this.actor);
  }

  async activityProgress(this: ActorSocial<PC>, activityId :string, progress: number) {
    const activityData = this.actor.system.activities.find( x=> x.linkId == activityId);
    if (!activityData) {
      PersonaError.softFail("Trying to increase activty you don't have");
      return;
    }
    const orig = activityData.currentProgress;
    activityData.currentProgress = Math.max(0,progress + activityData.currentProgress);
    await this.update({"system.activities": this.actor.system.activities});
    const activity = PersonaDB.allActivities().find( act=> act.id == activityId);
    await Logger.sendToChat(`${this.actor.name} added ${progress} progress tokens to ${activity?.name ?? "unknown activity"} (original Value: ${orig})` , this.actor);
  }

  async activityStrikes(this: ActorSocial<PC>, activityId: string, strikes: number) {
    const activityData = this.actor.system.activities.find( x=> x.linkId == activityId);
    if (!activityData) {
      throw new PersonaError("Trying to increase activty you don't have");
    }
    const orig = activityData.strikes;
    activityData.strikes = Math.max(0,strikes + activityData.strikes);
    await this.update({"system.activities": this.actor.system.activities});
    const activity = PersonaDB.allActivities().find( act=> act.id == activityId);
    await Logger.sendToChat(`${this.actor.name} added ${strikes} strikes to ${activity?.name ?? "unknown activity"} (original Value: ${orig})` , this.actor);
  }

  async refreshSocialLink(this: ActorSocial<PC>, npc: SocialLink) {
    const link = this.actor.system.social.find( x=> x.linkId == npc.id);
    if (!link) {
      throw new PersonaError(`Trying to refresh social link ${this.actor.name} doesn't have: ${npc.name} `);
    }
    link.inspiration = link.linkLevel;
    await this.update({"system.social": this.actor.system.social});
  }

  get minorActions() : number {
    if (!this.actor.isPC()) {return 0;}
    return (this as ActorSocial<PC>).getDowntimeActionsRemaining("minor");
  }

  get majorActions() : number {
    if (!this.actor.isPC()) {return 0;}
    return (this as ActorSocial<PC>).getDowntimeActionsRemaining("standard");
  }

}

export interface DowntimeActionData {
  minor: number;
  standard: number;
};



