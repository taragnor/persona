import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {Metaverse} from "../metaverse.js";
import {PersonaDB} from "../persona-db.js";
import {SidePanelManager} from "../side-panel/side-panel-manager.js";
import {PersonaCalendar} from "../social/persona-calendar.js";
import {PersonaSocial} from "../social/persona-social.js";
import {CardCraftingPanel} from "./card-crafting-panel.js";
import {ItemCraftingPanel} from "./item-crafting-panel.js";
import {ItemUsePanel} from "./item-use-panel.js";
import {PersonaPanel} from "./sub-panel.js";
import { SidePanel } from "../side-panel/side-panel.js";
import {SocialActivityPanel} from "./social-activity-panel.js";

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
    const NPCAlly = PersonaDB.activePCParty().find( x=> x.isNPCAlly());
    return [
      {
        label: "Social Links",
        onPress: () => this._onSocialLinkButton(),
        enabled: () => actor.social.hasMainSocialAction(),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Jobs",
        onPress: () => this._onActivities("job"),
        enabled: () => actor.social.hasMainSocialAction(),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Training",
        onPress: () => this._onActivities("training"),
        enabled: () => actor.social.hasMainSocialAction(),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Recovery",
        onPress: () => this._onActivities("recovery"),
        enabled: () => actor.social.hasMainSocialAction(),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Other",
        onPress: () => this._onActivities("other"),
        enabled: () => actor.social.hasMainSocialAction(),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Minor Action",
        onPress: () => this._onActivities("minor"),
        enabled: () => actor.social.hasMinorSocialAction(),
        visible: () => true,
        cssClasses : ["tall-button"]
      }, {
        label: "Item (Free Actions & Social FollowUp)",
        onPress: () => this._openInventoryPanel(),
        enabled: () => true,
        visible: () => true,
        cssClasses : ["tall-button"]
      },
      ...DowntimePanel.craftingButtons(this.actor, this),
      // {
        // label: "Crafting",
        // onPress: () => ItemCraftingPanel.open(this.actor!, this),
        // enabled: () => ItemCraftingPanel.allowCrafting(),
        // visible: () => this.actor != undefined,
        // cssClasses : ["tall-button"]
      // }, {
        // label: "Card Crafting",
        // onPress: () => CardCraftingPanel.open(this.actor!, this),
        // enabled: () => CardCraftingPanel.allowCrafting(),
        // visible: () => this.actor != undefined && this.actor.hasVelvetRoomAccess,
        // cssClasses : ["tall-button"]
      // },
      {
        label: `Swap ${NPCAlly?.displayedName ?? "Teammate"}`,
        onPress: () => void Metaverse.chooseAlly(),
        enabled: () => !PersonaCombat.combat || PersonaCombat.combat.isSocial,
      }, {
        label: "End Turn",
        onPress: () => PersonaCombat.combat?.nextTurn(),
        enabled: () => this._outOfActions(),
        visible: () => (PersonaCombat.combat?.combatant?.actor == this.actor) && this.actor != undefined,
        cssClasses : ["tall-button"]
      },

      ...this.GMButtons(),
    ];
  }
  override async getData() {
    return {
      ...await super.getData(),
      doom: PersonaCalendar.DoomsdayClock,
      day: PersonaCalendar.calendar.getDateString(),
      weatherIcon : PersonaCalendar.getWeatherIcon()[0].outerHTML,
      actor: this.actor,
    };
  }

  static craftingButtons(actor: U<PersonaActor>, thisPanel: N<SidePanel>) {
    if (actor == undefined || !actor.isRealPC()) {return [];}
    return [ {
      label: "Crafting",
      onPress: () => ItemCraftingPanel.open(actor, thisPanel),
      enabled: () => ItemCraftingPanel.allowCrafting(),
      visible: () => actor != undefined,
      cssClasses : ["tall-button"]
    },
      {
        label: "Create Cards (Velvet Room)",
        onPress: () => CardCraftingPanel.open(actor, thisPanel),
        enabled: () => CardCraftingPanel.allowCrafting(),
        visible: () => actor != undefined && actor.hasVelvetRoomAccess,
        cssClasses : ["tall-button"]
      } ];
  }

  private GMButtons() : SidePanel.ButtonConfig[] {
    if (!game.user.isGM) {return [];}
    return [
      {
        label: "+1 Minor Action",
        onPress: () => this.actor!.social.alterDowntimeAction("minor", 1),
        enabled: () => true,
        visible: () => this.actor != undefined,
        cssClasses : ["tall-button"]
      }, {
        label: "+1 Std Action",
        onPress: () => this.actor!.social.alterDowntimeAction("standard", 1),
        enabled: () => true,
        visible: () => this.actor != undefined,
        cssClasses : ["tall-button"]
      }
    ];

  }

  _outOfActions() : boolean {
    if (!this.actor) {return false;}
    return !this.actor.social.hasMainSocialAction()
      && !this.actor.social.hasMinorSocialAction()
      && !game.user.isGM;
  }

  async _openInventoryPanel() {
    if (!this.actor) {return;}
    const actor = this.actor;
    await this.push(
      new ItemUsePanel(this.actor, item => this.usableDowntimeItem(item) && item.hasTag("downtime", actor))
    );
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

Hooks.on("personaCalendarAdvance", () => {
  SidePanelManager.refreshAllInstancesOf(DowntimePanel);
});

