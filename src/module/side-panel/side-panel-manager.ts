import { SidePanel } from "./side-panel.js";

export class SidePanelManager {
  private static buttons : SidePanel.ButtonConfig[] = [];
  private static  HTMLPanel: U<JQuery<HTMLElement>>;
  private static _activePanel : U<SidePanel>;

  static clearPanel() : void {
    const infoPanel = this.panel;
    if (infoPanel.length) {
      infoPanel.remove();
    }
    this.HTMLPanel = undefined;
    if (this.buttons.length > 0) {
      this.buttons = [];
    }

  }

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

  static async deactivate(panel: SidePanel) {
    if (this._activePanel != panel) {return;}
    await this._activePanel.onDeactivate();
    this._activePanel = undefined;
  }

  static async activate(panel: SidePanel) {
    await panel.waitUntilReady();
    if (!this.doesPanelExist()) {
      this.createContainer();
    }
    if (this._activePanel && panel != this._activePanel) {
      await this.deactivate(this._activePanel);
    }
    this._activePanel = panel;
    await this.renderPanel(panel);
  }

  private static verifyValidState() : JQuery<HTMLElement>{
    if (!this._activePanel) {
      throw new Error("No active panel to render");
    }
    const panel = this.HTMLPanel;
    if (!panel) {
      throw new Error(`Can't find side panel for ${this._activePanel.panelName}: This shoudl be impossible`);
    }
    return panel;
  }

  static async renderPanel(sidePanel: SidePanel) {
    if (this._activePanel != sidePanel) {
      if (sidePanel.autoActivateOnUpdate == false) {
      console.log(`Can't render ${sidePanel.panelName}: it's not active`);
      return;
      }
      await this.activate(sidePanel);
    }
    const panel = this.verifyValidState();
    panel.empty();
    const html = await this._activePanel!.renderHTML();
    panel.html(html);
    this._activePanel?._activateListeners(panel);
  }

  // private static _activateButtonListeners(html: JQuery<HTMLElement>) {
  //   html.find(".side-panel-button").on("click", ev => this._onPressButton(ev));
  // }

  // private static _onPressButton(ev: JQuery.ClickEvent) {
  //   const index = HTMLTools.getClosestDataNumber(ev, "buttonIndex");
  //   const button = this.buttons[index];
  //   if (!button) {
  //     throw new Error(`No Button Data at index ${index}`);
  //   }
  //   button.onPress();
  // }

  // private static async _renderButtons() : Promise<string> {
  //   const buttonData = await this.resolveButtonData();
  //   const buttonHTML = buttonData
  //   .map( (button, i) =>
  //     `<button class='side-panel-button ${button.cssClasses.join(" ")} data-button-index="${i}" ${button.enabled ? "" : "disabled"}'
  //     ${button.label}
  //     </button>
  //     `
  //   );
  //   return `
  //   <div class="side-panel-buttons">
  //   ${buttonHTML.join("")}
  // </div>
  // `;
  // }

  // private static async resolveButtonData() : Promise<SidePanel.ResolvedButtonData[]> {
  //   const ret : SidePanel.ResolvedButtonData[] = [];
  //   for (const button of this.buttons) {
  //     let label :string;
  //     try {
  //       const InnerLabel = await this.resolveButtonDataVal(button.label);
  //       label = InnerLabel;
  //     } catch (e) {
  //       ui.notifications.error("Error on Trying to resolve SidePanel Button Label");
  //       console.error(e);
  //       label = "ERROR";
  //     }
  //     let enabled :boolean;
  //     try {
  //       const InnerEnabled = button.enabled != undefined ? await this.resolveButtonDataVal(button.enabled) : true;
  //       enabled = InnerEnabled;
  //     } catch (e) {
  //       ui.notifications.error("Error on Trying to resolve SidePanel Button Enabled ${label}");
  //       console.error(e);
  //       enabled = false;
  //     }
  //     const cssClasses : string[] = [];
  //     for (const cl of button.cssClasses ?? []) {
  //       try {
  //         const res = await this.resolveButtonDataVal(cl);
  //         cssClasses.push(res);
  //       } catch (e) {
  //         ui.notifications.error("Error on Trying to resolve SidePanel Button Data");
  //         console.error(e);
  //       }
  //     }
  //     ret.push( {
  //       enabled,
  //       label,
  //       onPress: button.onPress,
  //       cssClasses,
  //     });
  //   }
  //   return ret;
  // }

  private static createContainer() : typeof SidePanelManager["HTMLPanel"] {
    // console.log("Creating Container");
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

  // private static async resolveButtonDataVal<T>(ValOrFunction : SidePanel.ValOrFunctional<T>) : Promise<T> {
  //   if (typeof ValOrFunction ==  "function") {
  //     return await (ValOrFunction as () => Promise<T>)();
  //   }
  //   return ValOrFunction;
  // }

}

declare global {
  namespace SidePanel {
    interface ButtonConfig {
      label: ValOrFunctional<string>;
      enabled ?: ValOrFunctional<boolean>;
      onPress : () => unknown;
      cssClasses ?: ValOrFunctional<string>[];
      visible ?: ValOrFunctional<boolean>;
    }

    interface ResolvedButtonData {
      label: string,
        enabled: boolean,
        index: number,
        // onPress: () => unknown,
        cssClasses : string[],
    }

    type ValOrFunctional<T> = T | (() => T) | (() => Promise<T>);
  }

}


