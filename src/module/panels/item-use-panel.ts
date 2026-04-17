import {UsableUsePanel} from "./usable-use-panel.js";

export class ItemUsePanel extends UsableUsePanel {

  constructor (actor: PC | NPCAlly, filter ?: (x: Usable) => boolean) {
    const consumablesFn = () => this.actor.trueConsumables;
    super(actor, consumablesFn, filter);
  }

}

