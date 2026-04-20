import {PersonaActorSheetBase} from "../actor/sheets/actor-sheet.base.js";
import {PersonaDB} from "../persona-db.js";
import { SidePanel } from "../side-panel/side-panel.js";


export abstract class PersonaPanel extends SidePanel {

  override prereqs() {
    return [
      ...super.prereqs(),
      () => PersonaDB.isLoaded
    ];
  }

  override async getData() {
    return {
      ...await super.getData(),
      CONST : PersonaActorSheetBase.CONST(),
    };
  }

}

export abstract class SubPanel extends PersonaPanel {

  protected allowRightClickPop() : boolean {
    return true;
  }

  override activateListeners(html : JQuery) {
    super.activateListeners(html);
    if (this.allowRightClickPop()) {
      html.rightclick( (ev) => this._onReturnToMainButton(ev));
    }

  }

  protected async _onReturnToMainButton(ev ?: U<JQuery.Event>) {
    if (ev) {
      ev.stopPropagation();
    }
    await this.pop();
  }

}

