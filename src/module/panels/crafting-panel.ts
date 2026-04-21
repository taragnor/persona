import {PersonaActor} from "../actor/persona-actor.js";
import {ItemSpecifier, UniversalCraftingInventory} from "../item/universal-crafting-inventory.js";
import {Metaverse} from "../metaverse.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {SubPanel} from "./sub-panel.js";

export class CraftingPanel extends SubPanel {

  static panel : CraftingPanel = new CraftingPanel();
  actor: PC;

  constructor() {
    super ("crafting-panel");
  }

  override get templatePath(): U<string> {
    return "systems/persona/sheets/panels/crafting-panel.hbs";
  }

  craftingRecipes() : CraftingRecipe[] {
    const craftables = PersonaDB.craftableItems();
    const recipes = craftables
      .flatMap (item=> this.convertToRecipes(item));
    return recipes;
  }

  override buttonConfig() : SidePanel.ButtonConfig[] {
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
        onPress : () => 0,
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

  unifiedCraftingInventory ()  :UniversalCraftingInventory {
    return new UniversalCraftingInventory();
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

  static async open(actor: PC) {
    this.panel.setActor(actor);
    await this.panel.activate();
  }
}


interface CraftingRecipe {
  products: ItemSpecifier[];
  components: ItemSpecifier[];
}
