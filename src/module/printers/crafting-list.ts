import {PersonaDB} from "../persona-db.js";

export class CraftingPrinter extends Application {

  static init() {

  }

  static _instance: CraftingPrinter;

  override async getData() {
    const data = await super.getData();
    data.craftables = PersonaDB.craftableItems();
    return data;
  }

  static override get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "craftable-list-printer",
      template: "systems/persona/sheets/lists/craftable-printout.hbs",
      width: 1500,
      height: 1200,
      minimizable: true,
      resizable: true,
      title: game.i18n.localize("persona.applications.craftablePrinter" as LocalizationString),
    });
  }

  static async open(): Promise<CraftingPrinter> {
    await PersonaDB.waitUntilLoaded();
    return this.createGeneralizedInstance();
  }

  private static createGeneralizedInstance() {
    if (!this._instance) {
      this._instance = new CraftingPrinter();
    }
    this._instance.render(true);
    return this._instance;
  }

}

async function craftingPrinter() {
  await CraftingPrinter.open();
  return CraftingPrinter._instance;
}

//@ts-expect-error adding to global scope
window.craftingList = craftingPrinter;

