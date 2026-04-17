import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaCombat, PToken} from "../combat/persona-combat.js";
import {PersonaTargetting} from "../combat/persona-targetting.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {SubPanel} from "./sub-panel.js";

export class PowerTargetSelectionPanel extends SubPanel {
  power: Usable;
  actor: ValidAttackers;

  override get templatePath(): string {
    return "systems/persona/sheets/panels/target-selection-panel.hbs";
  }

  constructor (actor: ValidAttackers, power: Usable) {
    super( "exploration-power-panel");
    this.actor = actor;
    this.power = power;
  }

  override activateListeners(html: JQuery) {
    super.activateListeners(html);
    html.find("button.target").on("click", ev => void this._onTargetSelect(ev));
  }


  targetList() :readonly (ValidAttackers | PToken)[] {
    return this._targetList()
      .filter( t=>
        this.power.targetMeetsConditions(this.actor, t instanceof TokenDocument ? t.actor : t)
      );
  }

  private _targetList() : readonly (ValidAttackers | PToken)[] {
    const combat = PersonaCombat.combat;
    if (!combat) {
      return PersonaDB.activePCParty();
    }
    return combat.combatants.contents
      .map( c => c.token)
      .filter( t => t.actor != undefined && t.actor.isValidCombatant()) as PToken[] ;
  }

  override async getData() {
    return {
      ...await super.getData(),
      persona: this.actor.persona(),
      power: this.power,
      targets: this.targetList(),
    };
  }

  async _onTargetSelect(event: JQuery.ClickEvent) {
    const targetId = HTMLTools.getClosestData(event, "targetId");
    let target = this.targetList().find(target => target.id == targetId);
    if (!target) {
      PersonaError.softFail(`Weird error occured, can't find Id ${targetId}`);
      return;
    }
    if (target instanceof PersonaActor) {
      target = PersonaTargetting.getToken(target);
    }
    event.stopPropagation();
    await this._useItemOrPower(this.actor, this.power, [target]);
    await this.pop();
  }

}

