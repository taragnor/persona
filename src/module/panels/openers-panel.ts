import {OpenerManager, OpenerOptionGroup} from "../combat/openers.js";
import {PersonaCombat, PersonaCombatant} from "../combat/persona-combat.js";
import {CombatPanel} from "./combat-panel.js";
import {SubPanel} from "./sub-panel.js";

export class OpenerPanel extends SubPanel {

  private _openers: readonly OpenerOptionGroup[] = [];
  private _combatant: PersonaCombatant;

  constructor () {
    super("opener-panel");
  }

  protected override buttonConfig() {
    return [ {
        label: "Tactical View",
        onPress: () => this._tacticalView(),
        visible: () => !OpenerManager.getMandatory(this._openers),
      }, {
        label: "No Opener",
        onPress: () => this._onReturnToMainButton(undefined),
        visible: () => !OpenerManager.getMandatory(this._openers),
      }
    ];
  }

  protected override async _onReturnToMainButton(_ev: U<JQuery.ClickEvent>) {
    await this._combatant.parent.openers.onNoOpenerUsed(this._combatant);
    await super._onReturnToMainButton(undefined);
  }

  protected override allowRightClickPop() : boolean {
    return !OpenerManager.getMandatory(this._openers);
  }

  protected async _tacticalView() {
    await CombatPanel.instance.activate();
    await CombatPanel.instance.setMode("tactical");
    await CombatPanel.instance.setTarget(null);
  }

  override async updatePanel() {
    if (!this._combatant.isOwner ||
    this._combatant != PersonaCombat.combat?.combatant) {
      await this.pop();
      return;
    }
    return super.updatePanel();
  }

  override async getData() {
    return {
      ...await super.getData(),
      groups: this._openers,
      combatant: this._combatant,
    };
  }

  setOpenerList(combatant: PersonaCombatant, list: readonly OpenerOptionGroup[]) {
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
