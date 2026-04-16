import {FollowUpActionData} from "../combat/follow-up-actions.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {PersonaPanel} from "./sub-panel.js";


export class FollowUpPanel extends PersonaPanel {

  followUps: FollowUpActionData[];

  constructor(data : FollowUpActionData[] = []) {
    super ("follow-up-panel");
    void this.setFollowUps(data);
  }

  protected override buttonConfig() {
    return [
      {
        label: "Act Again",
        onPress: () => this._noOpener(),
      }
    ];
  }

  async _noOpener() {
    await this.pop();
    this.followUps = [];
    await PersonaCombat.combat?.openers.cleanUpAfterOpener();
  }

  async setFollowUps(data: FollowUpActionData[]) {
    this.followUps = data;
    if (data.length > 0) {
      await this.updatePanel();
    }
  }

  override activateListeners(html: JQuery) {
    super.activateListeners(html);
    // html.find(".act-again").on("click", (ev) => void this._onReturnToMainButton(ev));
    PersonaCombat.combat?.followUp.activateListeners(html);
  }

  override get templatePath(): string {
    return "systems/persona/parts/combat-panel-follow-up-list.hbs";
  }

  override async getData() {
    const data = await super.getData();
    return {
      ...data,
      followUps: this.followUps,
    };
  }

}

