import {PersonaActor} from "../actor/persona-actor.js";
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

    Hooks.on("updateItem", (item: PersonaItem) => {
      item.clearCache();
    });
  }
}


