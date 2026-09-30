import {FusionCombination, FusionTable} from "../../config/fusion-table.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {Persona} from "../persona-class.js";
import {PersonaCompendium} from "../persona-compendium.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {TimedCache} from "../utility/cache.js";
import {Logger} from "../utility/logger.js";

export class PersonaManager<ActorType extends ValidAttackers = ValidAttackers> {
  constructor ( private actor: ActorType)
  {}

  private cache = {
    persona : new TimedCache( () => this._persona(), 3000),
    basePersona : new TimedCache( () => this._basePersona(), 3000),
  };

  static BASE_PERSONA_SIDEBOARD = 5 as const;

  async addPersona(shadow: Shadow) : Promise<boolean> {
    if (this.actor.isPC() && (!shadow.hasPlayerOwner || !shadow.isOwner)) {
      PersonaError.softFail("Can't add this, doesn't have a player owner");
      return false;
    }
    if (!this.hasSpaceForNewPersona()) {
      if (this.maxPersonaSideboard > 0) {
        if (await this.addSideboardPersona(shadow))
        { return true; }
      }
      PersonaError.softFail("No Space for a new persona");
      return false;
    }
    if (!shadow.isPersona()) {
      PersonaError.softFail("Can't add this, it's not a persona");
      return false;
    }
    if (await this.addPersonaToMainList(shadow)) {
      return true;
    }
    PersonaError.softFail(`Couldn't add Persona : ${shadow.name} to ${this.actor.name}`);
    return false;
  }

  async addPersonaToMainList(shadow: Shadow, logging = this.actor.isPC()) : Promise<boolean> {
    if (!shadow.isPersona()) {
      PersonaError.softFail("Can't add this, it's not a persona");
      return false;
    }
    if (!this.hasSpaceForNewPersona()) {
      return false;
    }
    const arr = this.actor.system.personaList.slice();
    arr.push(shadow.id);
    await this.actor.update( {"system.personaList": arr});
    if (logging) {
      await Logger.sendToChat(`${this.actor.name} adds Persona ${shadow.displayedName}`);
    }
    return true;
  }

  canAddNewPersona() : boolean {
    if (this.actor.isShadow()) {return true;}
    return this.hasSpaceForNewPersona() || this.hasSpaceForNewSideboardPersona();
  }

  hasSpaceForNewPersona() : boolean {
    if (this.actor.isShadow()) {return true;}
    return this.personaList.length < this.maxPersonas;
  }

  hasSpaceForNewSideboardPersona() : boolean {
    return this.sideboardPersonas.length < this.maxPersonaSideboard;
  }


  async deletePersona( personaId: ValidAttackers["id"]) {
    if (await this._deletePersonaFromMainList(personaId)) { return; }
    if (this.actor.isPC() && await this.deletePersonaFromSideboard(personaId)) { return; }
    PersonaError.softFail(`Couldn't find persona ${personaId}`);
  }

  async _deletePersonaFromMainList( personaId: ValidAttackers["id"]) {
    const persona = this.personaList.find( x=> x.source.id == personaId);
    if (persona) {
      const newList = this.actor.system.personaList.filter( x=> x != personaId);
      await this.actor.update( {"system.personaList": newList});
      await this.promoteSideboardPersonaToFillEmptySlots();
      if (this.actor.isPC()) {
        await Logger.sendToChat(`${this.actor.name} deletes Persona ${persona.displayedName}`);
      }
      return true;
    }
    return false;
  }

  private async deletePersonaFromSideboard(personaId: ValidAttackers["id"], logging = this.actor.isPC()) {
    if (!this.actor.isPC()) {return false;}
    let sideboard = this.actor.system.combat.persona_sideboard;
    if (sideboard.includes(personaId)) {
      const persona = this.sideboardPersonas.find( p => p.source.id == personaId)!;
      sideboard = sideboard.filter( x=> x != personaId);
      await this.actor.update( {"system.combat.persona_sideboard": sideboard});
      if (logging) {
        await Logger.sendToChat(`${this.actor.name} deletes Persona ${persona.displayedName} from Sideboard`);
      }
      return true;
    }
    return false;
  }

  async promoteSideboardPersonaToFillEmptySlots() : Promise<boolean> {
    if (this.actor.isShadow() || this.sideboardPersonas.length <= 0) {
      return false;
    }
    const movedPersona = this.sideboardPersonas[0];
    if (this.personaList.length < this.maxPersonas && movedPersona.source.isShadow()) {
      const del = await this.deletePersonaFromSideboard(movedPersona.source.id, false);
      const promote = await this.addPersonaToMainList(movedPersona.source, false);
      if (!del || !promote) {
        PersonaError.softFail(`Problem promoting ${movedPersona.name} from Sideboard to main`);
        return false;
      }
      return true;
    }
    return false;
  }

  get personaList(): Persona[] {
    if (!this.actor.isValidCombatant()) {return [];}
    const maxCustomPersonas = this.actor.class.system.uniquePersonas;
    const actorList : ValidAttackers[] = this.actor.system.personaList
      .map( personaId=> PersonaDB.getActorById(personaId))
      .filter(x=> x && x?.isValidCombatant()) as ValidAttackers[];
    if (this.hasSoloPersona || this.actor.isShadow()) {
      if (this.actor.isPC()) { return [this.actor.basePersona];};
      actorList.pushUnique(this.actor);
    }
    const customPersonas = actorList.reduce( (acc, actor) => acc + (actor.isShadow() && actor.isCustomPersona() == true ? 1 : 0) , 0);
    if (maxCustomPersonas > customPersonas) {
      actorList.pushUnique(this.actor);
    }
    return actorList.map( source=> new Persona(source, this.actor));
  }


  get maxPersonaSideboard() : number {
    if (!this.actor.isPC()) {return 0;}
    if (!this.actor.class.system.canUsePersonaSideboard) {return 0;}
    const base = PersonaManager.BASE_PERSONA_SIDEBOARD;
    const bonuses = this.actor.getPersonalBonuses("persona-sideboard").total( {user: this.actor.accessor});
    return base + bonuses;
  }

  get sideboardPersonas(): readonly Persona[] {
    if (!this.actor.isPC()) {return [];}
    if (!this.actor.class.system.canUsePersonaSideboard) {return [];}
    const sideboardIds = this.actor.system.combat.persona_sideboard;
    const personas = sideboardIds
      .flatMap( id =>  {
        const shadow = PersonaDB.getActor(id);
        return shadow != undefined && shadow.isShadow() ? [shadow] : [];
      })
      .map( shadow => new Persona(shadow, this.actor)) ;
    return personas;
  }

  async addSideboardPersona(shadow: Shadow) : Promise<boolean> {
    if (!this.actor.isPC() || this.maxPersonaSideboard <= 0) {
      ui.notifications.warn(`${this.actor.name} can't add sideboard Personas`);
      return false;
    }
    if (!shadow.isPersona()) {
      ui.notifications.warn(`Can't add ${shadow.name} as sideboard persona (not a persona)`);
      return false;
    }
    const sideboardIds = this.actor.system.combat.persona_sideboard;
    if (sideboardIds.includes(shadow.id)) {
      ui.notifications.warn(`${shadow.name} already in Persona sideboard`);
      return false;
    }
    if (sideboardIds.length >= this.maxPersonaSideboard) {
      ui.notifications.warn(` Can't add to ${this.actor.name} Sideboard, Sideboard is full`);
      return false;
    }
    sideboardIds.push(shadow.id);
    await this.actor.update( {"system.combat.persona_sideboard": sideboardIds});
    await Logger.sendToChat(`${this.actor.name} added ${shadow.name} as sideboard persona`);
    return true;
  }

  get maxPersonas() : number {
    if (!this.actor.isValidCombatant()) {return 0;}
    const maxCustomPersonas = this.actor.class.system.uniquePersonas;
    let wildPersonas = this.actor.class.system.maxPersonas;

    if (wildPersonas > 0 && this.maxPersonaSideboard == 0) {
      const bonus = this.actor.getPersonalBonuses("persona-sideboard").total({user: this.actor.accessor});
      wildPersonas += bonus;
    }
    return Math.max( 0, maxCustomPersonas -1) + wildPersonas;
  }

  get hasSoloPersona(): boolean {
    const actor = this.actor;
    if (!actor.isValidCombatant()) {return false;}
    if (actor.isNPCAlly()) {return true;}
    if (actor.isPC()) {
      const totalPersonas = actor.class.system.uniquePersonas + actor.class.system.maxPersonas;
      return totalPersonas == 1;
    }
    if (actor.isShadow()) {return actor.system.personaList.length <= 1;}
    actor satisfies never;
    return false;
  }

  async switchPersona( sourceId: ValidAttackers["id"]) {
    this.cache.persona.clear();
    if (this.actor.hasStatus("sealed")) {
      ui.notifications.warn("Can't swap persona while sealed");
      return;
    }
    const persona = this.personaList.find( x=> x.source.id == sourceId);
    if (!persona || !persona.source.isOwner) {
      PersonaError.softFail(`Couldn't find Persona ${sourceId} in your persona List or you aren't its owner`);
      return;
    }
    await this.actor.update({"system.activePersona": sourceId});
    const combat = PersonaCombat.combat;
    if (!combat || combat.isSocial) {
      if (this.actor.isPC()) {
        await Logger.sendToChat(`${this.actor.name} activates Persona ${persona.publicName}`);
        return;
      } else {
        ui.notifications.notify(`${this.actor.name} switches Persona to ${persona.publicName}`);
        return;
      }
    } else {
      let msg = "";
      if (sourceId == this.actor.id && !this.actor.basePersona.img) {
        msg = `<div class="persona-switch">
          ${this.actor.publicName} Changes to base Persona </div>`;
      } else {
        msg = `<div class="persona-switch">
          ${this.actor.publicName} changes Persona!
          </div>
          <img class="persona-img" src="${persona.img}" title="${persona.publicName}">
          `;
      }
      const messageData: MessageData = {
        speaker: {alias: `${this.actor.publicName}`},
        content: msg,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      };
      await ChatMessage.create(messageData, {});
    }
  }

  get hasMultiplePersonas() : boolean {
    if (!this.actor.isValidCombatant()) {return false;}
    return this.personaList.length > 1;
  }

  persona():  Persona<ActorType extends NPC ? NPCAlly : ActorType> {
    return this.cache.persona.value;
    // return this.cache2.persona.value as unknown as Persona<T extends NPC ? NPCAlly : T>;
  }

  private _persona(): Persona<ActorType extends NPC ? NPCAlly : ActorType> {
    type returnType =  Persona<ActorType extends NPC ? NPCAlly : ActorType>;
    switch (this.actor.system.type) {
      // case "npc": {
      //   const proxy = (this.actor as NPC).getNPCAllyProxy();
      //   if (!proxy) {throw new Error("Can't get persona for noncombatant");}
      //   return proxy.personas.persona() as returnType;
      // }
      case "npcAlly":
        return this.basePersona as returnType;
      case "pc": {
        if ((this.actor.isPC() && (this.actor.system.activePersona == null || this.actor.system.activePersona == this.actor.id || this.hasSoloPersona))) {
          return this.basePersona as returnType;
        }
        const activePersona = PersonaDB.getActorById((this.actor as PC).system.activePersona) as ValidAttackers;
        if (!activePersona) {
          return this.basePersona as returnType;
        };
        return new Persona(activePersona, this.actor) as returnType;
      }
      case "shadow":
        if (this.actor.system.activePersona) {
          const activePersona = PersonaDB.getActorById((this.actor as PC).system.activePersona) as U<ValidAttackers>;
          if(activePersona) {
            return new Persona(activePersona, this.actor as Shadow) as returnType;
          }
        }
        return this.basePersona as returnType;
      default:
        this.actor.system satisfies never;
        throw new PersonaError(`Can't get persona for ${this.actor.name}`);
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

  compendiumFusionCombinations() : FusionCombination[] {
    const arr = this.personaList
      .concat(this.sideboardPersonas);
    const additional = PersonaCompendium.allCompendiumPersonas()
      .filter( compPer=> !arr
        .some(shadow => shadow.compendiumEntry == compPer)
      ).map( shadow => new Persona(shadow, this.actor));
    arr.push(...additional);
    return FusionTable.fusionCombinationsOutOf(arr);
  }

  get basePersona() : Persona {
    return this.cache.basePersona.value;
  }

  _basePersona() : Persona {
    // if (this.actor.isNPC()) {
    //   const proxy : U<NPCAlly> = this.getNPCAllyProxy();
    //   if (!proxy) {
    //     throw new PersonaError("Can't call basePersona getter on non combatant");
    //   }
    //   return new Persona(proxy, proxy, proxy._mainPowers());
    // }
    // if (!this.isValidCombatant() && !this.isPC()) {
    //   throw new PersonaError("Can't call basePersona getter on non combatant");
    // }
    return new Persona(this.actor, this.actor, this.actor._mainPowers());
  }

}
