import {OpenerOption} from "../combat/openers.js";
import {PersonaCombat, PersonaCombatant} from "../combat/persona-combat.js";
import {SubPanel} from "./sub-panel.js";

export class OpenerPanel extends SubPanel {

  private _openers: readonly OpenerOption[] = [];
  private _combatant: PersonaCombatant;

  constructor () {
    super("opener-panel");
  }

  protected override buttonConfig() {
    return [
      {
        label: "No Opener",
        onPress: () => this._onReturnToMainButton(undefined),
        visible: () => !this._openers.some ( opener=> opener.mandatory),
      }
    ];
  }

  override async updatePanel() {
    if (!this._combatant.isOwner) {
      await this.pop();
      return;
    }
    return super.updatePanel();
  }

  override async getData() {
    return {
      ...await super.getData(),
      openers: this._openers,
      combatant: this._combatant,
    };
  }

  setOpenerList(combatant: PersonaCombatant, list: readonly OpenerOption[]) {
    this._combatant = combatant;
    this._openers = list;
  }

  override activateListeners(html: JQuery) {
    super.activateListeners(html);
    PersonaCombat.combat?.openers.activateListeners(html);

  }

  override get templatePath(): string {
    return "systems/persona/parts/combat-panel-opener-list.hbs";
  }

}
