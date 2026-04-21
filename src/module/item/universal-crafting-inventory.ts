import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaItem} from "./persona-item.js";

export class UniversalCraftingInventory {

  itemList : OwnedCraftingMaterial[];

  constructor() {
    this.itemList = this.getUnifiedCraftingInventory();
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

  get sortedItemList() : Map<PersonaItem["id"], OwnedCraftingMaterial[]>
  {
    const map: Map<PersonaItem["id"], OwnedCraftingMaterial[]> = new Map();
    this.itemList.forEach( data => {
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



}


interface OwnedCraftingMaterial extends ItemSpecifier {
  owner: PersonaActor,
}

export interface ItemSpecifier {
  amount: number;
  item: Carryable;
}

