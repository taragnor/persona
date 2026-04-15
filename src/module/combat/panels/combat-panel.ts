import {PersonaSettings} from "../../../config/persona-settings.js";
import {PersonaActor} from "../../actor/persona-actor.js";
import {PersonaActorSheetBase} from "../../actor/sheets/actor-sheet.base.js";
import {PersonaSwitchPanel} from "../../panels/persona-switch-panel.js";
import {PersonaPanel} from "../../panels/sub-panel.js";
import {PersonaDB} from "../../persona-db.js";
import {PersonaError} from "../../persona-error.js";
import {HTMLTools} from "../../utility/HTMLTools.js";
import {OpenerOption} from "../openers.js";
import {PersonaCombat, PersonaCombatant, PToken} from "../persona-combat.js";

export class CombatPanel extends PersonaPanel {
  private _target: U<PToken>;
  static _instance: U<CombatPanel>;
  private _openers: OpenerOption[] = [];
  mode: "main" | "tactical" | "opener";
  tacticalTarget: U<PToken>;

  constructor() {
    super ("combat-panel");
    this.mode = "main";
  }

  override get autoActivateOnUpdate(): boolean {
    return true;
  }

  override buttonConfig() : SidePanel.ButtonConfig[] {
    return [
      {
        label: "Tactical",
        onPress: () => this._onTacticalMode(),
      }, {
        label: "Persona",
        onPress: () => this._onPersonaModeSwitchButton(),
        enabled: () => this._target ? this._target.actor.canSwitchPersonas && this._target.isOwner : false,
        visible: () => this._target ? this._target.isOwner && this._target.actor.hasMultiplePersonas: false,
      }, {
        label: "Item",
        onPress: () => this._onInventoryButton(),
        visible: () => this._target ? this._target?.actor.isPCLike() && this._target.isOwner : false,
        enabled: () => this._target ? this._target.actor.canUseConsumables : false,
      }, {
        label: "End Turn",
        onPress: () => this._onSelectEndTurn(),
        visible: () => this._target ? this._target?.isOwner && PersonaCombat.combat != undefined : false,
        enabled: () => PersonaCombat.combat?.combatant?.token == this._target,
      },
    ];

  }

  get combat() : U<PersonaCombat> {
    const combat= PersonaCombat.combat;
    if (combat && !combat.isSocial) {return combat;}
    return undefined;
  }

  get allowGMPCControl () {
    return game.users.filter(user => user.active && !user.isGM).length == 0;
    // return PersonaSettings.debugMode();
  }

  get target() {
    if (this.mode =="tactical") {return this.tacticalTarget ?? this._target;}
    return this._target;
  }

  get actor() : U<ValidAttackers> {
    const actor = this.target?.actor;
    if (actor?.isValidCombatant()) {return actor;}
    return undefined;
  }

  override get templatePath(): string {
    const target = this.mode != "tactical" ? this.target?.actor : this.tacticalTarget?.actor ?? this.target?.actor;
    if (this.mode == "tactical") {
      return this._observerTemplate();
    }
    if (!target) {return "";}
    switch (true) {
      case target.isNPCAlly():
      case target.isPC() && target.isRealPC(): {
        const allowGM = this.allowGMPCControl;
        if (game.user.isGM && !allowGM) { break; }
        if (target.isOwner) {
          return this._controlledTemplate();
        }
        break;
      }
      case target.isShadow(): {
        if (game.user.isGM) {
          return this._controlledTemplate();
        }
        break;
      }
      case target.isPC(): {
        //unreal PC
        return "";
      }
      default:
        target satisfies never;
        throw new PersonaError(`Unknown Template for ${this.panelName}`);
    }
    return this._observerTemplate();
  }

  override activateListeners(html: JQuery) {
    super.activateListeners(html);
    html.find(".active-control-panel .main-power .pretty-power-name").on("click", ev => void this._onClickPower(ev));
    html.find(".active-control-panel button.basic-power").on("click", (ev) => void this._onClickPower(ev));
    html.find(".control-panel .token-name").on("click", ev => void this.openToken(ev));
    // html.find(".control-panel button.inventory-button").on("click", (ev) => void this._onInventoryButton(ev));
    html.find(".control-panel button.return-button").on("click", (ev) => void this._onReturnToMainButton(ev));
    html.find(".active-control-panel .inventory-item:not(.faded)").on("click", (ev) => void this._onUseItem(ev));
    html.find(".control-panel .tacticalMode").on("click", (ev) => void this._onTacticalMode(ev));
    html.find(".control-panel button.persona-switch").on("click", (ev) => void this._onPersonaModeSwitchButton(ev));
    html.find(".control-panel button.persona-name-button").on("click", (ev) => void this._onPersonaSwitchButton(ev));
    html.find(".control-panel button.persona-name-button").on("click", (ev) => void this._onPersonaSwitchButton(ev));
    html.rightclick( (ev) => this._onReturnToMainButton(ev));
    html.find(".control-panel button.no-opener").on("click", (ev) => void this._onReturnToMainButton(ev));
    // html.find(".control-panel button.act-again").on("click", (ev) => void this._onReturnToMainButton(ev));
    html.find(".control-panel .follow-ups .follow-up").on("click", (ev) => void this._onSelectFollowUp(ev));
    html.find(".control-panel .opener-list .option-target").on("click", (ev) => void this._onSelectOpenerTarget(ev));
    html.find(".control-panel .opener-list .simple-action").on("click", (ev) => void this._onSelectSimpleOpener(ev));
    // html.find(".active-control-panel button.end-turn").on("click", (ev) => void this._onSelectEndTurn(ev));
    html.find(".follow-ups button.act-again").on("click", (ev) => void this._onReturnToMainButton(ev));
    if (this.combat) {
      this.combat.followUp.activateListeners(html);
    }
    if ( this.target ) {
      this.target.actor.refreshTheurgyBarStyle();
    }
  }

  async selectCombatantIfNeeded(combatant: PersonaCombatant) : Promise<boolean> {
    if (!combatant.isOwner) {return false;}
    if (game.user.isGM && combatant.hasPlayerOwner && !this.allowGMPCControl) {return false;}
    await this.setTarget(combatant.token);
    return true;
  }

  async setOpeningActionChoices(combatant: PersonaCombatant, openerList: OpenerOption[]) : Promise<void> {
    if (openerList.length == 0) {return;}
    if (!await this.selectCombatantIfNeeded(combatant)) {
      return;
    }
    this._openers = openerList;
    await this.setMode("opener");
    // console.log(`Set opening actions: ${openerList.length}`);
  }

  // async setFollowUpChoices( combatant: PersonaCombatant, followUpList : CombatPanel["_followUps"])  : Promise<void>{
  //   if (followUpList.length == 0) {return;}
  //   if (!await this.selectCombatantIfNeeded(combatant)) {
  //     return;
  //   }
  //   this._followUps = followUpList;
  //   await this.setMode("followUp");
  // }

  async setTacticalTarget(token: UN<PToken>) {
    if (!PersonaSettings.combatPanel()) {return;}
    if (this.tacticalTarget == token) {return;}
    if (token == undefined) {
      this.tacticalTarget = undefined;
      await this.updatePanel();
      return;
    }
    if (!token.actor.isValidCombatant()) {return;}
    this.tacticalTarget = token;
    await this.updatePanel();
  }

  async setTarget(token: UN<PToken>) {
    if (!PersonaSettings.combatPanel()) {return;}
    if (this._target == token) {return;}
    if (token == undefined || !token.actor) {
      this._target = undefined;
      await this.setMode("main");
      return;
    }
    if (token.actor.isPC() && !token.actor.isRealPC()) {
      return;
    }
    this._target = token;
    await this.setMode("main");
    try {
      await this.setTacticalTarget(null);
      await this.updatePanel();
    } catch (e) {
      if (e instanceof Error) {
        PersonaError.softFail(e.message, e);
        return;
      }
    }
  }

  private _controlledTemplate() : string {
    return "systems/persona/other-hbs/combat-panel-control.hbs";
  }

  private _observerTemplate(): string {
    return "systems/persona/other-hbs/combat-panel-obs.hbs";
  }

  override async getData() {
    const data = await super.getData();
    const CONST = PersonaActorSheetBase.CONST();
    const actor = this.target?.actor;
    const persona = actor?.persona();
    const token = this.target;
    if (!this.combat) {return {};}
    const combatant = this.combat?.getCombatantByActor(actor as ValidAttackers);
    let engagedList : PersonaCombatant[] = [];
    if (combatant && PersonaCombat.isPersonaCombatant(combatant))  {
      engagedList = this.combat.getAllEngagedEnemies(combatant);
    }
    return {
      ...data,
      mode: this.mode,
      engagedList,
      CONST,
      target: this.target,
      combatant,
      persona,
      actor,
      token,
      openers: this._openers ?? [],
      // followUps: this._followUps,
    };
  }

  static get instance() : CombatPanel {
    if (!this._instance) {
      this._instance = new CombatPanel();
      this.initHooks();
    }
    return this._instance;
  }

  override prereqs() {
    return [
      () => PersonaDB.isLoaded
    ];
  }

  private async _onInventoryButton() {
    if (this._target && this._target.actor && this._target.actor.canUseConsumables) {
      await this._openInventoryPanel(this._target.actor as PC | NPCAlly);
    }
  }

  override async updatePanel() {
    if (this.combat == undefined) {await this.deactivate(); return;}
    return await super.updatePanel();
  }

  private async _onReturnToMainButton(ev: JQuery.ClickEvent) {
    if (this.mode == "main") {return;}
    ev.stopPropagation();
    await this.setMode("main");
  }

  async setMode( mode: CombatPanel["mode"]) {
    this.mode = mode;
    await this.updatePanel();
  }

  private async _onSelectOpenerTarget(ev: JQuery.ClickEvent) {
    const combat = PersonaCombat.combat;
    if (!combat) {return;}
    const ret = await combat.openers.activateTargettedOpener(ev);
    if (ret) {
      await this.setMode("main");
    }
  }

  private async _onSelectSimpleOpener(ev: JQuery.ClickEvent) {
    const combat = PersonaCombat.combat;
    if (!combat) {return;}
    const ret = await combat.openers.activateGeneralOpener(ev);
    if (ret) {
      await this.setMode("main");
    }
  }

  private async _onSelectEndTurn( _ev ?: JQuery.ClickEvent) {
    if (this._target != this.combat?.combatant?.token) {return;}
    await this.combat?.nextTurn();
  }

  private async _onSelectFollowUp(ev: JQuery.ClickEvent) {
    const combat = PersonaCombat.combat;
    if (!combat) {return;}
    const ret = await combat.followUp.chooseFollowUp(ev);
    if (ret) {
      await this.setMode("main");
    }
  }

  private async _onUseItem(ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    if (!this.actor) {return;}
    const itemId = HTMLTools.getClosestData(ev, "itemId");
    const item = this.actor.items.find(item => item.id == itemId);
    if (!item) {
      throw new PersonaError(`Can't find Item Id:${itemId}`);
    }
    if (!item.isConsumable()) {
      throw new PersonaError(`Can't use this item`);
    }
    await this._useItemOrPower(this.actor, item);
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

  private async _onTacticalMode(ev?: JQuery.ClickEvent) {
    if (ev) { ev.stopPropagation();}
    await this.setMode("tactical");
  }

  private async _onPersonaModeSwitchButton(ev ?: JQuery.ClickEvent) {
    if (ev) {
      ev.stopPropagation();
    }
    if (!this.target) {return;}
    const actor = this.target.actor;
    const currentPersona = actor.persona();
    const filteredPList = actor.personaList
      .filter( p => !p.equals(currentPersona));
    if (filteredPList.length == 1) {
      // if (!this.isActiveControl()) {
      if (!this.actor?.canSwitchPersonas) {
        ui.notifications.notify("Can't swap right now.");
        return;
      }
      await actor.switchPersona(filteredPList.at(0)!.source.id);
      return;
    }

    await this.push(new PersonaSwitchPanel(this.target));
    // await this.setMode("persona");
  }

  private async _onPersonaSwitchButton(event: JQuery.ClickEvent) {
    if (!this.isActiveControl()) {
      ui.notifications.warn("Can't switch personas right now");
      return;
    }
    const personaId = HTMLTools.getClosestData(event, "personaId");
    if (this.target) {
      await this.target.actor.switchPersona(personaId as ValidAttackers["id"]);
    }
  }


  openToken(_ev: JQuery.ClickEvent) {
    this.actor?.sheet.render(true);
  }

  isActiveControl() : boolean {
    const combat = PersonaCombat.combat;
    if (!combat || combat.isSocial || combat.combatant?.token == undefined) {return false;}
    if (!this.target || !combat.turnCheck(this.target)) {return false;}
    return this.target?.actor?.isOwner ?? false;
    //TODO: may want to check that target is combatant in battle
  }

  static isActiveControl() : boolean {
    return this.instance.isActiveControl();
  }

  static init() {
    if (!this.instance) {
      //this getter initializes the hooks
      throw new Error("Can't initialize instance of Combat Panel");
    }
  }

  private static initHooks() {
    Hooks.on("controlToken", async (token : Token<PersonaActor>, selected: boolean) => {
      if (!selected) {
        await this.instance.setTarget(null);
        return;}
      const actor = token?.document?.actor;
      const combat = game.combat as U<PersonaCombat>;
      if (!combat || combat.isSocial) {return;}
      if (!actor) {return;}
      if (actor.isValidCombatant()) {
        await this.instance.setTarget(token.document as PToken);
      }
    });

    Hooks.on("deleteCombat", (_combat) => {
      void this.instance.deactivate();
    });

    Hooks.on("canvasInit", () => {
      void this.instance.setTarget(null);
    });

    Hooks.on("updateActor", (actor) => {
      if (this.instance.target?.actor == actor) {
        void this.instance.updatePanel();
      }
    });

    Hooks.on("refreshToken", (token) => {
      if (this.instance.target == token.document) {
        void this.instance.updatePanel();
      }
    });

    Hooks.on("updateToken", (token) => {
      if (this.instance.target == token) {
        void this.instance.updatePanel();
      }
    });

    Hooks.on("updateCombat", () => {
      void this.instance.updatePanel();
    });

    Hooks.on("hoverToken", (token, isSelecting) => {
      if (this.instance.mode != "tactical") {return;}
      const panel = this.instance;
      if (isSelecting) {
        void panel.setTacticalTarget(token.document as PToken);
      } else {
        void panel.setTacticalTarget(null);
      }

    });

  }

}


