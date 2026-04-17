import {PersonaError} from "../persona-error.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {SubPanel} from "./sub-panel.js";

export class UsableListPanel extends SubPanel {
  protected actor: PC | NPCAlly;
  protected filter: U<(x: Usable) => boolean>;
  private itemListFn : () => Usable[];

  constructor (actor: PC | NPCAlly, listFn: UsableListPanel["itemListFn"], filter ?: (x: Usable) => boolean) {
    super("item-use-panel");
    this.itemListFn = listFn;
    this.actor = actor;
    this.filter = filter;
  }

  override get templatePath(): string {
    return "systems/persona/sheets/panels/item-use-panel.hbs";
  }

  override async getData() {
    return {
      ...await super.getData(),
      persona: this.actor.persona(),
      actor: this.actor,
      itemList: this.itemList(),
    };
  }

  protected override buttonConfig(): SidePanel.ButtonConfig[] {
    return this.itemList()
      .map ( usable => this.usableToButton(usable));
  }

  private usableToButton(usable: Usable) : SidePanel.ButtonConfig {
    const persona = this.actor.persona();
    const button : SidePanel.ButtonConfig = {
      label: this.getButtonLabel(usable),
      onPress: () => this.onUseItem(usable),
      enabled: () => persona.canUsePower(usable),
    };
    return button;
  }


  protected getButtonLabel(usable: Usable) {
    return `${usable.name}`;
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
    html.find(".inventory-item:not(.faded)").on("click", (ev) => void this._onUseItem(ev));
  }

  protected async onUseItem(item: Usable) {
    await this._useItemOrPower(this.actor, item);
  }

  private async _onUseItem(ev: JQuery.ClickEvent) {
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
    await this.onUseItem(item);
  }

}
