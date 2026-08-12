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

    Hooks.on("preCreateItem", (item: PersonaItem) => {
      const parent= item.parent;
      if (!parent || !(parent instanceof PersonaActor)) {
        return;
      }
      if (!item.isCarryableType()) {return;}
      if (!parent.isPCLike() && parent != PersonaDB.partyTokenActor()) {return;}
      if (!parent?.hasPlayerOwner) {return;}
      const msg = `${parent.name} gained ${item.displayedName} (${item.amount})`;
      void Logger.sendToChat(msg, parent);
    });

    Hooks.on("updateItem", (item: PersonaItem) => {
      item.clearCache();
    });

    Hooks.on("preDeleteItem", (item: PersonaItem) => {
      const parent= item.parent;
      if (!parent || !(parent instanceof PersonaActor)) {
        return;
      }
      if (!item.isCarryableType()) {return;}
      if (!parent.isPCLike() && parent != PersonaDB.partyTokenActor()) {return;}
      if (!parent?.hasPlayerOwner) {return;}
      const msg = `${parent.name} deleted ${item.displayedName} (${item.amount})`;
      void Logger.sendToChat(msg, parent);
    });

    Hooks.on('updateItem', (item :PersonaItem, _diff: DeepPartial<typeof item>) => {
      item.clearCache();
      if (item.parent instanceof PersonaActor) {
        item.parent.clearCache();
      }
      if (item.isTag()) {
        PersonaDB.allItems()
          .filter (x=> x.isCarryableType() || x.isUsableType() )
          .filter( x=> x.hasTag(item, null) )
          .forEach( x=> x.clearCache() );
      }
    });

    Hooks.on('deleteItem', async (item: PersonaItem) => {
      if (item.parent instanceof PersonaActor && item.hasPlayerOwner && item.isOwner && !game.user.isGM) {
        await Logger.sendToChat(`${item.parent.displayedName} deletes ${item.name}(${item.amount})`, item.parent);
      }
    });

  }


}

