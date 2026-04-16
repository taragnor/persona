import {OpenerOption} from "../combat/openers.js";
import {PersonaCombat, PersonaCombatant} from "../combat/persona-combat.js";
import {PersonaError} from "../persona-error.js";
import {HTMLTools} from "../utility/HTMLTools.js";
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
    html.find(".control-panel .opener-list .option-target").on("click", (ev) => void this._onSelectOpenerTarget(ev));
    html.find(".control-panel .opener-list .simple-action").on("click", (ev) => void this._onSelectSimpleOpener(ev));

  }


  _onSelectSimpleOpener(ev: JQuery.Event) {
    ev.stopPropagation();

  }

  private async _onSelectOpenerTarget(ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    // const combatantId = HTMLTools.getClosestData(ev,'combatantId');
    const combatant = this._combatant;
    const powerId = HTMLTools.getClosestData<Power["id"]>(ev,'powerId');
    const targetId = HTMLTools.getClosestData(ev,'targetId');
    const combat = PersonaCombat.combat;
    if (!combat) {return;}
    const power = combatant.actor.getUsableById(powerId);
    if (!power) { return false; }
    const target = combatant.parent?.combatants.find(c=> c.id == targetId);
    const actionName = $(ev.currentTarget).parents('li.opener-option').find('.option-name').text().trim();
    if (!target || !PersonaCombat.isPersonaCombatant(target)) {
      PersonaError.softFail(`Cant find target Id ${targetId}`);
      return false;
    }
    const ret = await combat.openers.activateTargettedOpener(combatant, power, target, actionName);
    if (ret) {
      await this._onReturnToMainButton(ev);
    }
  }

  override get templatePath(): string {
    return "systems/persona/parts/combat-panel-opener-list.hbs";
  }


}
