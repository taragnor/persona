import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaScene} from "../persona-scene.js";
import {HTMLTools} from "../utility/HTMLTools.js";

export class TreasureList extends Application {
  static #instance : U<TreasureList>;

  range= {low: 1, high: 100};

  static init() {
    this.#instance = new TreasureList();
  }

  static get instance(): U<TreasureList> {
    return this.#instance;
  }

  override async getData(options: Record<string, unknown>) {
    await PersonaDB.waitUntilLoaded();
    const data = await super.getData(options);
    const lists : Record<keyof TreasureItem["system"]["treasure"], TreasureItem[]> = {
      trinkets: this.genCategory("trinkets"),
      lesser: this.genCategory("lesser"),
      greater: this.genCategory("greater"),
      royal:this.genCategory("royal"),
    };
    const treasureLists = Object.entries(lists)
      .map( ([k,v]) => ({
        category: k,
        list:v,
      }));
    return {
      ...data,
      treasureLists,
    };
  }

  genCategory(key: keyof TreasureItem["system"]["treasure"]) : TreasureItem[] {
    const treasures = PersonaDB.treasureItems();
    return treasures.filter( treasure => {
      const data = treasure.system.treasure[key];
      if (!data.enabled) {return false;}
      if (data.maxLevel < this.range.low
        || data.minLevel > this.range.high) {return false;}
      return true;
    });
  }

  static override get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "treasure-list-printer",
      template: "systems/persona/sheets/lists/treasure-printout.hbs",
      width: 1500,
      height: 1200,
      minimizable: true,
      resizable: true,
      title: game.i18n.localize("persona.applications.treasurePrinter" as LocalizationString),
    });
  }


  override activateListeners(html: JQuery) {
    super.activateListeners(html);
    html.find(".treasure-name").on("click", ev => void this.openTreasure(ev));
  }

  setRange(min: number, max:number) {
    this.range.low = min;
    this.range.high = max;
  }

  static async open(min: number = -999, max: number =100): Promise<TreasureList> {
    if (!game.user.isGM) {
      throw new PersonaError("Only GM can open Treasure List");
    }
    await PersonaDB.waitUntilLoaded();
    if (!this.#instance) {
      this.#instance = new TreasureList();
    }
    if( min == -999) {
      const scene = game.scenes.current as PersonaScene;
      const tl = scene.treasureLevel;
      if (tl > 0) {
        min = tl; max = tl;
      }
    }
    this.#instance.setRange(min, max);
    this.#instance.render(true);
    return this.#instance;
  }

  openTreasure(ev: JQuery.ClickEvent) {
    this.fetchTreasure(ev).sheet.render(true);
  }

  fetchTreasure(event: JQuery.Event): TreasureItem {
    const treasureId = HTMLTools.getClosestData<TreasureItem["id"]>(event, "treasureId");
    if (treasureId == undefined) {
      throw new PersonaError(`Can't find treasure Id`);
    }
    const treasure = PersonaDB.getItemById(treasureId);
    if (!treasure || !treasure.isCarryableType()) {
      throw new PersonaError(`Can't find power id ${treasureId}`);
    }
    return treasure;
  }

  static refreshInstance() {
    if (this.#instance) {
      this.#instance.render(false);
    }
  }


}

Hooks.on("DBrefresh", function () {
  const instance = TreasureList.instance;
  if (instance && instance._state >= 2) {
    instance.render(false);
  }
});

Hooks.on("updateItem", function (item) {
  if (item.parent == undefined) {
    TreasureList.refreshInstance();
  }

});

//@ts-expect-error adding to global scope
window.treasureList = TreasureList;

