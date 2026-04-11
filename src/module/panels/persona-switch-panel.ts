import {PToken} from "../combat/persona-combat.js";
import {PersonaError} from "../persona-error.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {SubPanel} from "./sub-panel.js";

export class PersonaSwitchPanel extends SubPanel {
  private _token: PToken;

  constructor (token: PToken) {
    super("persona-switch-panel");
    if (!token.actor  || !token.actor.isValidCombatant()) {
      throw new PersonaError(`${token.name} is not a valid Token for Persona Switch Panel`);
    }
    this._token = token;
  }

  override get templatePath(): string {
    return "systems/persona/sheets/panels/persona-switch-panel.hbs";
  }

  override async getData() {
    const actor = this._token.actor;
    return {
      ...await super.getData(),
      token: this._token,
      actor: actor,
      persona: actor.persona(),
    };
  }

  override activateListeners(html : JQuery) {
    super.activateListeners(html);
    html.find("button.persona-name-button").on("click", (ev) => void this._onPersonaSwitchButton(ev));
  }

  private async _onPersonaSwitchButton(event: JQuery.ClickEvent) {
    event.stopPropagation();
    if (!game.user.isGM
      && !this._token.actor.canSwitchPersonas) {
      PersonaError.softFail("Can't switch personas now");
    }
    const personaId = HTMLTools.getClosestData(event, "personaId");
    await this._token.actor.switchPersona(personaId as ValidAttackers["id"]);
  }

}
