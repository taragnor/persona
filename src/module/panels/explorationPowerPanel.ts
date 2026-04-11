import {CombatEngine} from "../combat/combat-engine.js";
import {PersonaError} from "../persona-error.js";
import {lockObject} from "../utility/anti-loop.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {PowerTargetSelectionPanel} from "./power-target-selection-panel.js";
import {SubPanel} from "./sub-panel.js";

export class ExplorationPowerPanel extends SubPanel {
  actor: ValidAttackers;

  constructor (actor: ValidAttackers) {
    super( "exploration-power-panel");
    this.actor = actor;
  }

  override get templatePath(): string {
    return "systems/persona/sheets/panels/exploration-power-use-panel.hbs";
  }

  override async getData() {
    return {
      ...await super.getData(),
      persona: this.actor.persona(),
    };

  }

  override activateListeners(html: JQuery) {
    super.activateListeners(html);
    html.find("button.basic-power").on("click", (ev) => void this._onClickPower(ev));
    html.find(".main-power .pretty-power-name").on("click", ev => void this._onClickPower(ev));
  }

  private async _onClickPower(ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    if (!this.actor) {return;}
    const powerId = HTMLTools.getClosestData(ev, "powerId");
    const power = this.actor.powers.find(power => power.id == powerId);
    if (!power) {
      throw new PersonaError(`Can't find Power Id:${powerId}`);
    }
    const ptype = power.system.type;
    if (ptype != "power" && ptype != "consumable")
    {throw new PersonaError(`powerId pointed to unsualbe power ${powerId}`);}
    await this._useItemOrPower(this.actor, power);
  }


  // private async _useItemOrPower(power : UsableAndCard) {
  //   if (!this.actor) {return;}
  //   if (power.requiresTargetSelection()) {
  //     await this.push(new PowerTargetSelectionPanel(this.actor, power as Usable));
  //     return;
  //   }
  //   await lockObject(this,
  //     async () => await CombatEngine.usePower(this.actor, power),
  //     {
  //       timeoutMs: 5000,
  //       inUseMsg: "Already Using a power",
  //     }
  //   );
  // }

}

