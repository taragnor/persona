import {HTMLTools} from "../../utility/HTMLTools.js";
import {PersonaEffectContainerBaseSheet} from "./effect-container.js";

export class CarryableSheet extends PersonaEffectContainerBaseSheet {
  declare item: Carryable;

	override async getData() {
		const data = await super.getData();
		return data;
	}

  override activateListeners(html: JQuery<HTMLElement>) {
    super.activateListeners(html);
    html.find(".add-crafting-recipe").on("click", ev => void this.onAddRecipe(ev));
    html.find(".add-crafting-component").on("click", ev => void this.onAddRecipeComponent(ev));
    html.find(".del-crafting-recipe").on("click", ev => void this.onDeleteRecipe(ev));
    html.find(".del-crafting-component").on("click", ev => void this.onDeleteRecipeComponent(ev));

	}

  private async onAddRecipe(_ev: JQuery.ClickEvent) {
    await this.item.addCraftingRecipe();
  }

  private async onAddRecipeComponent(ev: JQuery.ClickEvent) {
    const index= HTMLTools.getClosestDataNumber(ev, "recipeIndex");
    await this.item.addCraftingRecipeComponent(index);
  }

  private async onDeleteRecipe (ev: JQuery.ClickEvent) {
    if (!await HTMLTools.confirmBox("Confirm", "Are you sure?")) {return;}
    const index= HTMLTools.getClosestDataNumber(ev, "recipeIndex");
    await this.item.deleteCraftingRecipe(index);
  }

  private async onDeleteRecipeComponent (ev: JQuery.ClickEvent) {
    if (!await HTMLTools.confirmBox("Confirm", "Are you sure?")) {return;}
    const index= HTMLTools.getClosestDataNumber(ev, "recipeIndex");
    const Cindex= HTMLTools.getClosestDataNumber(ev, "componentIndex");
    await this.item.deleteCraftingRecipeComponent(index, Cindex);
  }

}
