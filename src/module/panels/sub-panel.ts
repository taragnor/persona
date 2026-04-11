import {PersonaActorSheetBase} from "../actor/sheets/actor-sheet.base.js";
import {PersonaDB} from "../persona-db.js";
import { SidePanel } from "../side-panel/side-panel.js";

export abstract class SubPanel extends SidePanel {

  override activateListeners(html : JQuery) {
    super.activateListeners(html);
    html.rightclick( (ev) => this._onReturnToMainButton(ev));
  }

  override prereqs() {
    return [
      () => PersonaDB.isLoaded,
    ];
  }


  private async _onReturnToMainButton(ev: JQuery.ClickEvent) {
    // ev.stopImmediatePropagation();
    ev.stopPropagation();
    await this.pop();
  }


  override async getData() {
    return {
      ...await super.getData(),
      CONST : PersonaActorSheetBase.CONST(),
    };
  }


}
