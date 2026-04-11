import {PersonaError} from "../persona-error.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {PersonaPanel, SubPanel} from "./sub-panel.js";

export class ItemUsePanel extends SubPanel {

  private actor: PC | NPCAlly;

  constructor (actor: PC | NPCAlly) {
    super("item-use-panel");
    this.actor = actor;
  }

  override get templatePath(): string {
    return "systems/persona/sheets/panels/item-use-panel.hbs";
  }

  override async getData() {
    return {
      ...await super.getData(),
      persona: this.actor.persona(),
      actor: this.actor,
    };
  }

  override activateListeners(html : JQuery) {
    super.activateListeners(html);
    html.find(".inventory-item:not(.faded)").on("click", (ev) => void this._onUseItem(ev));
  }

  private async _onUseItem(ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    if (!this.actor) {return;}
    const itemId = HTMLTools.getClosestData(ev, "itemId");
    const item = this.actor.items.find(item => item.id == itemId);
    if (!item) {
      throw new PersonaError(`Can't find Item Id:${itemId}`);
    }
    if (!item.isConsumable()) {
      throw new PersonaError(`Can't use this item`);
    }
    await this._useItemOrPower(this.actor, item);
  }


  static init() {
    PersonaPanel.itemPanel = (actor: PC | NPCAlly) => new ItemUsePanel(actor);
  }

}

