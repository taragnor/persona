import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {Metaverse} from "../metaverse.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaSocial} from "../social/persona-social.js";
import {ItemUsePanel} from "./item-use-panel.js";
import {PersonaPanel} from "./sub-panel.js";
import {UsableUsePanel} from "./usable-use-panel.js";

export class DowntimePanel extends PersonaPanel {
  actor: U<PC> = undefined;

  constructor () {
    super("downtime-panel");
  }

  async setActor(actor: PC) {
    if (this.actor != actor && actor.isOwner) {
      this.actor = actor;
      await super.activate();
    }
  }

  override async activate() {
    if (this.actor == undefined && !game.user.isGM && PersonaCombat.combat) {
      const myPC = PersonaCombat.combat.combatants.contents
        .map( comb=> comb.actor)
        .filter( actor => actor != undefined && actor.isPC())
        .find( actor => actor.isOwner);
      if (myPC) {
        await this.setActor(myPC);
      }
    }
    await super.activate();
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
        cssClasses : ["tall-button"]
      }, {
        label: "Jobs",
        onPress: () => this._onActivities("job"),
        enabled: () => PersonaSocial.hasMainSocialAction(actor),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Training",
        onPress: () => this._onActivities("training"),
        enabled: () => PersonaSocial.hasMainSocialAction(actor),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Recovery",
        onPress: () => this._onActivities("recovery"),
        enabled: () => PersonaSocial.hasMainSocialAction(actor),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Other",
        onPress: () => this._onActivities("other"),
        enabled: () => PersonaSocial.hasMainSocialAction(actor),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Minor Action",
        onPress: () => this._onActivities("minor"),
        enabled: () => PersonaSocial.hasMinorSocialAction(actor),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Item",
        onPress: () => this._openInventoryPanel(),
        enabled: () => true,
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "End Turn",
        onPress: () => PersonaCombat.combat?.nextTurn(),
        enabled: () => true,
        visible: () => (PersonaCombat.combat?.combatant?.actor == this.actor) && this.actor != undefined,
        cssClasses : ["tall-button"]

      }
    ];
  }
  override async getData() {
    return {
      ...await super.getData(),
      actor: this.actor,
    };
  }

  async _openInventoryPanel() {
    if (this.actor) {
      await this.push(
        new ItemUsePanel(this.actor, item => this.usableDowntimeItem(item))
      );
    }
  }

  usableDowntimeItem(item: Usable) : boolean {
    if (this.actor == undefined) {return false;}
    return item.canBeUsedInDowntime();
  }

  override activateListeners(html: JQuery) {
    super.activateListeners(html);
  }

  async _onSocialLinkButton() {
    if (!this.actor) {return null;}
    const list = PersonaDB.socialLinks()
    .filter ( sl=> sl != this.actor);
    await this.push(new SocialActivityPanel(this.actor, list, () => false));
  }

  _activityList(type : SocialCard["system"]["cardType"]) : SocialCard[] {
    if (!this.actor) {return [];}
    switch (type) {
      case "minor": {
        const activities = PersonaSocial.availableMinorActionActivities(this.actor)
        .filter( act => act.system.cardType == type);
        return activities;
      }
      default: {
        const activities = PersonaSocial.availableStandardActionActivities(this.actor)
          .filter( act => act.system.cardType == type);
        return activities;
      }
    }
  }

  async _onActivities(type : SocialCard["system"]["cardType"]) {
    const list = this._activityList(type);
    if (list.length == 0 || !this.actor) {
      console.warn("Downtime Panel: No activities or null actor");
      return;
    }
    const filter = type == "minor" ? (usable: Usable) => usable.hasTag(["downtime-minor"], this.actor ?? null) : () => false;
    await this.push(
      new SocialActivityPanel(this.actor, list, filter)
    );
  }

}

class SocialActivityPanel extends UsableUsePanel {
  socialList : (SocialLink | Activity) [] = [];
  declare actor: PC;

  override get templatePath(): string {
    return "systems/persona/sheets/panels/social-activity-panel.hbs";
  }

  constructor (actor: PC, activityList: (SocialLink | Activity)[], powerFilter : (usable: Usable) => boolean) {
    const baseListFn = () => this.actor.powers
    .filter (pwr=> pwr.canBeUsedInDowntime());
    super(actor, baseListFn, powerFilter);
    // this.actor = actor;
    this.socialList = activityList;
  }

  override async getData() {
    return {
      ...await super.getData(),
      actor: this.actor,
      list: this.socialList,
    };
  }

  activityButtons() : SidePanel.ButtonConfig[] {
    const activityButtons =  this.socialList.map( activity => this.activityToButton(activity));
    return [
      ...activityButtons,
    ];
  }

  protected override buttonConfig() : SidePanel.ButtonConfig[] {
    return [
      ...this.activityButtons(),
      ...super.buttonConfig(),
    ];
  }

  private activityLabel(activity : SocialLink | Activity) : string {
    const isNewLink = activity instanceof PersonaActor && this.actor.getSocialSLWith(activity) == 0;
    const progress = this.actor.getSocialLinkProgress(activity.id);
    const tooltip = `Progress Tokens: ${progress}`;
    const name = `<span class="activity-name" title="${tooltip}">${activity.name}</span>`;
    const img = activity.img ? `<img src="${activity.img}">` : "";
    const SL  = activity instanceof PersonaActor
    ? this.actor.getSocialSLWith(activity)
    : 0;
    const star = PersonaSocial.isHighestLinkerWith(this.actor, activity) && SL < 10
      ? `<i title="Highest Link Level" class="fa-solid fa-star gold"></i>`
      : "";
    const SLText = SL > 0 ? `<span class="sl-level"> (SL ${SL}) </span>` : "";
    const newLinkText = isNewLink ? `<span class="new-link">(New Link)</span>` : "";
    return `${star}${img}${name}${SLText}${newLinkText}`;
  }


  private activityToButton(activity: SocialLink | Activity) : SidePanel.ButtonConfig {
    const isNewLink = activity instanceof PersonaActor && this.actor.getSocialSLWith(activity) == 0;
    const meetsLinkConditions : boolean = isNewLink ?
      PersonaSocial.meetsConditionsToStartLink(this.actor, activity)
    : PersonaSocial.isAvailable(activity, this.actor);

    return {
      label: this.activityLabel(activity),
      onPress: () => this.selectActivity(activity),
      enabled: () => meetsLinkConditions && PersonaSocial.turnCheck(this.actor),
      visible: () => PersonaSocial.isVisible(activity, this.actor),
      cssClasses : ["tall-button"],
    } satisfies SidePanel.ButtonConfig;
  }

  private async selectActivity(activity: SocialLink | Activity) {
    await PersonaSocial.chooseActivity(this.actor, activity);
    await this.pop();
  }
}

Hooks.on("controlToken", async (token : Token<PersonaActor>, selected: boolean) => {
  if (Metaverse.getPhase() != "downtime") {return;}
  if (!selected) {
    return;
  }
  const actor = token?.document?.actor;
  if (!actor || !actor.isOwner) {return;}
  if (actor.isRealPC()) {
    await PersonaSocial.panel.setActor(actor);
    await PersonaSocial.panel.activate();
  }
});

Hooks.on("updateActor", async (actor) => {
  const panel = PersonaSocial.panel;
  if (panel.actor == actor) {
    await panel.updatePanel();
  }
});

Hooks.on("deleteCombat", (_combat) => {
  const panel = PersonaSocial.panel;
  void panel.deactivate();
});

Hooks.on("DBLoaded", async () => {
  if (Metaverse.getPhase() == "downtime") {
    await PersonaSocial.panel.activate();
  }
});

