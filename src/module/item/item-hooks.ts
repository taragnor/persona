import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaDB} from "../persona-db.js";
import {Logger} from "../utility/logger.js";
import {PersonaItem} from "./persona-item.js";

export class ItemHooks {
  static init() {
    Hooks.on("preUpdateItem", (item : PersonaItem, changes) => {
      if (!item.isCarryableType()
        || item.parent == null
        || !item.hasPlayerOwner
        || !(item.parent instanceof PersonaActor)
      ) {
        return;
      }
      const itemChanges = changes as Partial<typeof item>;
      if (itemChanges?.system?.amount != undefined && item.system.amount != itemChanges.system.amount) {
        void Logger.sendToChat(`${item.parent.name} -> ${item.name} Amount changed to ${itemChanges.system.amount} (old value: ${item?.system?.amount ?? 0})`);
      }
    });

    Hooks.on("createItem", (item: PersonaItem) => {
      const parent= item.parent;
      if (!parent || !(parent instanceof PersonaActor)) {
        return;
      }
      if (!item.isCarryableType()) {return;}
      if (!parent.isPCLike() && parent != PersonaDB.partyTokenActor()) {return;}
      if (!parent?.hasPlayerOwner) {return;}
      const msg = `${parent.name} gained ${item.name} (${item.amount})`;
      void Logger.sendToChat(msg, parent);
    });

    Hooks.on("updateItem", (item: PersonaItem) => {
      item.clearCache();
    });

    Hooks.on("deleteItem", (item: PersonaItem) => {
      const parent= item.parent;
      if (!parent || !(parent instanceof PersonaActor)) {
        return;
      }
      if (!item.isCarryableType()) {return;}
      if (!parent.isPCLike() && parent != PersonaDB.partyTokenActor()) {return;}
      if (!parent?.hasPlayerOwner) {return;}
      const msg = `${parent.name} deleted ${item.name} (${item.amount})`;
      void Logger.sendToChat(msg, parent);
    });
  }

}

