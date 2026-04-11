import {PersonaActorSheetBase} from "../actor/sheets/actor-sheet.base.js";
import {CombatEngine} from "../combat/combat-engine.js";
import {PToken} from "../combat/persona-combat.js";
import {PersonaTargetting} from "../combat/persona-targetting.js";
import {PersonaDB} from "../persona-db.js";
import { SidePanel } from "../side-panel/side-panel.js";
import {lockObject} from "../utility/anti-loop.js";

export abstract class PersonaPanel extends SidePanel {

  static itemPanel: (actor: PC | NPCAlly) => PersonaPanel;
  static powerSelectionPanel: (user: ValidAttackers, power: Usable) => PersonaPanel;

  protected async _useItemOrPower(user: ValidAttackers, power : UsableAndCard, targets ?: PToken[]) {
    if (!user) {return;}
    const selection = targets ? targets : PersonaTargetting.targettedPTokens() ;
    if (selection.length != 1 && power.requiresTargetSelection()) {
      await this.push(PersonaPanel.powerSelectionPanel(user, power as Usable));
      return;
    }
    await lockObject(this,
      async () => await CombatEngine.usePower(user, power, power.requiresTargetSelection() ? targets : []),
      {
        timeoutMs: 5000,
        inUseMsg: "Already Using a power",
      }
    );
  }

  protected async _openInventoryPanel(user:PC | NPCAlly) {
    // await this.push(new ItemUsePanel(user));
    await this.push(PersonaPanel.itemPanel(user));
  }

}

export abstract class SubPanel extends PersonaPanel {

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

