import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaError} from "../persona-error.js";
import {PersonaItem} from "./persona-item.js";

export class UniversalCraftingInventory {

  private _itemList : OwnedCraftingMaterial[];
  private _sortedMap: Map<PersonaItem["id"], OwnedCraftingMaterial[]>;


  constructor() {
    this._itemList = this.getUnifiedCraftingInventory();
    this._sortedMap = this.generateSortedItemList();
  }

  getUnifiedCraftingInventory ()  :OwnedCraftingMaterial[] {
    const unifiedInventory : OwnedCraftingMaterial[] = game.actors.contents
      .filter( (actor : PersonaActor)=> actor.isPC() || actor.isNPCAlly())
      .filter (actor=> actor.isOwner)
      .flatMap( actor => actor.items
        .filter (item => item.isCraftingMaterial())
        .filter(item => item.isCarryableType())
        .map( item => ({
          owner: actor,
          item: item,
          amount: item.amount,
        }))
      );
    return unifiedInventory;
  }

  get sortedItemList() : Map<PersonaItem["id"], OwnedCraftingMaterial[]> {
    return this._sortedMap;
  }

  generateSortedItemList() : Map<PersonaItem["id"], OwnedCraftingMaterial[]> {
    const map: Map<PersonaItem["id"], OwnedCraftingMaterial[]> = new Map();
    this._itemList.forEach( data => {
      const id = data.item.itemBase.id;
      const entry = map.get(id);
      if (!entry) {
        map.set(id, [data]);
        return;
      }
      entry.push(data);
    });
    return map;
  }

  hasItems (spec: ItemSpecifier[]) : boolean;
  hasItems (spec: ItemSpecifier) : boolean;
  hasItems (spec: ItemSpecifier[] | ItemSpecifier) : boolean {
    if (!Array.isArray(spec)) {
      spec = [spec];
    }
    return spec.every( itemSpec => this.hasItem(itemSpec));
  }



  private hasItem(spec: ItemSpecifier) :boolean {
    const entry = this.sortedItemList.get(spec.item.itemBase.id);
   if ( entry  == undefined) {return false;}
    const totalAmt  = entry.reduce ( (acc, x) => acc + x.amount, 0);
    return spec.amount <= totalAmt;
  }

  public async expendItems(specs: ItemSpecifier[]) : Promise<void> {
    if (!this.hasItems(specs))  {
      throw new PersonaError("You don't have the needed items");
    }
    for (const spec of specs) {
      await this.expendItem(spec);
    }
  }

  private async expendItem(spec: ItemSpecifier) : Promise<void> {
    let amountRequired= spec.amount;
    const entry = this.sortedItemList.get(spec.item.itemBase.id);
   if ( entry  == undefined) {
     Debug(this);
     throw new PersonaError("Item not present in UnifiedCrafting INventory")
     ;}
    const ownedByMyPC = entry.filter( e =>e.owner.isTrueOwner);
    const ownedByPartyToken = entry.filter( e=> e.owner.isPC() && !e.owner.isRealPC());
    const ownedByOther = entry.filter( e=> !e.owner.isTrueOwner && e.owner.isPCLike());

    for (const group of [ownedByMyPC, ownedByPartyToken, ownedByOther]) {
      if (amountRequired <= 0) {return;}
      for (const element of group) {
        const amtToTake = Math.clamp(amountRequired, 0,element.amount);
        if (!element.owner.isOwner) {
          PersonaError.softFail(`You don't own ${element.owner.name} and thus can't use their items for crafting`);
          continue;
        }
        await element.owner.removeItem(element.item, amtToTake);
        element.amount -= amtToTake;
        amountRequired -= amtToTake;
      }
    }
    if (amountRequired <= 0) {return;}
    throw new PersonaError("Insufficient Components to Craft!");
  }


}


interface OwnedCraftingMaterial extends ItemSpecifier {
  owner: PersonaActor,
}

export interface ItemSpecifier {
  amount: number;
  item: Carryable;
}

