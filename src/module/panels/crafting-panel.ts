import {ItemSpecifier, UniversalCraftingInventory} from "../item/universal-crafting-inventory.js";
import {Metaverse} from "../metaverse.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {SubPanel} from "./sub-panel.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {PersonaCompendium} from "../persona-compendium.js";
import {PersonaItem} from "../item/persona-item.js";

export abstract class CraftingPanel extends SubPanel {

  actor: PC;
  private cachedData = {
    _inventory: undefined as U<UniversalCraftingInventory>
  };

  constructor() {
    super ("crafting-panel");
  }

  override get templatePath(): U<string> {
    return "systems/persona/sheets/panels/crafting-panel.hbs";
  }

  clearCache() {
    this.cachedData = {
      _inventory: undefined,
    };
  }

  abstract craftingRecipes() : CraftingRecipe<PersonaItem>[] ;

  override buttonConfig() : SidePanel.ButtonConfig[] {
    this.clearCache();
    if (!this.actor.isOwner) {return super.buttonConfig();}
    const buttons = this.craftingRecipes()
      .map (recipe => this.craftingRecipeToButton(recipe))
      .sort((a, b) => (a.label as string).localeCompare(b.label as string))
      .sort (( a,b) => a.enabled == b.enabled ? 0 : a.enabled ? -1 : b.enabled ? 1 : 0);
    return [
      ...buttons,
      ...super.buttonConfig(),
    ];
  }

  private craftingRecipeToButton(recipe: CraftingRecipe): SidePanel.ButtonConfig {
    try {
      const label = recipe.products
        .map (prod => this.productSpecifierToString(prod))
        .join( ", ");
      return {
        label:  `${label}`,
        onPress : () => this.craftRecipe(recipe),
        enabled : this.canCraftRecipe(recipe),
        cssClasses: ["crafting-button"],
        tooltip: this.generateTooltip(recipe),
      };
    } catch (e) {
      PersonaError.softFail(e as Error);
      return {
        label:  `ERROR`,
        onPress : () => 0,
        enabled : false,
        "cssClasses": ["error-button"],
      };
    }
  }


  private async craftRecipe(recipe: CraftingRecipe) {
    if (recipe.products.length == 0 || recipe.components.length == 0) {
      Debug(recipe);
      throw new PersonaError("Bugged recipe");
    }
    if (!await HTMLTools.confirmBox("Are you sure?", `Are you sure you want to craft ${recipe.products[0].item.displayedName} `)) {
      return;
    }
    await this.unifiedCraftingInventory().expendItems(recipe.components);
    for (const product of recipe.products) {
      await this.produceProduct(product);
    }
  }

  abstract produceProduct(product: CraftingRecipe["products"][number]): Promise<void>

  private generateTooltip(recipe: CraftingRecipe) : string {
    const components = recipe.components
      .map (comp => `<li>${this.itemSpecifierToString(comp)}</li>`)
      .join( "");
    const base=  `<ul>${components}</ul>`;
    const product = recipe.products[0];
    return `${base}<br>${this.tooltipDescription(product)}`;
  }

  abstract tooltipDescription(product: ItemSpecifier<PersonaItem>) : string;

  protected convertToRecipes<const T extends Power | Carryable>(item: T) : CraftingRecipe<T>[] {
    const products= [{
      item: item,
      amount: 1,
    } ];
    const recipeArr = item.system.craftingRecipes ?? [];
    return recipeArr.map ( recipe => {
      const components = recipe.components.map( comp => {
        const item = PersonaDB.getItemById(comp.itemId);
        if (!item || !item.isCarryableType()) {return undefined;}
        return {
          item,
          amount: comp.amount || 1,
        };
      })
        .filter (x=> x != undefined)
        .sort( (a,b) => a.item.displayedName.localeCompare(b.item.displayedName)) ;
      return {
        products,
        components
      };
    });
  }

  itemSpecifierToString(spec: ItemSpecifier<PersonaItem>) {
    const item = spec.item;
    if (!item) {throw  new PersonaError("Can't find crafting item ${spec.item}");}
    const amt = spec.amount > 1 ? ` (${spec.amount})` : "";
    return `${item.name}${amt}`;
  }

  productSpecifierToString(spec: ItemSpecifier<PersonaItem>) {
    return this.itemSpecifierToString(spec);
  }

  override async getData() {
    return {
      ...await super.getData(),
      actor: this.actor,
    };
  }

  unifiedCraftingInventory ()  : UniversalCraftingInventory {
    if (!this.cachedData._inventory) {
      this.cachedData._inventory =  new UniversalCraftingInventory();
    }
    return this.cachedData._inventory;
  }

  canCraftRecipe(recipe: CraftingRecipe) : boolean {
    const inventory = this.unifiedCraftingInventory();
    return inventory.hasItems(recipe.components);
  }

  setActor(pc: PC) {
    this.actor = pc;
  }


  static allowCrafting() {
    const phase = Metaverse.getPhase();
    switch (phase) {
      case "downtime":  return true;
      case "exploration": return PersonaCompendium.canUseCompendium();
    }
    return false;
  }

}


export interface CraftingRecipe<ItemType extends PersonaItem = PersonaItem> {
  products: ItemSpecifier<ItemType>[];
  components: ItemSpecifier<Carryable>[];
}

