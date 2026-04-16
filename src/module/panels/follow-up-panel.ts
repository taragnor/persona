import {FollowUpActionData} from "../combat/follow-up-actions.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {SubPanel} from "./sub-panel.js";


export class FollowUpPanel extends SubPanel {

  followUps: FollowUpActionData[];

  constructor(data : FollowUpActionData[] = []) {
    super ("follow-up-panel");
    void this.setFollowUps(data);
  }

  protected override buttonConfig() {
    return [
      {
        label: "Act Again",
        onPress: () => this._onReturnToMainButton(undefined),
      }
    ];
  }

  async setFollowUps(data: FollowUpActionData[]) {
    this.followUps = data;
    await this.updatePanel();
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

