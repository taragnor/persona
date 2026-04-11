import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {PersonaSocial} from "../social/persona-social.js";
import {PersonaPanel, SubPanel} from "./sub-panel.js";

export class DowntimePanel extends PersonaPanel {
  actor: U<PC> = undefined;
  static instance = new DowntimePanel();

  constructor () {
    super("downtime-panel");
  }

  async setActor(actor: PC) {
    if (this.actor != actor) {
      this.actor = actor;
      //not ready yet
      // await this.activate();
    }
  }

  override get templatePath(): string {
    return "systems/persona/sheets/panels/downtime-panel.hbs";
  }

  protected override buttonConfig() : SidePanel.ButtonConfig[] {
    if (this.actor == undefined) {return [];}
    const actor = this.actor;
    return [
      {
        label: "Social Links",
        onPress: () => this._onSocialLinkButton(),
        enabled: () => PersonaSocial.hasMainSocialAction(actor),
        visible: () => true,
      }, {
        label: "Jobs",
        onPress: () => this._onActivities("job"),
        enabled: () => PersonaSocial.hasMainSocialAction(actor),
        visible: () => true,
      }, {
        label: "Training",
        onPress: () => this._onActivities("training"),
        enabled: () => PersonaSocial.hasMainSocialAction(actor),
        visible: () => true,
      }, {
        label: "Recovery",
        onPress: () => this._onActivities("recovery"),
        enabled: () => PersonaSocial.hasMainSocialAction(actor),
        visible: () => true,
      }, {
        label: "Other",
        onPress: () => this._onActivities("other"),
        enabled: () => PersonaSocial.hasMainSocialAction(actor),
        visible: () => true,
      }, {
        label: "Minor Actor",
        onPress: () => this._onActivities("minor"),
        enabled: () => PersonaSocial.hasMinorSocialAction(actor),
        visible: () => true,
      }, {
        label: "Item",
        onPress: () => this._openInventoryPanel(actor),
        enabled: () => true,
        visible: () => true,
      }
    ];
  }
  override async getData() {
    return {
      ...await super.getData(),
      actor: this.actor,
    };
  }

  override activateListeners(html: JQuery) {
    super.activateListeners(html);
  }

  async _onSocialLinkButton() {
    if (!this.actor) {return null;}
    const list = this.actor.socialLinks
      .map( x=> x.actor);
    await this.push(new MainActivityPanel(this.actor, list));
  }

  async _onActivities(type : SocialCard["system"]["cardType"]) {
    if (!this.actor) {return null;}
    const jobs = PersonaSocial.availableActivities()
      .filter( act => act.system.cardType == type);
    await this.push(new MainActivityPanel(this.actor, jobs));
  }

}

class MainActivityPanel extends SubPanel {
  list : (SocialLink | Activity) [] = [];
  actor: PC;

  override get templatePath(): string {
    return "systems/persona/sheets/panels/social-activity-list-panel.hbs";
  }

  constructor (actor: PC, list: (SocialLink | Activity)[]) {
    super("main-activity-panel");
    this.actor = actor;
    this.list = list;
  }

  override async getData() {
    return {
      ...await super.getData(),
      actor: this.actor,
      list: this.list,
    };
  }
}

Hooks.on("controlToken", async (token : Token<PersonaActor>, selected: boolean) => {
  if (!selected) {
    return;
  }
  const actor = token?.document?.actor;
  if (!actor || !actor.isOwner) {return;}
  const combat = PersonaCombat.combat;
  // if (PersonaSettings.debugMode() && actor?.isRealPC()) {
  //   await DowntimePanel.instance.setActor(actor);
  // }
  if (!combat || !combat.isSocial) {return;}
  if (actor.isRealPC()) {
    await DowntimePanel.instance.setActor(actor);
  }
});

Hooks.on("updateActor", async (actor) => {
  if (DowntimePanel.instance.actor == actor) {
    await DowntimePanel.instance.updatePanel();
  }
});

