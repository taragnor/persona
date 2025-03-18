import { TriggeredEffect } from "../triggered-effect.js";
import { shadowRoleMultiplier } from "../../config/shadow-types.js";
import { BANEFUL_STATUSES_MAP } from "../../config/status-effects.js";
import { RealDamageType } from "../../config/damage-types.js";
import { DamageType } from "../../config/damage-types.js";
import { SkillCard } from "../item/persona-item.js";
import { UsableAndCard } from "../item/persona-item.js";
import { ValidSocialTarget } from "../social/persona-social.js";
import { ValidAttackers } from "../combat/persona-combat.js";
import { FlagData } from "../../config/actor-parts.js";
import { TarotCard } from "../../config/tarot.js";
import { removeDuplicates } from "../utility/array-tools.js";
import { testPreconditions } from "../preconditions.js";
import { CreatureTag } from "../../config/creature-tags.js";
import { PersonaSocial } from "../social/persona-social.js";
import { TAROT_DECK } from "../../config/tarot.js";
import { localize } from "../persona.js";
import { STATUS_EFFECT_LIST } from "../../config/status-effects.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../../config/status-effects.js";
import { ELEMENTAL_DEFENSE_LINK } from "../../config/damage-types.js";
import { RESIST_STRENGTH_LIST } from "../../config/damage-types.js";
import { Activity } from "../item/persona-item.js";
import { RecoverSlotEffect } from "../../config/consequence-types.js";
import { getActiveConsequences } from "../preconditions.js";
import { PersonaCombat } from "../combat/persona-combat.js";
import { PersonaActorSheetBase } from "./sheets/actor-sheet.base.js";
import { Logger } from "../utility/logger.js";
import { Situation } from "../preconditions.js";
import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { Consumable } from "../item/persona-item.js";
import { SocialStat } from "../../config/student-skills.js";
import { UniversalActorAccessor } from "../utility/db-accessor.js";
import { ConditionalEffect } from "../datamodel/power-dm.js";
import { PersonaError } from "../persona-error.js";
import { PersonaSounds } from "../persona-sounds.js";
import { Usable } from "../item/persona-item.js";
import { CClass } from "../item/persona-item.js";
import { ModifierTarget } from "../../config/item-modifiers.js";
import { StatusEffectId } from "../../config/status-effects.js";
import { DAMAGETYPESLIST } from "../../config/damage-types.js";
import { ResistStrength } from "../../config/damage-types.js";
import { StatusEffect } from "../../config/consequence-types.js";
import { ModifierList } from "../combat/modifier-list.js";
import { Talent } from "../item/persona-item.js";
import { Focus } from "../item/persona-item.js";
import { ModifierContainer } from "../item/persona-item.js";
import { InvItem } from "../item/persona-item.js";
import { Weapon } from "../item/persona-item.js";
import { Power } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";
import { ACTORMODELS } from "../datamodel/actor-types.js"
import { PersonaItem } from "../item/persona-item.js"
import { PersonaAE } from "../active-effect.js";
import { StatusDuration } from "../active-effect.js";

export class PersonaActor extends Actor<typeof ACTORMODELS, PersonaItem, PersonaAE> {
   declare statuses: Set<StatusEffectId>;
   declare sheet: PersonaActorSheetBase;

   static MPMap = new Map<number, number>;

   cache: {
      tarot: Tarot | undefined;
   };

   constructor(...arr: any[]) {
      super(...arr);
      this.cache = {
         tarot: undefined,
      }
   }

   get mp() : number {
      switch (this.system.type) {
         case "npcAlly":
         case "pc": break;
         case "shadow":
         case "npc":
         case "tarot":
            return 0;
         default: this.system satisfies never;
            return 0;
      }
      return this.system.combat.mp.value;
   }

   async setAsNavigator(this: NPCAlly) {
      for (const ally of PersonaDB.NPCAllies()) {
         if (ally == this) continue;
         if (!ally.system.combat.isNavigator) continue;
         if (!ally.isOwner) {
            PersonaError.softFail(`Can't change navigator status on ${ally.name}, no ownership`);
            continue;
         }
         await ally.update({ "system.combat.isNavigator": false});
      }
      // await this.update({ "system.combat.isNavigator": true});
      PersonaDB.clearCache();
      if (PersonaDB.getNavigator() != this) {
         PersonaError.softFail("Navigator was set improperly");
         return;
      }
      await Logger.sendToChat(`${this.name} set to party navigator`, this);
   }

   get mmp() : number {
      switch (this.system.type) {
         case "npcAlly": case "pc":
            break;
         case "shadow": case "npc": case "tarot":
            return 0;
         default:
            this.system satisfies never;
            return 0;
      }
      const sit ={user: PersonaDB.getUniversalActorAccessor(this as PC)};
      const bonuses = this.getBonuses("maxmp");
      const mult = 1 + this.getBonuses("maxmpMult").total(sit);
      const lvlmaxMP = (this as PC | NPCAlly).calcBaseClassMMP();
      const val = Math.round((mult * (lvlmaxMP)) + bonuses.total(sit));
      (this as PC | NPCAlly).refreshMaxMP(val);
      return val;
   }

   calcBaseClassMMP(this: PC | NPCAlly): number {
      const lvl = this.system.combat.classData.level;

      const inc = this.system.combat.classData.incremental.mp;
      const mpBase = Math.round(PersonaActor.calcMP(lvl));
      const mpNext = Math.round(PersonaActor.calcMP(lvl + 1));
      const diff = mpNext - mpBase;
      return mpBase + Math.round((inc/3 * diff));
   }

   static calcMP (level: number) : number {
      const mapVal = this.MPMap.get(level);
      if (mapVal != undefined) {
         return mapVal;
      }
      if (level <= 1) return 50;
      const prevMP = this.calcMP(level -1);
      const MP = prevMP + (prevMP * (0.33 - ((level - 2) * .02)));
      this.MPMap.set(level, MP);
      return MP;
   }

   async refreshMaxMP(this: PC | NPCAlly, amt = this.mmp) {
      if (amt == this.system.combat.mp.max) return;
      await this.update( { "system.combat.mp.max": amt});
   }

   async refreshHpTracker(this:ValidAttackers)  {
      if (!game.user.isGM) return;
      if (this.system.type == "pc") {
         await (this as PC).refreshMaxMP();
      }

      if (this.hp > this.mhp) {
         this.update({"system.combat.hp": this.mhp});
      }
      if (this.system.combat.hpTracker.value != this.hp
         || this.system.combat.hpTracker.max != this.mhp){
         this.update( {"system.combat.hpTracker.value" : this.hp,
            "system.combat.hpTracker.max": this.mhp
         });
      }
   }

   async createNewItem() {
      return (await this.createEmbeddedDocuments("Item", [{"name": "Unnamed Item", type: "item"}]))[0];
   }

   get inventory() : (Consumable | InvItem | Weapon | SkillCard)[] {
      return this.items.filter( x=> x.system.type == "item" || x.system.type == "weapon" || x.system.type == "consumable" || x.system.type == "skillCard") as (Consumable | InvItem | Weapon)[];
   }

   get consumables(): Consumable[] {
      const consumables =  this.items.filter( x=> x.system.type == "consumable" || x.system.type == "skillCard") as Consumable[];
      return consumables.sort( (a,b) => a.name.localeCompare(b.name));
   }

   get nonUsableInventory() : (SkillCard | InvItem | Weapon)[] {
      const inventory = this.items.filter( i=> i.system.type == "item" || i.system.type == "weapon" || i.system.type == "skillCard") as (InvItem | Weapon)[];
      return inventory.sort( (a,b) =>  {
         const typesort = a.system.type.localeCompare(b.system.type);
         if (typesort != 0) return typesort;
         if (a.system.type == "item" && b.system.type == "item") {
            const slotSort = a.system.slot.localeCompare(b.system.slot);
            if (slotSort != 0) return slotSort;
         }
         return a.name.localeCompare(b.name);
      });
   }

   get displayedName() : string {
      switch (this.system.type) {
         case "tarot":
            return game.i18n.localize(TAROT_DECK[this.name as keyof typeof TAROT_DECK] ?? "-");
         default:
               return this.name;
      }
   }

   get init() : number {
      const combat = game.combat as Combat<PersonaActor>;
      if (!combat) {
         throw new PersonaError("Can't get initiative when not in combat!");
      }
      if (combat.combatants.contents.some( x=> x.actor && x.actor.system.type =="shadow")) {
         return this.combatInit;
      }
      return this.socialInit;
   }

   get socialInit(): number {
      if (this.system.type != "pc") return -999;
      return (this as PC).getSocialStat("courage").total({user:(this as PC).accessor});
   }

   getNPCProxyActor(this: NPCAlly) : NPC | PC | undefined {
      const proxyId = this.system.NPCSocialProxyId;
      if (!proxyId)
         return undefined;
      const npc = PersonaDB.socialLinks()
         .find( x=> x.id == proxyId);
      if (!npc || npc.system.type != "npc" && npc.system.type != "pc") {
         PersonaError.softFail(`Can't find Proxy actor for: ${this.name}`);
      }
      return npc as NPC | PC;
   }

   get printableResistanceString() : string {
      switch (this.system.type) {
         case "tarot":
         case "npc":
            return "";
      }
      const resists= this.system.combat.statusResists;
      const retdata = Object.entries(resists)
         .map(([statusRaw, level]) => {
            const statusTrans = localize(STATUS_EFFECT_TRANSLATION_TABLE[statusRaw]);
            switch (level) {
               case "resist": return `Resist ${statusTrans}`;
               case "absorb":
               case "reflect":
               case "block": return `Block ${statusTrans}`;
               default: return "";
            }
         })
         .filter( x=> x.length > 0)
         .join(", ");
      return retdata;
   }

   get combatInit(): number {
      const situation = {user: (this as PC | Shadow).accessor};
      const initBonus = this
         .getBonuses("initiative")
         .total(situation);
      switch (this.system.type) {
         case "npc":
            return -5;
         case "shadow": {
            const inc = this.system.combat.classData.incremental.initiative;
            const level  = this.system.combat.classData.level;
            const initRating = this.system.combat.initiative;
            const initScore = this.#translateInitString(initRating);
            return initBonus + (inc * 2) + (level * 3) + initScore;
         }
         case "pc":  case "npcAlly": {
            const inc = this.system.combat.classData.incremental.initiative;
            const level  = this.system.combat.classData.level;
            const initRating = this.system.combat.initiative;
            const initScore = this.#translateInitString(initRating);
            return initBonus + (inc * 2) +  (level * 3) + initScore;
         }
         case "tarot" :{
            return -5;
         }
         default:
            this.system satisfies never;
            throw new PersonaError(`Unepxected Type : ${this.type}`);
      }
   }

   #translateInitString(initString: PC["system"]["combat"]["initiative"]): number {
      switch (initString) {
         case "pathetic": return -6;
         case "weak": return -3;
         case "normal": return 0;
         case "strong": return 3;
         case "ultimate": return 6;
         default:
            initString satisfies never;
            return -999;
      }
   }


   get accessor() : UniversalActorAccessor<typeof this> {
      return PersonaDB.getUniversalActorAccessor(this);
   }

   get class() : Subtype<PersonaItem, "characterClass"> {
      let classNameDefault;
      switch (this.system.type) {
         case "npcAlly":
            classNameDefault = "Persona User";
            break;
         case "pc":
            classNameDefault = "Persona User";
            break;
         case "shadow":
            classNameDefault = "Persona User";
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
         const namesearch = PersonaDB.getItemByName(classNameDefault)
         if (!namesearch)
            throw new Error(`Couldn't find class id: ${id} or name: ${classNameDefault}`);
         if (namesearch.system.type != "characterClass")
         {
            throw new Error("Bad Item named: ${classNameDefault}, expecting a character class");
         }
         cl = namesearch as ItemSub<"characterClass">;
      }
      return cl;
   }

   set hp(newval: number) {
      if (this.system.type == "npc"
         || this.system.type == "tarot") return;
      newval = Math.clamp(newval, 0, this.mhp);
      this.update({"system.combat.hp": newval});
      (this as PC | Shadow).refreshHpStatus(newval);
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

   get mhp() : number {
      if (this.system.type == "npc") return 0;
      if (this.system.type == "tarot") return 0;
      try {
         const sit ={user: PersonaDB.getUniversalActorAccessor(this as PC)};
         const inc = this.system.combat.classData.incremental.hp ?? 0;
         const lvl = this.system.combat.classData.level;
         const bonuses = this.getBonuses("maxhp");
         const lvlbase = this.class.getClassProperty(lvl, "maxhp");
         const diff = this.class.getClassProperty(lvl+1, "maxhp") - lvlbase;
         const incBonus = Math.round(inc / 3 * diff);
         const weaknesses = Object.values(this.system.combat.resists)
            .filter(x=> x == "weakness")
            .length;
         const multmods = this.getBonuses("maxhpMult")
         if (weaknesses > 1) {
            const bonus = (weaknesses -1 ) * 0.25;
            multmods.add("weaknesses mod", bonus)
         }
         bonuses.add("incremental bonus hp", incBonus)
         const mult = multmods.total(sit, "percentage-special");
         const mhp = (mult * lvlbase) + bonuses.total(sit);
         return Math.round(mhp);
      } catch (e) {
         console.log(e);
         console.warn(`Can't get Hp for ${this.name} (${this.id})`);
         return 0;
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

   /** @deprecated */
   getWeakestSlot(): void {
      PersonaError.softFail("Thios function is deprecated and shouldn't be called anymore");
   }

   /** @deprecated */
   getMaxSlotsAt(_slot_lvl: number) : void {
      return;
   }

   /** @deprecated */
   async recoverSlot(this: PC, _slottype: RecoverSlotEffect["slot"], _amt: number = 1) : Promise<never> {
      throw new Error("Deprecated Crap, do not call");
   }

   getSocialSLWithTarot(this: PC, tarot: TarotCard) : number {
      const link= this.socialLinks.find(
         link => link.actor.tarot?.name == tarot);
      if (!link) return 0;
      return link.linkLevel;
   }

   getSocialSLWith(this: PC, sl : SocialLink | UniversalActorAccessor<SocialLink>) : number {
      if ("actorId" in sl) {
         sl = PersonaDB.findActor(sl);

      }
      const linkData= this.system.social.find( x=> x.linkId == sl.id)
      if (!linkData) return 0;
      return linkData.linkLevel;
   }

   get socialBenefits() : SocialBenefit[] {
      let focuses : Focus[] = [];
      switch (this.system.type) {
         case "pc": return [];
         case "shadow": return [];
         case "tarot":
            focuses = this.focii;
            break;
         case "npc": case "npcAlly":
            focuses = this.focii
               .concat(this.tarot?.focii ?? []);
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
            throw new PersonaError(`Unknown type ${classification}`);
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
         return;
      const item : typeof act[number] = {
         linkId: activity.id,
         strikes: 0,
         currentProgress: 0,
      };
      act.push( item);
      await this.update( {"system.activities": act});
   }

   get activityLinks() : ActivityLink[] {
      if (this.system.type != "pc") return [];
      return this.system.activities
         .flatMap( aData => {
            const activity = PersonaDB.allActivities().find(x=> x.id == aData.linkId);
            if (!activity) return [];
            const aLink : ActivityLink = {
               strikes: aData.strikes ?? 0,
               available: activity.isAvailable(this as PC),
               currentProgress: aData.currentProgress,
               activity,
            }
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
            PersonaError.softFail(`Unexpected Date type: ${this.system["type"]}`);
            return false;
      }
      if (this.system.type != "pc") return false;
      const id = sl instanceof PersonaActor ? sl.id: sl;
      const link =  this.system.social.find(x=> x.linkId == id);
      if (!link) return false;
      return link.isDating || link.relationshipType == "DATE";
   }


   get socialLinks() : SocialLinkData[] {
      const meetsSL = function (linkLevel: number, focus:Focus) {
         return linkLevel >= focus.requiredLinkLevel();
      };
      if (this.system.type != "pc") {
         return EMPTYARR;
      }
      return this.system.social.flatMap(({linkId, linkLevel, inspiration, currentProgress, relationshipType}) => {
         const npc = PersonaDB.getActor(linkId);
         if (!npc) return [];
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
               const allFocii = (personalLink as NPC).getSocialFocii_PC(personalLink as SocialLink, npc as PC);
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
               const allFocii = (teammate as NPC).getSocialFocii_PC(teammate as SocialLink, npc as PC);
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
      });
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
         .filter( (x : PC | NPC)=> !!x.system.tarot)
      return list;
   }

   get recoveryAmt(): number {
      if (this.system.type != "pc") return 0;
      const rec_bonuses = this.getBonuses("recovery");
      rec_bonuses.add("Base", 10);
      const situation : Situation = {
         user: (this as PC).accessor
      };
      const rec_mult = this.getBonuses("recovery-mult").total(situation, "percentage");
      const healing = rec_bonuses.total(situation);
      return healing * rec_mult;
   }


   async spendRecovery(this: PC, socialLinkId: string) {
      const link = this.system.social.find( x=> x.linkId == socialLinkId);
      if (!link) {
         throw new PersonaError(`Can't find link ${socialLinkId}`);
      }
      if (link.inspiration <= 0) {
         throw new PersonaError("Can't spend recovery!");
      }
      link.inspiration -= 1;
      const healing = this.recoveryAmt;
      const linkActor = game.actors.get(socialLinkId);

      await Logger.sendToChat(`${this.name} used inspiration from link ${linkActor?.name} to heal ${healing} hit points (original HP: ${this.hp})` , this);
      await this.update({"system.social": this.system.social});
      await this.modifyHP(healing);
   }

   get mainPowers() : Power[] {
      switch (this.system.type) {
         case "npc": case "tarot": return [];
         case "npcAlly":
         case "pc":
            const powerIds = this.system.combat.powers;
            const pcPowers : Power[] = powerIds.flatMap( id=> {
               const i = PersonaDB.getItemById(id);
               return (i ? [i as Power] : []);
            });
            return pcPowers;
         case "shadow":
            const shadowPowers = this.items.filter( x=> x.system.type == "power") as Power[];
            return shadowPowers;
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
         case "npcAlly":
            return [];
         case "pc":
            break;
         default:
            this.system satisfies never;
      }
      const powerIds = this.system.combat.powers_sideboard;
      const pcPowers : Power[] = powerIds.flatMap( id=> {
         const i = PersonaDB.getItemById(id);
         return (i ? [i as Power] : []);
      });
      return pcPowers;
   }

   get bonusPowers() : Power[] {
      switch (this.type) {
         case "npc": case "tarot": 
            return [];
         case "shadow":
         case "pc":
         case "npcAlly":
            const bonusPowers : Power[] =
               (this as PC | Shadow).mainModifiers({omitPowers:true})
               .filter(x=> x.grantsPowers())
               .flatMap(x=> x.getGrantedPowers(this as PC )) ;
            return removeDuplicates(bonusPowers);
         default:
            this.type satisfies never;
            return [];
      }
   }

   get basicPowers() : Power [] {
      switch (this.type) {
         case "npc": case "tarot":
            return [];
         case "shadow":
            return PersonaItem.getBasicShadowPowers();
         case "pc":
         case "npcAlly":
            const arr =  PersonaItem.getBasicPCPowers();
            const extraSkills = [
               this.teamworkMove,
               this.navigatorSkill
            ].flatMap( x=> x != undefined ? [x] : []);
            arr.push (...extraSkills);
            return arr;
         default:
            this.type satisfies never;
            return [];
      }
   }

   get maxPowers() : number {
      switch (this.system.type) {
         case "npc":
         case "tarot":
            return 0;
         case "npcAlly":
            return 8;
         case "pc":
         case "shadow":
            const extraMaxPowers = this.getBonuses("extraMaxPowers");
            return 8 + extraMaxPowers.total ( {user: (this as PC | Shadow).accessor});
         default:
            this.system satisfies never;
            return -1;
      }
   }

   get maxMainPowers() : number {
      switch (this.system.type) {
         case "npc":
         case "tarot":
            return 0;
         case "pc":
         case "npcAlly":
         case "shadow":
            return 8;
         default:
            this.system satisfies never;
            return -1;
      }
   }

   async setNavigatorSkill(this: NPCAlly, pwr: Power) {
      await this.update( {"system.combat.navigatorSkill" : pwr.id});
      await Logger.sendToChat(`${this.name} set Navigator skill to ${pwr.name}` , this);
   }

   get navigatorSkill(): Power | undefined {
      switch (this.system.type) {
         case "shadow":
         case "npc":
         case "tarot":
         case "pc":
            return undefined;
         case "npcAlly":
            const id = this.system.combat.navigatorSkill;
            const power = PersonaDB.allPowers().find(x=> x.id == id);
            return power;
         default:
            this.system satisfies never;
            return undefined;
      }
   }

   get maxSideboardPowers() : number {
      switch (this.system.type) {
         case "npc":
         case "npcAlly":
         case "tarot":
            return 0;
         case "pc":
         case "shadow":
            const extraMaxPowers = this.getBonuses("extraMaxPowers");
            return extraMaxPowers.total ( {user: (this as PC | Shadow).accessor});
         default:
            this.system satisfies never;
            return -1;
      }
   }

   get powers(): Power[] {
      return [
         ...this.basicPowers,
         ...this.mainPowers,
         ...this.bonusPowers,
      ].flat();
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
      if (item) return item as Weapon;
      const dbitem = PersonaDB.getItemById(id);
      if (dbitem) return dbitem as Weapon;
      return null;
   }

   get talents() : Talent[] {
      switch (this.system.type) {
         case "tarot":
         case "npc":
            return [];
         case "shadow":
            return this.items.filter( x=> x.system.type == "talent") as Talent[];
         case "pc":
         case "npcAlly":
            break;
         default:
            this.system satisfies never;
            return [];
      }
      const extTalents = this.system.talents.flatMap( ({talentId}) => {
         const tal= PersonaDB.getItemById(talentId);
         if (!tal) return [];
         if (tal.system.type != "talent") return [];
         return tal as Talent;
      });
      const itemTalents = this.items.filter ( x => x.system.type == "talent") as Talent[];
      return extTalents.concat(itemTalents);
   }

   get focii(): Focus[] {
      if (this.system.type == "pc")
         return [];
      return this.items.filter( x=> x.system.type == "focus") as Focus[];
   }

   async modifyHP( this: ValidAttackers, delta: number) {
      let hp = this.system.combat.hp;
      hp += delta;
      if (hp < 0 ) {
         hp = 0;
      }
      if (hp >= this.mhp) {
         hp = this.mhp;
      }
      await this.update( {"system.combat.hp": hp});
      // await this.refreshHpStatus();
   }

   async modifyMP( this: PC, delta: number) {
      let mp = this.system.combat.mp.value;
      mp += delta;
      mp = Math.clamp(Math.round(mp), 0, this.mmp);
      await this.update( {"system.combat.mp.value": mp});
   }

   async refreshHpStatus(this: ValidAttackers, newval?: number) {
      const hp = newval ?? this.system.combat.hp;
      if (hp > 0) {
         await this.setFadingState(0);
      }
      if (hp > this.mhp) {
         await this.update( {"system.combat.hp": this.mhp});
      }
      const opacity = hp > 0 ? 1.0 : (this.isFullyFaded(hp) ? 0.2 : 0.6);
      if (this.token) {
         await this.token.update({"alpha": opacity});
      } else {
         //@ts-ignore
         for (const iterableList of this._dependentTokens.values()) {
            for (const tokDoc of iterableList) {
               (tokDoc as TokenDocument<PersonaActor>).update({"alpha": opacity});
            }
         }
      }

   }

   async isStatusResisted( id : StatusEffect["id"]) : Promise<boolean> {
      const resist = this.statusResist(id);
      switch (resist) {
         case "absorb":
         case "reflect":
         case "weakness":
         case "normal":
            break;
         case "block":
            return true;
         case "resist":
            const save = await PersonaCombat.rollSave(this as Shadow, {
               DC: 11,
               label:`Resist status ${id}`,
               askForModifier: false,
               saveVersus: id,
               modifier: 0,
            });
            if (save.success) return true;
            break;
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

	/** returns true if status is added*/
	async addStatus({id, potency, duration}: StatusEffect): Promise<boolean> {
		if (await this.isStatusResisted(id)) return false;
		const eff = this.effects.find( eff => eff.statuses.has(id));
		const stateData = CONFIG.statusEffects.find ( x=> x.id == id);
		if (!stateData) {
			throw new Error(`Couldn't find status effect Id: ${id}`);
		}
		const instantKillStatus : StatusEffectId[] = ["curse", "expel"];
		if ( instantKillStatus.some(status => id == status) && this.isValidCombatant()) {
			this.hp -= 9999;
		}
		if (!eff) {
			const s = [id];
			const newState = {
				...stateData,
				name: game.i18n.localize(stateData.name),
				statuses: s
			};
			if (await this.checkStatusNullificaton(id)) return false;
			const newEffect = (await  this.createEmbeddedDocuments("ActiveEffect", [newState]))[0] as PersonaAE;
			await newEffect.setPotency(potency ?? 0);
			await newEffect.setDuration(duration);
			return true;
		} else  {
			if (potency && eff.potency < potency) {
				await eff.setPotency(potency);
			}
			eff.duration.startRound = game?.combat?.round ?? 0;
			await eff.update({"duration": eff.duration});
			if (typeof duration != "string" && eff.durationLessThanOrEqualTo(duration)) {
				await eff.setDuration(duration);
			}
			//TODO: update the effect
			return false;
		}

   }

	get openerActions() : Usable[] {
		if (this.system.type == "npc" || this.system.type == "tarot")
			return [];
		const powerBased = (this.system.type == "shadow" ? this.mainPowers : this.consumables)
			.filter( power => power.isOpener());
		const arr : Usable[] = (this as ValidAttackers).mainModifiers({omitPowers:true})
			.filter(x=> x.grantsPowers())
			.flatMap(x=> x.getOpenerPowers(this as PC ) as Usable[])
			.concat(powerBased);
		return removeDuplicates(arr);
	}

   async setTeamworkMove(this: ValidAttackers, power: Power) {
      const id = power.id;
      const oldTW = this.teamworkMove;
      await this.update( {"system.combat.teamworkMove": id});
      if (oldTW) {
         await Logger.sendToChat(`${this.name} replaced Teamwork ${oldTW.displayedName} with ${power.displayedName}` , this);
      } else {
         await Logger.sendToChat(`${this.name} set Teamwork Move to ${power.displayedName}` , this);
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
         return undefined;
      return PersonaDB.allPowers().find(pwr => pwr.id == id);
   }

   hasStatus (id: StatusEffectId) : boolean {
      return this.effects.contents.some( eff => eff.statuses.has(id));

   }

   getStatus( id: StatusEffectId) : PersonaAE | undefined {
      return this.effects.contents.find( eff => eff.statuses.has(id));

   }

   get tokens() : TokenDocument<this>[] {
      const actor = this;
      if (actor.token) {
         return [actor.token];
      }
      //@ts-ignore
      const dependentTokens : TokenDocument<PersonaActor>[] = Array.from(actor._dependentTokens.values()).flatMap(x=> Array.from(x.values()));
      return dependentTokens.filter( x=> x.actorLink == true) as TokenDocument<this>[];
   }

   /** returns status id of nullified status otherwise return undefined */
   async checkStatusNullificaton(statusId: StatusEffectId) : Promise<StatusEffectId  | undefined> {
      let remList : StatusEffectId[] = [];
      switch (statusId) {
         case "supercharged":
            remList.push("depleted");
            break;
         case "depleted":
            remList.push("supercharged");
            remList.push("power-charge");
            remList.push("magic-charge");
            break;
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
      for (const id of remList) {
         if (await this.removeStatus(id)) {
            return id;
         }
      }
      return undefined;
   }


   async removeStatus(status: Pick<StatusEffect, "id"> | StatusEffectId) : Promise<boolean>{
      const id = typeof status == "object" ? status.id : status;
      const promises = this.effects
      .filter( eff => eff.statuses.has(id))
      .map( eff => eff.delete());
      await Promise.all(promises);
      return promises.length > 0;
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
      const slots : (keyof typeof this.system.equipped)[]=  ["weapon", "body", "accessory", "weapon_crystal"]
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
      return inv.filter( item => item.system.type == "item" && item.system.slot == "none") as InvItem[];
   }

   wpnDamage(this: ValidAttackers) : {low: number, high:number} {
      let basedmg: {low: number, high:number};
      switch (this.system.type) {
         case "pc": case "npcAlly":
            const wpn = this.weapon;
            if (!wpn) {
               return  {low: 1, high:2};
            }
            basedmg =  wpn.system.damage;
            break;
         case "shadow":
            basedmg = this.system.combat.wpndmg;
            break;
         default:
            this.system satisfies never;
            return {low: 0, high: 0};
      }
      return basedmg;
   }

   getBonusWpnDamage() : {low: ModifierList, high: ModifierList} {
      const total = this.getBonuses("wpnDmg");
      const low = this.getBonuses("wpnDmg_low");
      const high = this.getBonuses("wpnDmg_high");
      return {
         low: total.concat(low),
         high: total.concat(high)
      }
   }

   getBonuses (modnames : ModifierTarget | ModifierTarget[], sources: ModifierContainer[] = this.mainModifiers() ): ModifierList {
      let modList = new ModifierList( sources.flatMap( item => item.getModifier(modnames, this as Shadow | PC)
         .filter( mod => mod.modifier != 0 || mod.variableModifier.size > 0)
      ));
      return modList;
   }

   complementRating (this: Shadow, other: Shadow) : number {
      return this.#complementRating(other) + other.#complementRating(this);
   }

	getUnarmedDamageType(): RealDamageType {
		if (this.system.type == "shadow") return this.system.combat.baseDamageType ?? "physical";
		return "physical";
	}

   #complementRating (this: Shadow, other: Shadow) : number {
      let rating = 0;
      if (this == other) return 3; //baseline
      const role1 = this.system.role;
      const role2 = other.system.role;
      if (role1 == role2) {
         if (role1 == "support") rating -= 2;
         if (role1 == "soldier") rating -= 2;
         if (role1 == "lurker") rating -= 2;
      }
      const weaknesses = DAMAGETYPESLIST
         .filter( dmg => dmg != "by-power" && this.elementalResist(dmg) == "weakness") as RealDamageType[];
      for (const w of weaknesses) {
         const res = other.elementalResist(w);
         switch (res)  {
            case "block":
               rating += 2;
               break;
            case "absorb":
            case "reflect":
               rating += 3;
               break;
            case "resist":
               rating += 1;
               break;
            default:
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
         .filter (dmgType => dmgType != "healing" && dmgType != "untyped" && dmgType != "none")
      rating += otherAttacks.reduce( (acc, dmg) =>
         acc + (!attacks.has(dmg) ? 1 : 0)
         , 0 );
      return rating;
   }

   basePowerCritResist(this: ValidAttackers, power: Usable): number {
		if (!power.isInstantDeathAttack()) return 0;
      const level = this.system.combat.classData.level;
      return Math.floor(level / 2);
   }

   instantKillResistanceMultiplier(this: ValidAttackers, attacker: ValidAttackers) : number {
      const situation : Situation = {
         attacker: attacker.accessor,
         user: this.accessor,
         target: this.accessor,
      }
      return this.getBonuses("instantDeathResistanceMult").total(situation, "percentage");
   }

   mainModifiers(options?: {omitPowers?: boolean} ): ModifierContainer[] {
      switch (this.system.type) {
         case "npc": case "tarot":
            return [];
         case "pc":
         case "shadow":
         case "npcAlly":
            break;
         default:
            this.system satisfies never;
      }
      const passivePowers = (options && options.omitPowers) ? [] : this.getPassivePowers();
      return [
         ...this.equippedItems(),
         ...this.focii,
         ...this.talents,
         ...passivePowers,
         ...this.passiveItems(),
         ...this.getAllSocialFocii(),
         ...this.roomModifiers(),
         ...PersonaDB.getGlobalModifiers(),
         ...PersonaDB.navigatorModifiers(),
      ].filter( x => x.getEffects(this as ValidAttackers).length > 0);
   }

	defensivePowers() : ModifierContainer [] {
		const defensiveItems = this.equippedItems().filter( item => item.hasTag("defensive"));
		return  [
			...defensiveItems,
			...this.powers
			.filter(x=> x.system.subtype == "defensive")
		];

   }

   getSourcedDefensivePowers(this: ValidAttackers) {
      return this.defensivePowers().flatMap( x=> x.getSourcedEffects(this));
   }

   wpnAtkBonus(this: ValidAttackers) : ModifierList {
      const mods = this.getBonuses(["allAtk", "wpnAtk"]);
      const lvl = this.system.combat.classData.level;
      const inc = this.system.combat.classData.incremental.attack ?? 0;
      const wpnAtk = this.system.combat.wpnatk;
      mods.add("Base Weapon Attack Bonus", wpnAtk);
      mods.add("Level Bonus (x2)", lvl * 2);
		mods.add("Incremental Advance" , inc);
      return mods;
   }

   magAtkBonus(this: ValidAttackers) : ModifierList {
      const mods = this.getBonuses(["allAtk", "magAtk"]);
      const lvl = this.system.combat.classData.level ?? 0;
      const magAtk = this.system.combat.magatk ?? 0;
      const inc = this.system.combat.classData.incremental.attack ?? 0;
      mods.add("Base Magic Attack Bonus", magAtk);
      mods.add("Level Bonus (x2)", lvl * 2);
		mods.add("Incremental Advance" , inc);
      return mods;
   }

   itemAtkBonus(this: ValidAttackers, item :Consumable) : ModifierList {
      const mm = this.getBonuses(["itemAtk", "allAtk"]);
      // mm.concat(this.getBonuses("allAtk"));
      mm.add("Item Base Bonus", item.system.atk_bonus);
      return mm;
   }

   getDefense(this: ValidAttackers,  type : keyof PC["system"]["combat"]["defenses"]) : ModifierList {
      const mods = new ModifierList();
      const lvl = this.system.combat.classData.level;
      const baseDef = this.#translateDefenseString(type, this.system.combat.defenses[type]);
      const inc = this.system.combat.classData.incremental.defense;
      mods.add("Base", 10);
      mods.add("Base Defense Bonus", baseDef);
      mods.add("Level Bonus (x2)", lvl * 2);
		mods.add("Incremental Advance" , inc);
      const otherBonuses = this.getBonuses([type, "allDefenses"]);
      const defenseMods = this.getBonuses([type, "allDefenses"], this.defensivePowers());
      return mods.concat(otherBonuses).concat(defenseMods);
   }

   #translateDefenseString(this: ValidAttackers, defType: keyof PC["system"]["combat"]["defenses"], val: PC["system"]["combat"]["defenses"]["fort"],): number {
      const weaknesses= this.#getWeaknessesInCategory(defType);
      switch (val) {
         case "pathetic": return Math.min(-6 + 2 * weaknesses,-2) ;
         case "weak": return Math.min(-3 + 1 * weaknesses, -1);
         case "normal": return 0;
         case "strong": return Math.max(3 - 1 * weaknesses, 1);
         case "ultimate": return Math.max(6 - 2 * weaknesses, 2);
         default:
            PersonaError.softFail(`Bad defense tsring ${val} for ${defType}`);
            return -999;
      }
   }

   #getWeaknessesInCategory(this: ValidAttackers, defType: keyof PC["system"]["combat"]["defenses"]): number {
      const damageTypes = ELEMENTAL_DEFENSE_LINK[defType];
      const weaknesses= damageTypes.filter( dt => this.system.combat.resists[dt] == "weakness")
      return weaknesses.length;
   }

   elementalResist(this: ValidAttackers, type: Exclude<DamageType, "by-power">) : ResistStrength  {
      switch (type) {
         case "untyped":  case "none":
         case "all-out":
            return "normal";
         case "healing":
            return "absorb";
      }

      const baseResist = this.system.combat.resists[type] ?? "normal";
      // let resist = baseResist;
      const effectChangers=  this.mainModifiers().filter( x=> x.getEffects(this)
         .some(x=> x.consequences
            .some( cons=>cons.type == "raise-resistance" || cons.type == "lower-resistance")));
      const situation : Situation = {
         user: this.accessor,
         target: this.accessor,
      };
      const consequences = effectChangers.flatMap(
         item => item.getEffects(this).flatMap(eff =>
            getActiveConsequences(eff, situation, item)
         )
      );
      const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
      let resBonus = 0;
      let resPenalty = 0;
      for (const cons of consequences) {
         switch (cons.type) {
            case "raise-resistance":
               if (cons.resistType == type &&
                  resval(cons.resistanceLevel!) > resval(baseResist)) {
                  resBonus = Math.max(resBonus, resval(cons.resistanceLevel!) - resval(baseResist))
               }
               break;
            case "lower-resistance":
               if (cons.resistType == type &&
                  resval (cons.resistanceLevel!) < resval(baseResist))  {
                  resPenalty = Math.min(resPenalty, resval(cons.resistanceLevel!) - resval(baseResist))
               }
               break;
            default:
               break;
         }
      }
      const resLevel = Math.clamp(resval(baseResist) + resBonus + resPenalty, 0 , RESIST_STRENGTH_LIST.length-1);
      return RESIST_STRENGTH_LIST[resLevel];
   }

   statusResist(status: StatusEffectId) : ResistStrength {
      switch (this.system.type) {
         case "tarot":
         case "npc":
            return "normal";
         case "pc":
         case "shadow":
         case "npcAlly":
            break;
         default:
            this.system satisfies never;
            PersonaError.softFail("Unknown Type");
            return "normal";
      }
      const actor = this as PC | Shadow;
      const effectChangers=  actor.mainModifiers().filter( x=> x.getEffects(actor)
         .some(x=> x.consequences
            .some( cons=>cons.type == "raise-status-resistance" && cons.statusName == status)));
      const situation : Situation = {
         user: actor.accessor,
         target: actor.accessor,
      };
      const consequences = effectChangers.flatMap(
         item => item.getEffects(actor).flatMap(eff =>
            getActiveConsequences(eff, situation, item)
         )
      );
      let baseStatusResist : ResistStrength = "normal";
      if ("statusResists" in actor.system.combat) {
         const statusResist = actor.system.combat.statusResists;
         if (status in statusResist) {
            baseStatusResist = statusResist[status as keyof typeof statusResist];
         }
      }
      const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
      let resist= baseStatusResist;
      for (const cons of consequences) {
         if (cons.type == "raise-status-resistance"
            && cons.statusName == status) {
            if (resval(cons.resistanceLevel) > resval(resist)) {
               resist = cons.resistanceLevel;
            }
         }
      }
      return resist;
   }

   get statusResists() : {id: string, img: string, local: string, val: string}[] {
      let arr: {id: string, img: string, local: string, val: string}[]   = [];
      if (this.system.type != "shadow") return [];
      for (const [k, v] of Object.entries(this.system.combat.statusResists)) {
         arr.push( {
            id: k,
            val: v,
            local: localize(STATUS_EFFECT_TRANSLATION_TABLE[k]),
            img: STATUS_EFFECT_LIST.find(x=> x.id == k)?.icon ?? "",
         });
      }
      return arr;
   }

   wpnMult( this: ValidAttackers) : number {
      const lvl = this.system.combat.classData.level;
      const inc = this.system.combat.classData.incremental.wpnDamage * 0.5 ;
      const mult = ((this.class.getClassProperty(lvl, "wpn_mult") ?? 0)  + inc);
      return mult;
   }

   magDmg (this: ValidAttackers) : {low: number, high:number} {
      const lvl = this.system.combat.classData.level;
      const incLow = this.system.combat.classData.incremental.magicLow ? 1 : 0;
      const incHigh = this.system.combat.classData.incremental.magicHigh ? 1 : 0;
      const baseDmg = this.class.getClassProperty(lvl, "magic_damage") ?? 0;
      const nextLvl = this.class.getClassProperty(lvl+1, "magic_damage") ?? 0;
      return {
         low: incLow ? nextLvl.low : baseDmg.low,
         high: incHigh ? nextLvl.high : baseDmg.high,
      }
   }

   critBoost(this: ValidAttackers) : ModifierList {
      const mods = this.mainModifiers().flatMap( item => item.getModifier("criticalBoost", this));
      return new ModifierList(mods);
   }

   async addTalent(this: ValidAttackers, talent: Talent) {
      switch (this.system.type) {
         case "shadow":
            ui.notifications.warn("Shadows can't use talents");
            return;
         case "pc":
         case "npcAlly":
            break;
         default:
            this.system satisfies never;
            return;
      }
      const talents = this.system.talents;
      if (talents.find(x => x.talentId == talent.id)) return;
      talents.push( {
         talentLevel: 0,
         talentId: talent.id
      });
      await this.update( {"system.talents": talents});
      await Logger.sendToChat(`${this.name} added ${talent.name} Talent` , this);
   }

   critResist(this: ValidAttackers) : ModifierList {
      const ret = new ModifierList();
      const mods = this.mainModifiers().flatMap( item => item.getModifier("critResist", this));
      return ret.concat(new ModifierList(mods));
   }

   async deleteTalent(this: ValidAttackers, id: string) {
      const item = this.items.find(x => x.id == id);
      if (item) {
         await item.delete();
         return;
      }
      if (!("talents" in this.system)) {return;}
      let talents = this.system.talents;
      if (!talents.find(x => x.talentId == id)) return;
      const talent = PersonaDB.getItemById(id) as Talent;
      talents = talents.filter( x=> x.talentId != id);
      await this.update( {"system.talents": talents});
      await Logger.sendToChat(`${this.name} deleted talent ${talent.name}` , this);
   }

   async addPower(this: PC | NPCAlly, power: Power) {
      const powers = this.system.combat.powers;
      if (powers.includes(power.id)) return;
      if (powers.length < this.maxMainPowers) {
         powers.push(power.id);
         await this.update( {"system.combat.powers": powers});
      }
      const sideboard =  this.system.combat.powers_sideboard;
      if (sideboard.includes(power.id)) return;
      sideboard.push(power.id);
      await this.update( {"system.combat.powers_sideboard": sideboard});
      const totalPowers = this.mainPowers.length + this.sideboardPowers.length;
      let maxMsg = "";
      if (totalPowers > this.maxPowers) {
         maxMsg = `<br>${this.name} has exceeded their allowed number of powers (${this.maxPowers})  and must forget one or more powers.`;
      }
      await Logger.sendToChat(`${this.name} learned ${power.name} ${maxMsg}` , this);
   }

   async deletePower(this: ValidAttackers, id: string ) {
      const item = this.items.find(x => x.id == id);
      if (item) {
         await item.delete();
         return;
      }
      if (! ("talents" in this.system)) {
         return false;
      }
      let powers = this.system.combat.powers;
      const power = PersonaDB.getItemById(id) as Power;
      if (powers.includes(id)) {
         powers = powers.filter( x=> x != id);
         await this.update( {"system.combat.powers": powers});
         await Logger.sendToChat(`${this.name} deleted power ${power.name}` , this);
      }
      if (this.system.type == "npcAlly") {return;}
      let sideboard = this.system.combat.powers_sideboard;
      if (sideboard.includes(id)) {
         sideboard = sideboard.filter( x=> x != id);
         await this.update( {"system.combat.powers_sideboard": sideboard});
         await Logger.sendToChat(`${this.name} deleted sideboard power ${power.name}` , this);
      }
   }

   async movePowerToSideboard(this: PC, powerId: Power["id"]) {
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
      if (this.mainPowers.length >= this.maxMainPowers) {
         ui.notifications.warn(`Can't have more than ${this.maxMainPowers} main powers.`);
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

   async addFocus(this: PC, focus: Focus) {
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
         case "pc": case "shadow": case "npcAlly":
            let foci = this.system.combat.focuses;
            if (!foci.includes(focusId)) return;
            foci = foci.filter( x=> x != focusId);
            return await this.update( {"system.combat.focuses": foci});
         default:
            actorType satisfies never;
      }
   }

   async  setClass(this: ValidAttackers, cClass: CClass) {
      await this.update( {"this.system.combat.classData.classId": cClass.id});
   }

   canUsePower (this: ValidAttackers, usable: UsableAndCard, outputReason: boolean = true) : boolean {
      if (this.hasStatus("rage") && usable != PersonaDB.getBasicPower("Basic Attack")) {
         if (outputReason) {
            ui.notifications.warn("Can't only use basic attacks when raging");
         }
         return false;
      }
      return this.canPayActivationCost(usable, outputReason);

   }

   canPayActivationCost(this: ValidAttackers, usable: UsableAndCard, outputReason: boolean = true) : boolean {
      switch (this.system.type) {
         case "npcAlly":
         case "pc":
            return (this as PC | NPCAlly).canPayActivationCost_pc(usable, outputReason);
         case "shadow":
            return (this as Shadow).canPayActivationCost_shadow(usable, outputReason);
         default:
            this.system satisfies never;
            throw new PersonaError("Unknown Type");
      }
   }

   canPayActivationCost_pc(this: PC | NPCAlly, usable: UsableAndCard, _outputReason: boolean) : boolean {
      switch (usable.system.type) {
         case "power": {
            if (this.hasStatus("depleted") && !usable.system.tags.includes("basicatk")) {
               return false;
            }
            switch (usable.system.subtype) {
               case "weapon":
                  return  this.hp > (usable as Power).hpCost();
               case "magic":
                  const mpcost = (usable as Power).mpCost(this);
                  if (mpcost > 0) {
                     return this.mp >= mpcost;
                  }
               case "social-link":
                  const inspirationId = usable.system.inspirationId;
                  if (inspirationId) {
                     const socialLink = this.system.social.find( x=> x.linkId == inspirationId);
                     if (!socialLink) return false;
                     return socialLink.inspiration >= usable.system.inspirationCost;
                  } else {
                     const inspiration = this.system.social.reduce( (acc, item) => acc + item.inspiration , 0)
                     return inspiration >= usable.system.inspirationCost;
                  }
               case "downtime":
                  const combat = game.combat as PersonaCombat;
                  if (!combat) return false;
                  return combat.isSocial;
               default:
                  return true;
            }
         }
         case "consumable":
            return usable.system.amount > 0;
         case "skillCard":
            return this.canLearnNewSkill();
      }
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

   canPayActivationCost_shadow(this: Shadow, usable: UsableAndCard, outputReason: boolean) : boolean {
      if (usable.system.type == "skillCard") {
         return false;
      }
      if (usable.system.type == "power") {
         const combat = game.combat;
         // if (combat && usable.system.reqEscalation > 0 && (combat as PersonaCombat).getEscalationDie() < usable.system.reqEscalation) {
         const energyRequired = usable.system.energy.required;
         const energyCost = usable.system.energy.cost;
         const currentEnergy = this.system.combat.energy.value;
         if (combat && energyRequired > 0 && energyRequired > currentEnergy) {
            if (outputReason) {
               ui.notifications.notify(`Requires ${energyRequired} energy and you only have ${currentEnergy}`);
            }
            return false;
         }
         if (combat && energyCost > (currentEnergy + 1)) {
            if (outputReason) {
               ui.notifications.notify(`Costs ${energyCost} energy and you only have ${currentEnergy}`);
            }
            return false;
         }
         if (usable.system.reqHealthPercentage < 100) {
            const reqHp = (usable.system.reqHealthPercentage / 100) * this.mhp ;
            if (this.hp > reqHp) return false;
         }
      }
      return true; //placeholder
   }

   getSocialStat(this: PC, socialStat: SocialStat) : ModifierList {
      const stat = this.system.skills[socialStat];
      const mods = new ModifierList();
      const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
      mods.add(skillName, stat);
      return mods.concat(this.getBonuses(socialStat));
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
      PersonaSounds.newSocialLink();
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
      // link.currentProgress= 0;
      link.inspiration = link.linkLevel;
      if (link.linkLevel == 10) {
         PersonaSounds.socialLinkMax();
      } else {
         PersonaSounds.socialLinkUp();
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
      PersonaSounds.socialLinkReverse();
      if (link.linkLevel == 0) {
         const newSocial = this.system.social.filter( x=> x != link);
         await this.update({"system.social": newSocial});
         return;
      }
      await this.update({"system.social": this.system.social});
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
         case 1: PersonaSounds.socialBoostJingle(1);
            break;
         case 2: PersonaSounds.socialBoostJingle(2);
            break;
         case 3: PersonaSounds.socialBoostJingle(3);
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
      await this.update({"system.social": this.system.social});
   }


   getInspirationWith(linkId: SocialLink["id"]): number {
      if (this.system.type != "pc") return 0;
      const link = this.system.social.find( x=> x.linkId == linkId);
      if (!link) return 0;
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
      const tarot = targetPC.tarot;
      if (!tarot) {
         console.debug(`No tarot found for ${this.name} or ${linkHolder.name}`);
         return this.focii.sort( sortFn);
      }
      return this.focii.concat(tarot.focii).sort(sortFn);
   }

   getSocialFocii_NPC(this: NPC, linkHolder: SocialLink) : Focus[] {
      const sortFn = function (a: Focus, b: Focus) {
         return a.requiredLinkLevel() - b.requiredLinkLevel();
      };
      const tarot = this.tarot ?? linkHolder.tarot;
      if (!tarot) {
         console.debug(`No tarot found for ${this.name} or ${linkHolder.name}`);
         return this.focii.sort( sortFn);
      }
      return this.focii.concat(tarot.focii).sort(sortFn);
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

   getSourcedEffects(this: ValidAttackers): {source: ModifierContainer, effects: ConditionalEffect[]} []{
      return this.mainModifiers().flatMap( x=> x.getSourcedEffects(this));
   }

   getEffects(this: ValidAttackers) : ConditionalEffect[] {
      return this.mainModifiers().flatMap( x=> x.getEffects(this));
   }

   getPassivePowers(): Power[] {
      return this.powers
         .filter( power=> power.system.subtype == "passive");
   }

   canEngage() :boolean {
      return !this.isDistracted() && this.isCapableOfAction();
   }

	canAllOutAttack(): boolean {
		if (this.hp < 0) return false;
		if (this.isDistracted()) return false;
		if (!this.isCapableOfAction()) return false;
		if (this.hasBanefulStatus()) return false;
		return true;
	}

	hasBanefulStatus(): boolean {
		for (const st of this.effects.contents) {
			for (const statusId of st.statuses.keys()) {
				if (BANEFUL_STATUSES_MAP.has(statusId as any)) {
					return true;
				}
			}
		}
		return false;
	}

   getLevelOfTalent(this: PC, talent: Talent) : number {
      const x= this.system.talents.find( x=> x.talentId == talent.id);
      if (!x) return 0;
      return x.talentLevel;
   }

   async incrementTalent(this: PC | NPCAlly, talentId: string) {
      const x = this.system.talents.find( x => x.talentId == talentId);
      if (!x) return;
      x.talentLevel = Math.min(3, x.talentLevel+1);
      await this.update({"system.talents": this.system.talents});
      const talent = PersonaDB.allItems().find( item => item.id == talentId);
      await Logger.sendToChat(`<b>${this.name}:</b> raised talent ${talent?.name} to level ${x.talentLevel}`, this);
   }

   async decrementTalent(this:PC | NPCAlly, talentId :string) {
      const x = this.system.talents.find( x => x.talentId == talentId);
      if (!x) return;
      x.talentLevel = Math.max(0, x.talentLevel-1);
      await this.update({"system.talents": this.system.talents});
      const talent = PersonaDB.allItems().find( item => item.id == talentId);
      await Logger.sendToChat(`<b>${this.name}:</b> reduced talent ${talent?.name} to level ${x.talentLevel}`, this);
   }

   getSaveBonus( this: ValidAttackers) : ModifierList {
      const mods = this.mainModifiers().flatMap( item => item.getModifier("save", this));
      // const x = this.getActiveTokens()[0]
      return new ModifierList(mods);
   }

   getDisengageBonus( this: ValidAttackers) : ModifierList {
      const mods = this.mainModifiers().flatMap( item => item.getModifier("disengage", this));
      return new ModifierList(mods);
   }

   /** returns current team (taking into account charm)*/
   getAllegiance(this: ValidAttackers)  : Team {
      let base: Team;
      switch (this.system.type) {
         case "pc":
            if (!this.hasPlayerOwner) return "Neutral";
            base = "PCs";
            break;
         case "shadow":
            base = "Shadows";
            break;
         case "npcAlly":
            base = "PCs";
            break;
      }
      if (!this.statuses.has("charmed")) return base;
      return base == "PCs" ? "Shadows" : "PCs";
   }

   async expendConsumable(item: UsableAndCard) {
      if (item.system.type == "power") {
         PersonaError.softFail("Can't expend a power, this function requires an item");
         return;
      }
      const amount = item.system.amount;
      if (amount <= 1) {
         await item.delete();
         return;
      }
      if (amount > 1) {
         await item.update({"system.amount": amount-1});
         return;
      }
   }

   roomModifiers() : ModifierContainer[] {
      return (game.combats.contents as PersonaCombat[])
         .filter(combat => combat.combatants.contents
            .some( comb => comb.actor == this)
         ).flatMap( combat=> combat.getRoomEffects())
   }

   /** used for determining all out attack viability*/
   isStanding() : boolean {
      return (this.hp > 0 && !this.statuses.has("down"))
   }

	isValidCombatant(): this is ValidAttackers {
		switch (this.system.type) {
			case "pc":
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

   isCapableOfAction() : boolean {
      const deblitatingStatuses :StatusEffectId[] = [
         "confused",
         "down",
         "fading",
         "fear",
         // "frozen",
         "sleep",
         "shock",
      ];
      return (
         this.hp > 0
         && !deblitatingStatuses.some( stat => this.statuses.has(stat))
      );
   }

   async fullHeal() {
      if (this.system.type == "pc" || this.system.type == "shadow" || this.system.type == "npcAlly") {
         this.hp = this.mhp;
         if (this.system.type == "pc") {
            this.update({"system.combat.mp.value" : this.mmp});
         }
         (this as PC | Shadow).refreshHpTracker();
      }
   }

async onEnterMetaverse() {
	if (!this.isValidCombatant()) return;
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
			.onTrigger("enter-metaverse", this, situation)
			.emptyCheck()
			?.autoApplyResult();
	} catch (e) {
		console.log(e);
		PersonaError.softFail(`problem with onEnterMetaverse for ${this.name}`, e);
	}
}

async OnExitMetaverse(this: ValidAttackers ) {
   try {
      this.fullHeal();
      for (const eff of this.effects) {
         if (eff.durationLessThanOrEqualTo({ dtype: "expedition"})) {
            await eff.delete();
         }
      }
      if (this.system.type == "pc") {
         const pc = this as PC;
         await pc.refreshSocialLink(pc);
      }
   } catch (e) {
      console.log(e);
      ui.notifications.error(`problem with OnExitMetaverse for ${this.name}`);
   }
}

async levelUp(this: PC | NPCAlly) : Promise<void> {
   const newlevel  = this.system.combat.classData.level+1 ;
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
      "system.combat.classData.level": newlevel,
      "system.combat.classData.incremental": incremental,
      "system.combat.classData.incremental_progress": 0,
		"system.combat.xp" : 0,
   });
}

maxSlot() : number {
   switch (this.system.type) {
      case "shadow": return 99;
      case "npc": return -1;
      case "tarot": return -1;
      case "pc":
      case "npcAlly":
         break;
      default:
         this.system satisfies never;
   }
   const level = this.system.combat.classData.level;
   switch (true) {
      case level >= 9: return 3;
      case level >= 6: return 2;
      case level >= 5: return 2; // SPECIAL CASE
      case level >= 3: return 1;
      default: return 0;
   }
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
            return this.system.combat.fadingState >= 2;
      default:
         this.system satisfies never;
         return true;
   }
}

isFading(this: ValidAttackers): boolean {
   if (this.system.type == "shadow") return false;
   return this.hp <= 0 && this.system.combat.fadingState < 2;
}

get triggers() : ModifierContainer[] {
   switch (this.system.type ) {
      case "npc":
      case "tarot":
         return []
      case "pc":
      case "shadow":
      case "npcAlly":
         return (this as ValidAttackers).mainModifiers().filter( x=>
            x.getEffects(this as ValidAttackers).some( eff =>
               eff.conditions.some( cond => cond.type == "on-trigger")
            )
         );
      default:
         this.system satisfies never;
         return [];
   }
}

async setFadingState (this: ValidAttackers, state: number) {
   switch (state) {
      case 0:
         await this.removeStatus({
            id: "fading"
         });
         break;
      case 1:
         if (state == this.system.combat.fadingState)
            return;
         await this.addStatus({
            id:"fading",
            duration: {
               dtype: "expedition"
            },
         });
         break;
      case 2:
         break;
   }
   if (state == this.system.combat.fadingState)
      return;
   await this.update( {"system.combat.fadingState": state});
   await this.refreshHpStatus();
}

async alterSocialSkill (this: PC, socialStat: SocialStat, amt: number, logger = true) {
   const oldval = this.system.skills[socialStat];
   const newval = oldval + amt;
   const upgradeObj : Record<string, any> = {};
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

async gainMoney(this: PC, amt: number, log :boolean) {
   if (amt < 0) {
      return this.spendMoney(amt);
   }
   if (amt > 200) {
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
   if (this.system.type == "npc") return true;
   return this.hp > 0;
}

async setAvailability(this: SocialLink, bool: boolean) {
   if (this.isOwner) {
      await	this.update( {"system.weeklyAvailability.available": bool});
   } else {
      PersonaSocial.requestAvailabilitySet(this.id, bool);
   }
}
get tarot() : (Tarot | undefined) {
   switch (this.system.type) {
      case "pc":
         if (this.cache.tarot?.name == this.system.tarot)
            break;
         if (this.system.tarot == "")
            return undefined;
         const PC = this as PC;
         this.cache.tarot = PersonaDB.tarotCards().find(x=> x.name == PC.system.tarot);
         break;
      case "shadow":
         if (this.cache.tarot?.name == this.system.tarot)
            break;
         if (this.system.tarot == "")
            return undefined;
         const shadow = this as Shadow;
         this.cache.tarot =  PersonaDB.tarotCards().find(x=> x.name == shadow.system.tarot);
         break;
      case "npcAlly":
         if (this.system.NPCSocialProxyId) {
            const actor = PersonaDB.socialLinks().find( x=> x.id == (this as NPCAlly).system.NPCSocialProxyId);
            if (actor) return actor.tarot;
         }
         //switch fallthrough is deliberate here
      case "npc":
         if (this.cache.tarot?.name == this.system.tarot)
            break;
         if (this.system.tarot == "")
            return undefined;
         // console.debug("cached value no good (NPC)");
         const NPC = this as NPC;
         if (
            NPC == PersonaDB.personalSocialLink()
            || NPC == PersonaDB.teammateSocialLink()
         ) {
            return undefined;
         }
         this.cache.tarot =  PersonaDB.tarotCards().find(x=> x.name == NPC.system.tarot);
         break;
      case "tarot":
         return this as Tarot;
      default:
         this.system satisfies never;
         return undefined;
   }
   return this.cache.tarot;
}


/** returns true on level up */
async awardXP(this: PC | NPCAlly, amt: number) : Promise<boolean> {
   let levelUp = false;
   let newxp = this.system.combat.xp + amt;
   while (newxp > 100) {
      newxp -= 100;
      levelUp = true;
   }
   await this.update({"system.combat.xp" : newxp});
   return levelUp;
}

XPValue(this: Shadow) : number {
	const SHADOWS_TO_LEVEL = 20;
	const baseXP = 100/SHADOWS_TO_LEVEL;
		const role = shadowRoleMultiplier(this.system.role) * shadowRoleMultiplier(this.system.role2);
		const incrementals = Object.entries(this.system.combat.classData.incremental).reduce ( (acc, i) => {
			if (typeof i == "number") return acc+i;
			if (typeof i == "boolean") return acc + (i ? 1 : 0);
			return acc;
		}, 0);
	return baseXP * role * (1 + (incrementals * 0.05));

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
   if (flag) return {
      flagId,
      duration: flag.statusDuration,
      flagName: flag.name,
      AEId: flag.id,
   };
}

hasRole( role: Shadow["system"]["role"]): boolean {
	if (this.system.type != "shadow") return false;
	return this.system.role == role
	|| this.system.role2 == role;
}

isBossOrMiniBossType() : boolean {
	if (this.system.type != "shadow") return false;
	const bossRoles : Shadow["system"]["role"][] = [
		"miniboss", "miniboss-lord" , "boss" , "boss-lord"
	];
	return bossRoles.some( role => this.hasRole(role));
}

async onStartCombatTurn(this: PC | Shadow): Promise<string[]> {
   console.log(`${this.name} on Start turn`);
   await this.removeStatus("blocking");
   let ret = [] as string[];
   for (const eff of this.effects) {
      if ( await eff.onStartCombatTurn()) {
         ret.push(`Removed Condition ${eff.displayedName} at start of turn`);
      }
   }
	if (this.isBossOrMiniBossType()) {
		//TODO: experimental boss save
		// ret.push(...await this.endTurnSaves());
	}
	return ret;
}

async onEndCombatTurn(this : ValidAttackers) : Promise<string[]> {
   const burnStatus = this.effects.find( eff=> eff.statuses.has("burn"));
   if (burnStatus) {
      const damage = burnStatus.potency;
      await this.modifyHP(-damage);
   }
   let ret = await this.onEndCombatTurn();
   return ret;
}

async endTurnSaves(this: ValidAttackers) : Promise<string[]> {
   let ret = [] as string[];
   for (const eff of this.effects) {
      if (await eff.onEndCombatTurn()) {
         ret.push(`Removed Condition ${eff.displayedName} at end of turn`);
      }
   }
	return ret;
}

getFlagState(flagName: string) : boolean {
   return !!this.getEffectFlag(flagName);
}

getFlagDuration(flagName: string) : StatusDuration | undefined {
   return this.getEffectFlag(flagName)?.duration;
}

async setEffectFlag(flagId: string, setting: boolean, duration: StatusDuration = {dtype: "instant"}, flagName ?: string) {
   if (setting) {
      await this.createEffectFlag(flagId, duration, flagName);
   } else {
      await this.clearEffectFlag(flagId);
   }
}


async createEffectFlag(flagId: string, duration: StatusDuration = {dtype: "instant"}, flagName ?: string) {
   flagId = flagId.toLowerCase();
   const eff = this.effects.find(x=> x.isFlag(flagId))
   const newAE = {
      name: flagName,
   };
   if (eff) {
      eff.setDuration(duration);
   } else {
      const AE = (await  this.createEmbeddedDocuments("ActiveEffect", [newAE]))[0] as PersonaAE;
      await AE.setDuration(duration);
      await AE.markAsFlag(flagId);
   }
}

async clearEffectFlag(flagId: string) {
   const eff = this.effects.find(x=> x.isFlag(flagId))
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
   if (this.system.type == "pc") return false;
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
      case "npc": case "npcAlly":
         const npc = this as NPC;
         const sit: Situation = {
            user: (pc as PC).accessor,
            socialTarget: npc.accessor,
         };
         if(!testPreconditions(this.system.availabilityConditions,sit, null)) {
            return false;
         }
         break;
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

isSociallyDisabled(): boolean {
   switch (this.system.type) {
      case "shadow":
      case "tarot":
         return true;
      case "pc":
         const statuses : StatusEffectId[] = ["jailed", "exhausted", "crippled", "injured"];
         return statuses.some( x=> this.hasStatus(x));

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

async moneyFix() {
   //updates money to new x10 total
   switch (this.system.type) {
      case "pc":
         const money = this.system.money * 10;
         await this.update({"system.money": money});
      default:
         return;
   }
}

/** return true if target is harder to disengage from (hard diff)
 */
isSticky() : boolean {
   return this.hasStatus("sticky");
}

isDistracted() : boolean {
   const distractingStatuses :StatusEffectId[] = [
      "confused",
      "down",
      "fading",
      "fear",
      "frozen",
      "sleep",
      "shock",
      "dizzy",
      "burn",
   ];
   return distractingStatuses.some( status => this.hasStatus(status));
}

async setDefaultShadowCosts(this: Shadow, power: Power) {
   if (!this.items.get(power.id)) {
      ui.notifications.warn("Shadow can't edit power it doesn't own");
      return;
   }
   const role = this.system.role;
   const userLevel = this.system.combat.classData.level
      + (this.system.combat.classData.incremental.talent ? 1 : 0)
   const powerLevel = power.powerEffectLevel();
   const diff = powerLevel - userLevel;
   const cost = PersonaActor.calcPowerCost(role, power, diff);
   const energyReq = PersonaActor.calcPowerRequirement(role, power,  diff);
   await power.update({
      "system.energy.required": energyReq,
      "system.energy.cost": cost
   });
}

allOutAttackDamage(this: ValidAttackers, situation?: Situation) : { high: number, low: number } {
   let high = 0, low = 0;
   if (this.isDistracted() || !this.isCapableOfAction()) {
      return {high, low};
   }
   if (!situation) {
      situation = {
         user: this.accessor,
         attacker: this.accessor,
      };
   }
   const basicAttack = PersonaDB.getBasicPower("Basic Attack");
   if (!basicAttack) {
      PersonaError.softFail("Can't find Basic attack power");
      return {high, low};
   }
   const mult = basicAttack.getDamageMultSimple(this, situation);
   low = basicAttack.getDamage(this, "low") * mult;
   high = basicAttack.getDamage(this, "high") * mult;
   return {high, low};
}

getPoisonDamage(this: ValidAttackers): number {
   const base = Math.round(this.mhp * 0.15);
   switch (this.system.type) {
      case "pc":
      case "npcAlly":
         return base;
      case "shadow":
         break;
      default:
         this.system satisfies never;
   }
   switch (this.system.role) {
      case "miniboss":
      case "miniboss-lord":
      case "boss-lord":
      case "boss":
         return Math.round(base / 4);
      default:
         return base;
   }
}

static calcPowerRequirement(role: Shadow["system"]["role"], power: Readonly<Power>,  diff: number) : number {
   if (power.system.tags.includes("basicatk"))
      return 0;
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
      return 0;
   if (diff <= 0) return 0;
   let esc = Math.round(Math.abs(diff) / 2);
   return Math.clamp(esc, 0, 6);
}

async increaseScanLevel(this: Shadow, amt :number) {
   const scanLevel = this.system.scanLevel ?? 0;
   if (scanLevel >= amt) return;
   if (this.token) {
      await this.token.baseActor.increaseScanLevel(amt);
   }
   await this.update({"system.scanLevel": amt});
   if (amt > 0) {
      this.ownership.default = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
      await this.update({"ownership": this.ownership});
   }
}

async setEnergy(this: Shadow, amt: number) {
   amt = Math.clamp(amt, -1, this.system.combat.energy.max);
   await this.update({"system.combat.energy.value": amt});
}

async alterEnergy(this: Shadow, amt: number) {
   await this.setEnergy(this.system.combat.energy.value + amt);
}

async onCombatStart() {
}

get tagList() : CreatureTag[] {
   //NOTE: This is a candidate for caching
   if (this.system.type == "tarot") return [];
   let list = this.system.creatureTags.slice();
   if (this.system.type == "pc" || this.system.type == "shadow") {
      const extraTags = this.mainModifiers().flatMap( x=> x.getConferredTags(this as PC | Shadow));
      for (const tag of extraTags) {
         if (!list.includes(tag))
            list.push(tag);
      }
   }
   switch (this.system.type) {
      case "pc":
         if (!list.includes("pc")) {
            list.push("pc");
         }
         return list;
      case "npcAlly":
         if (!list.includes("npc-ally")) {
            list.push("npc-ally");
         }
         return list;
      case "npc": return list;
      case "shadow": return list;
      default:
         this.system satisfies never;
         return [];
   }

}
hasCreatureTag(tag: CreatureTag) : boolean{
   return this.tagList.includes(tag);
}

async deleteCreatureTag(index: number) : Promise<void> {
   const tags = this.system.creatureTags;
   tags.splice(index, 1);
   await this.update( {"system.creatureTags": tags});
}

async addCreatureTag() : Promise<void> {
   const tags = this.system.creatureTags;
   tags.push("neko");
   await this.update( {"system.creatureTags": tags});
}

async onAddToCombat() {
   switch (this.system.type) {
      case "shadow":
         const sit : Situation = {
            user: (this as Shadow).accessor,
         }
         const startingEnergy = 1 + (this as Shadow).getBonuses("starting-energy").total(sit);
         await (this as Shadow).setEnergy(startingEnergy);
         break;
      case "pc":
      case "npc":
      case "tarot":
         break;
   }

}

get treasureString() : SafeString {
   if (this.system.type != "shadow") return "";
   const treasure = this.system.encounter.treasure;
   const items = [treasure.item0, treasure.item1, treasure.item2]
      .filter( id=> id)
      .map( id => PersonaDB.treasureItems().find(x=> x.id == id))
      .flatMap(item => item ? [item.name] : [])
   const cardPower = treasure.cardPowerId ? PersonaDB.allPowers().filter( x=> treasure.cardPowerId == x.id): [];
   const cardName = cardPower.map( pwr => `${pwr.name} Card`);
   return new Handlebars.SafeString(items.concat(cardName).join(", "));
}

static convertSlotToMP(slotLevel: number) {
   switch (slotLevel) {
      case 0: return 4;
      case 1: return 8;
      case 2: return 12;
      case 3: return 24;
      default: return 48;
   }
}

}

Hooks.on("preUpdateActor", async (actor: PersonaActor, changes: {system: any}) => {
   switch (actor.system.type) {
      case "npc": return;
      case "tarot": return;
      case "pc":
      case "npcAlly":
      case "shadow":  {
         const newHp = changes?.system?.combat?.hp;
         if (newHp == undefined)
         return;
         await (actor as ValidAttackers).refreshHpStatus(newHp);
         return ;
      }
      default:
         actor.system satisfies never;
         throw new PersonaError(`Unknown Type ${actor.type}`);
   }
});

Hooks.on("updateActor", async (actor: PersonaActor, changes: {system: any}) => {
   switch (actor.system.type) {
      case "npcAlly":
         if (changes?.system?.combat?.isNavigator == true) {
            await (actor as NPCAlly).setAsNavigator();
         }
         await	(actor as NPCAlly).refreshHpTracker();
         break;
      case "pc": case "shadow":
         await	(actor as PC | Shadow).refreshHpTracker();
         break;
      case "npc": case "tarot":
         break;
      default:
         actor.system satisfies never;
   }
});

Hooks.on("createToken", async function (token: TokenDocument<PersonaActor>)  {
   if (token.actor && game.user.isGM && token.actor.system.type == "shadow") {
      token.actor.fullHeal();
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

const EMPTYARR :any[] = [] as const; //to speed up things by not needing to create new empty arrays for immutables;

Object.seal(EMPTYARR);


