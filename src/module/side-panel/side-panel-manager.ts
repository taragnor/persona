import {PersonaSettings} from "../../config/persona-settings.js";
import { SidePanel } from "./side-panel.js";

export class SidePanelManager {
  // private static buttons : SidePanel.ButtonConfig[] = [];
  private static  HTMLPanel: U<JQuery<HTMLElement>>;
  private static _activePanel : U<SidePanel>;
  private static panelStack: SidePanel[] = [];
  private static debugStats :  {
    lastRendered:U < SidePanel>,
    lastTimeRendered : number,
      amountRendered: number,
  }  = {lastRendered: undefined, lastTimeRendered: 0,
    amountRendered: 0};

  static get panel()  {
    const infoPanel = $(document).find(this.CSSClassSelector);
    return infoPanel;
  }

  static doesPanelExist() : boolean {
    if (!this.HTMLPanel) {return false;}
    return this.panel.length > 0;
  }

  static get CSSClassSelector() : string {
    return `.${this.CSSClassName}`;
  }

  static get CSSClassName() : string {
    return `side-panel-main`;
  }

  //works on only concrete and non-abstract classes
  static getInstances<const T extends SidePanel, const G extends ConstructorOf<T> = ConstructorOf<T>>(panelType: G) : T[] {
    return [
      ...this._activePanel instanceof panelType ? [this._activePanel] : [],
      ...this.panelStack.filter ( panel => panel instanceof panelType),
    ] as T[];
  }

  static async deactivate(panel: SidePanel, clearStack = true) {
    if (this._activePanel != panel) {return;}
    await this._activePanel.onDeactivate();
    this._activePanel = undefined;
    this.clearPanel();
    if (clearStack) {
      this.clearPanelStack();
    }
  }

  static isActive(panel: SidePanel) :boolean {
    return this._activePanel == panel;
  }

  static isOnPanelStack(panel: SidePanel) : boolean {
    return this.panelStack.includes(panel);
  }

  static async activate(panel: SidePanel, clearStack = true) {
    await panel.waitUntilReady();
    if (!this.doesPanelExist()) {
      this.createContainer();
    }
    if (this._activePanel && panel != this._activePanel) {
      await this.deactivate(this._activePanel, clearStack);
    }
    this._activePanel = panel;
    await this.renderPanel(panel);
    if (clearStack) {
      this.clearPanelStack();
    }
  }

  static async push(panel: SidePanel) {
    if (this._activePanel) {
      this.panelStack.push(this._activePanel);
    }
    await this.activate(panel, false);
  }

  static async pop() : Promise<U<SidePanel>> {
    const newPanel = this.panelStack.pop();
    if (newPanel) {
      await this.activate(newPanel, false);
    } else {
      if (this._activePanel) {
        await this.deactivate(this._activePanel, true);
      }
      console.warn("Popping empty Panel Stack");
    }
    return newPanel;
  }

  private static clearPanelStack() {
    this.panelStack = [];
  }

  private static verifyValidState() : JQuery<HTMLElement>{
    const panel = this.HTMLPanel;
    if (!panel) {
      throw new Error(`Can't find side panel ${this._activePanel ? this._activePanel.panelName : "undefined"}: This shoudl be impossible`);
    }
    return panel;
  }

  static clearPanel() : JQuery<HTMLElement> {
    const panel = this.verifyValidState();
    panel.empty();
    return panel;
  }


  static debug_resetRenderingStats(panel: SidePanel, time: number) {
    this.debugStats = {
      amountRendered : 1,
      lastRendered : panel,
      lastTimeRendered : time,
    };
  }

  static debug_trackRendering(sidePanel : SidePanel) {
    const time = Date.now();
    const stats = this.debugStats;
    const timeDiff = time - stats.lastTimeRendered;
    if (stats.lastRendered != sidePanel) {
      this.debug_resetRenderingStats(sidePanel, time);
      console.log(`rendering new ${sidePanel?.panelName ?? "No Panel given"}`);
      return;
    }
    if (timeDiff > 750) {
      this.debug_resetRenderingStats(sidePanel, time);
      console.log(`rendering ${sidePanel?.panelName ?? "No Panel given"}`);
      return;
    }
    stats.amountRendered += 1;
    stats.lastTimeRendered =  time;
    if (stats.amountRendered <= 3)  {
      console.log(`rendering ${sidePanel?.panelName ?? "No Panel given"}`);
      return;
    }
    console.warn(`possibly excessive rendering (count: ${stats.amountRendered}) : ${sidePanel?.panelName ?? "No Panel given"}`);
  }

  static debugMode() : boolean {
    return PersonaSettings.debugMode();
  }

  static async renderPanel(sidePanel: SidePanel) {
    await sidePanel.waitUntilReady();
    if (this.debugMode()) {
      this.debug_trackRendering(sidePanel);
    }
    if (this._activePanel != sidePanel ) {
      if (this._activePanel != undefined
        && (
          sidePanel.autoActivateOnUpdate == false
          || this.panelStack.includes(sidePanel)
        )
      ) {
        console.warn(`Can't render ${sidePanel.panelName}: it's not active`);
        return;
      }
      return await this.activate(sidePanel); //this should rerender the panel anyway
    }
    const panel = this.clearPanel();
    if (!this._activePanel) {
      throw new Error("No active panel to render");
    }
    const activePanel = this._activePanel;
    const html = await activePanel.renderHTML();
    const div = `<div class="panel-data ${activePanel.panelName}">
    ${html}
    </div>
    `;
    panel.html(div);
    const panelData = panel.find(".panel-data");
    this._activePanel?._activateListeners(panel.find(".panel-data"));
    Hooks.callAll("renderSidePanel", sidePanel, panelData);

  }

  private static createContainer() : typeof SidePanelManager["HTMLPanel"] {
    const infoPanel = $("<section>").addClass(this.CSSClassName);
    const chatNotifications = $(document).find("#interface #ui-right-column-1 #chat-notifications");
    const chatContainer= $("<div>")
      .addClass("custom-side-panel-chat-container");
    $(document).find("#interface #ui-right-column-1").prepend(chatContainer);
    const chatNotificationsContainer = $("<div>").addClass("chat-notifications-container");
    chatNotificationsContainer.append(chatNotifications);
    chatContainer.append(infoPanel)
      .append(chatNotificationsContainer);
    this.HTMLPanel = infoPanel;
    return this.HTMLPanel;
  }

  static async onPauseChange( _state: boolean) {
    const panel = this._activePanel;
    if (panel) {
      await this.renderPanel(panel);
    }
  }

}

Hooks.on("pauseGame" , (state) => {
  void SidePanelManager.onPauseChange(state);
});

//@ts-expect-error adding to global scope
window.panels  = SidePanelManager;

declare global {
  interface HOOKS {
    "renderSidePanel" : (panel: SidePanel, element: JQuery) => unknown;

  }


}
