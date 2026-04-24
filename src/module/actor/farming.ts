import {EnchantedTreasureFormat} from "../exploration/treasure-system";
import { PersonaDB } from "../persona-db.js";
import {PersonaError} from "../persona-error.js";

export class Farming {
  actor: PC;

  constructor (pc: PC) {
    this.actor = pc;
  }

  get system() {
    return this.actor.system;
  }

  update(...args : Parameters<PC["update"]>) {
    return this.actor.update(...args);
  }

  async harvestCrops() {
    const farming =this.system.farming;
    if (!this.canHarvestCrops()) {
      PersonaError.softFail("Trying to harvest whne it shouldn't be possible");
      return;
    }
    const item = PersonaDB.getItemById(farming.cropId);
    if (!item || !item.isConsumable()) {
      const msg ="Can't find crop by Id Or it isn't a consumable";
      PersonaError.softFail(msg, farming.cropId, item);
      return;
    }
    await this.actor.addItem( item, farming.amount ?? 1);
    const newFarmingData = {
    amount : 0,
    cropId : "",
    daysLeft : 0,
    };
    await this.update( {"system.farming" : newFarmingData });
  }

  async advanceCrops( days: number = 1) : Promise<string[]> {
    const farming =this.system.farming;
    if (!farming.cropId || farming.amount <= 0) {return [];}
    if (farming.daysLeft > 0) {
      farming.daysLeft = Math.max( 0 , farming.daysLeft - days);
      await this.update({"system.farming" :farming});
    }
    const item = PersonaDB.getItemById(farming.cropId);
    if (!item) {
      return ["error with advanceCrops Function"];
    }
    if (farming.daysLeft > 0) {
      return [`${farming.amount} ${item.name} will be ready to be harvested in ${farming.daysLeft}`];
    } else {
      return [`${farming.amount} ${item.name} are ready to be harvested`];
    }
  }

  canHarvestCrops() : boolean {
    const farming =this.system.farming;
    if (farming.amount == undefined || farming.daysLeft != 0 || farming.amount <= 0) {
      return false;
    }
    return true;

  }

  canPlantCrops() : boolean {
    const farming =this.system.farming;
    if (!farming.cropId || farming.amount <= 0) {return true;}
    return false;
  }

  async plantCrop(cropId: Consumable["id"], amt: number, timeTillDone: number) {
    if (!this.canPlantCrops()) {
      PersonaError.softFail("Trying to plant when you already have crops growing");
      return;
    }
    const item = PersonaDB.getItemById(cropId) ?? PersonaDB.getItemByName(cropId);
    if (!item || !item.isConsumable()) {
      PersonaError.softFail("Can't find Item or its not a valid one to grow");
      return;
    }
    const newFarmingData = {
      amount : amt,
      cropId : item.id,
      daysLeft : timeTillDone,
    };
    await this.update({"system.farming" :newFarmingData});
    ui.notifications.notify(`seeds for ${amt} ${item.name} will grow in ${timeTillDone} days`);
  }

}
