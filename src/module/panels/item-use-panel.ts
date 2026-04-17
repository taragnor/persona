import {UsableListPanel} from "./usable-list-panel.js";

export class ItemUsePanel extends UsableListPanel {


  constructor (actor: PC | NPCAlly, filter ?: (x: Usable) => boolean) {
    const consumablesFn = () => this.actor.usableConsumables;
    super(actor, consumablesFn, filter);
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

}

