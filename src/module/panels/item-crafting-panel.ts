import {PersonaDB} from "../persona-db.js";
import {CraftingPanel, CraftingRecipe} from "./crafting-panel.js";
import { SidePanel } from "../side-panel/side-panel.js";
import {EnchantedTreasureFormat} from "../exploration/treasure-system.js";
import {ItemSpecifier} from "../item/universal-crafting-inventory.js";

export class ItemCraftingPanel extends CraftingPanel {

  static panel : CraftingPanel = new ItemCraftingPanel();

  static async open(actor: PC, openingPanel : N<SidePanel>) {
    this.panel.setActor(actor);
    if (openingPanel) {
      await openingPanel.push(this.panel);
    } else {
      await this.panel.activate();
    }
  }

  craftingRecipes() : CraftingRecipe<Carryable>[] {
    const craftables = PersonaDB.craftableItems();
    const recipes = craftables
      .flatMap ( item=> this.convertToRecipes(item));
    return recipes;
  }

  async produceProduct(product: ItemSpecifier<Carryable>): Promise<void> {
    const treasureItem :EnchantedTreasureFormat = {
      item: product.item.accessor,
      enchantments: []
    };
    for (let i = 0 ; i< product.amount; ++i) {
      await this.actor.addTreasureItem(treasureItem);
    }
  }

  override tooltipDescription(product: ItemSpecifier<Carryable>) {
    return product.item.description.toString();
  }


}

