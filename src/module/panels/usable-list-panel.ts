import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {PersonaItem} from "../item/persona-item.js";
import {PersonaError} from "../persona-error.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {SubPanel} from "./sub-panel.js";

export abstract class UsableListPanel extends SubPanel {
  protected actor: PC | NPCAlly;
  protected filter: U<(x: Usable) => boolean>;
  private itemListFn : () => Usable[];

  constructor (actor: PC | NPCAlly, listFn: UsableListPanel["itemListFn"], filter ?: (x: Usable) => boolean) {
    super("item-use-panel");
    this.itemListFn = listFn;
    this.actor = actor;
    this.filter = filter;
  }

  override get templatePath() {
    // return "systems/persona/sheets/panels/item-use-panel.hbs";
    return undefined;
  }

  async onUpdateCombat(_changes : DeepPartial<PersonaCombat>) {
    await this.updatePanel();
  }

  async onUpdateItem( updatedItem: PersonaItem) {
    if (this.itemList().some(listItem=> listItem == updatedItem || listItem.itemBase == updatedItem)
    )  {await this.updatePanel();}
  }

  async onUpdateActor( updatedActor: PersonaActor) {
    if (this.actor == updatedActor) {
      await this.updatePanel();
    }
  }

  override staticHTML() {
    return `<h3>
      ${this.actor.name} Items
      </h3>`;
  }

  private _itemList() : Usable[] {
    return this.itemListFn();
  }

  itemList() : Usable[] {
    const baseList = this._itemList();
    if (!this.filter) {
      return baseList;
    }
    return baseList.filter( this.filter);
  }

  override activateListeners(html : JQuery) {
    super.activateListeners(html);
    // html.find(".inventory-item:not(.faded)").on("click", (ev) => void this._onUseItem(ev));
  }

  protected async _onUseItem(ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    if (!this.actor) {return;}
    const itemId = HTMLTools.getClosestData(ev, "itemId");
    const item = this.actor.items.find(item => item.id == itemId);
    if (!item) {
      throw new PersonaError(`Can't find Item Id:${itemId}`);
    }
    if (!item.isUsableType()) {
      throw new PersonaError(`Can't use this item`);
    }
    await this._useItemOrPower(this.actor, item);
  }

}

