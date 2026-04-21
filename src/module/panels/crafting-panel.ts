import {ItemSpecifier, UniversalCraftingInventory} from "../item/universal-crafting-inventory.js";
import {Metaverse} from "../metaverse.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {SubPanel} from "./sub-panel.js";
import { SidePanel } from "../side-panel/side-panel.js";
import {EnchantedTreasureFormat} from "../exploration/treasure-system.js";
import {HTMLTools} from "../utility/HTMLTools.js";

export class CraftingPanel extends SubPanel {

  static panel : CraftingPanel = new CraftingPanel();
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

  craftingRecipes() : CraftingRecipe[] {
    const craftables = PersonaDB.craftableItems();
    const recipes = craftables
      .flatMap (item=> this.convertToRecipes(item));
    return recipes;
  }

  override buttonConfig() : SidePanel.ButtonConfig[] {
    this.clearCache();
    if (!this.actor.isOwner) {return super.buttonConfig();}
    const buttons = this.craftingRecipes()
      .map (recipe => this.craftingRecipeToButton(recipe))
      .sort (( a,b) => a.enabled == b.enabled ? 0 : a.enabled ? -1 : b.enabled ? 1 : 0);
    return [
      ...buttons,
      ...super.buttonConfig(),
    ];
  }

  private craftingRecipeToButton(recipe: CraftingRecipe): SidePanel.ButtonConfig {
    try {
      const label = recipe.products
        .map (prod => this.itemSpecifierToString(prod))
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
    if (!await HTMLTools.confirmBox("Are you sure?", `Are you sure you want to craft ${recipe.products[0].item.displayedName} `)) {
      return;
    }
      Debug(recipe);
      throw new PersonaError("Bugged recipe");
    }
    await this.unifiedCraftingInventory().expendItems(recipe.components);
    for (const product of recipe.products) {
      const treasureItem :EnchantedTreasureFormat = {
        item: product.item.accessor,
        enchantments: []
      };
      for (let i = 0 ; i< product.amount; ++i) {
        await this.actor.addTreasureItem(treasureItem);
      }
    }
  }

  private generateTooltip(recipe: CraftingRecipe) : string {
    const components = recipe.components
      .map (comp => this.itemSpecifierToString(comp))
      .join( ", ");
    const base=  `Requires ${components}`;
    const product = recipe.products[0];
    return `${base}\n${product.item.description.toString()}`;
  }

  private convertToRecipes(item: TreasureItem) : CraftingRecipe[] {
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
      .filter (x=> x != undefined);
      return {
        products,
        components
      };
    });
  }

  itemSpecifierToString(spec: ItemSpecifier) : string {
    const item = spec.item;
    if (!item) {throw  new PersonaError("Can't find crafting item ${spec.item}");}
    const amt = spec.amount > 1 ? ` (${spec.amount})` : "";
    return `${item.name}${amt}`;
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
    return Metaverse.getPhase() == "downtime";
  }

  static async open(actor: PC, openingPanel : N<SidePanel>) {
    this.panel.setActor(actor);
    if (openingPanel) {
      await openingPanel.push(this.panel);
    } else {
      await this.panel.activate();
    }
  }
}


interface CraftingRecipe {
  products: ItemSpecifier[];
  components: ItemSpecifier[];
}
