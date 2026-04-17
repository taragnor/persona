import {UsableUsePanel} from "./usable-use-panel.js";

export class SkillAndItemUsePanels extends UsableUsePanel {

  constructor (actor: PC | NPCAlly, filter ?: (x: Usable) => boolean) {
    const usablesFn = () => this.actor.powers && this.actor.trueConsumables;
    super(actor, usablesFn, filter);
  }

}

