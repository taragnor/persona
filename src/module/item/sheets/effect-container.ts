import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { PersonaDB } from "../../persona-db.js";
import { PowerStuff } from "../../../config/power-stuff.js";
import {HTMLTools} from "../../utility/HTMLTools.js";

export abstract class PersonaEffectContainerBaseSheet extends PersonaItemSheetBase {
	declare item: PowerContainer | SocialCard;

	static _powerStuffBase?: Record<string, unknown>;

	override async getData() {
		if (this.item.isOwner && this.item.system.type != "socialCard") {
			await (this.item as PowerContainer).sanitizeEffectsData();//required becuase foundry input hates arrays;
		}
		const data = await super.getData();
		const SOCIAL_LINKS = Object.fromEntries(
			PersonaDB.socialLinks().map(actor => [actor.id, actor.name])
		);
		SOCIAL_LINKS[""] = "-";
		data.POWERSTUFF = PersonaEffectContainerBaseSheet.powerStuff;
		return data;
	}

	static get powerStuff(): Record<string, unknown> {
		return PowerStuff.powerStuff();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
    html.find(".add-crafting-recipe").on("click", ev => void this.onAddRecipe(ev));
    html.find(".add-crafting-component").on("click", ev => void this.onAddRecipeComponent(ev));
    html.find(".del-crafting-recipe").on("click", ev => void this.onDeleteRecipe(ev));
    html.find(".del-crafting-component").on("click", ev => void this.onDeleteRecipeComponent(ev));
	}

  private async onAddRecipe(_ev: JQuery.ClickEvent) {
    if (!this.item.isPower() && !this.item.isCarryableType()){ return;}
    await this.item.addCraftingRecipe();
  }

  private async onAddRecipeComponent(ev: JQuery.ClickEvent) {
    if (!this.item.isPower() && !this.item.isCarryableType()){ return;}
    const index= HTMLTools.getClosestDataNumber(ev, "recipeIndex");
    await this.item.addCraftingRecipeComponent(index);
  }

  private async onDeleteRecipe (ev: JQuery.ClickEvent) {
    if (!this.item.isPower() && !this.item.isCarryableType()){ return;}
    if (!await HTMLTools.confirmBox("Confirm", "Are you sure?")) {return;}
    const index= HTMLTools.getClosestDataNumber(ev, "recipeIndex");
    await this.item.deleteCraftingRecipe(index);
  }

  private async onDeleteRecipeComponent (ev: JQuery.ClickEvent) {
    if (!this.item.isPower() && !this.item.isCarryableType()){ return;}
    if (!await HTMLTools.confirmBox("Confirm", "Are you sure?")) {return;}
    const index= HTMLTools.getClosestDataNumber(ev, "recipeIndex");
    const Cindex= HTMLTools.getClosestDataNumber(ev, "componentIndex");
    await this.item.deleteCraftingRecipeComponent(index, Cindex);
  }

}
