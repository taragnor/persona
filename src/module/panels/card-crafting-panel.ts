import {PersonaDB} from "../persona-db.js";
import {CraftingPanel, CraftingRecipe} from "./crafting-panel.js";
import { SidePanel } from "../side-panel/side-panel.js";
import {ItemSpecifier} from "../item/universal-crafting-inventory.js";
import { PersonaItem } from "../item/persona-item.js";
import {PersonaError} from "../persona-error.js";

export class CardCraftingPanel extends CraftingPanel {

  static panel : CraftingPanel = new CardCraftingPanel();

  static async open(actor: PC, openingPanel : N<SidePanel>) {
    this.panel.setActor(actor);
    if (openingPanel) {
      await openingPanel.push(this.panel);
    } else {
      await this.panel.activate();
    }
  }

  override craftingRecipes() : CraftingRecipe<Power>[] {
    const craftables = PersonaDB.allPowersArr()
      .filter (item => item.system.craftingRecipes
        && item.system.craftingRecipes.length > 0) ;
    const recipes = craftables
      .flatMap (item=> this.convertToRecipes(item));
    return recipes;
  }

  async produceProduct(product: ItemSpecifier<Power>): Promise<void> {
    const powerAcc = product.item.accessor;
    const power = PersonaDB.findItem(powerAcc);
    const card = await PersonaItem.createSkillCardFromPower(power);
    for (let i = 0 ; i< product.amount; ++i) {
      await this.actor.addItem(card);
    }
    await card.delete();
  }

  override productSpecifierToString(spec: ItemSpecifier<Power>) : string {
    const item = spec.item;
    if (!item) {throw  new PersonaError("Can't find crafting item ${spec.item}");}
    const amt = spec.amount > 1 ? ` (${spec.amount})` : "";
    return `${item.name}${amt} Velvet Card`;
  }

  //could change this to await with a better tooltip
  override tooltipDescription(_product: ItemSpecifier<Power>): string {
    return "";
  }

}
