import {PersonaError} from "../persona-error.js";
import {waitUntilTrue} from "../utility/async-wait.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {SidePanelManager} from "./side-panel-manager.js";

export abstract class SidePanel {
  panelName: string;
  iterations : number = 0;
  private _ready : boolean = false;

  protected get CSSClassName() : string {
    return `.${this.panelName}`;
  }

  protected get buttons() : SidePanel.ButtonConfig[] {
    return this.buttonConfig();
  }

  /** designed to be overridden*/
  protected buttonConfig() : SidePanel.ButtonConfig[] {
    return [];
  }

  async deactivate() {
    await SidePanelManager.deactivate(this);
  }

  async pop() {
    return await SidePanelManager.pop();
  }

  async push(panel: SidePanel) {
    return await SidePanelManager.push(panel);
  }

  get autoActivateOnUpdate() : boolean {
    return false;
  }

  async activate() {
    await SidePanelManager.activate(this);
  }

  protected prereqs() : (() => boolean)[] {
    return [];
  }

  async waitUntilReady() : Promise<void> {
    if (!this._ready) {
      await this.init();
    }
  }

  async init() {
    for (const prereq of this.prereqs()) {
      await waitUntilTrue(prereq, 100);
    }
    this._ready = true;
  }

  abstract get templatePath() : string;

  constructor (panelName: string) {
    if (panelName.startsWith(".")) {
      throw new PersonaError(`Can't start Sidepanel name ${panelName} with period.`);
    }
    this.panelName = panelName;
  }

  async onDeactivate() : Promise<void> {

  }

  async renderHTML () : Promise<string>{
    await this.waitUntilReady();
    const templateData = {
      ...await this.getData(),
      _iteration : this.iterations,
    };
    this.iterations++;
    if (!this.templatePath) {
      await this.deactivate();
      return "";
    }

    let html = await foundry.applications.handlebars.renderTemplate(this.templatePath, templateData);
    if (this.buttons.length) {
      html  += await this._renderButtons();
    }
    return `
    <div class="${this.panelName}">
    ${html}
    </div>
    `;
  }

  async updatePanel() {
    await SidePanelManager.renderPanel(this);
  }

  private async _renderButtons() : Promise<string> {
    const buttonData = await this.resolveButtonData();
    const buttonHTML = buttonData
    .map( (button) =>
      `<button class='side-panel-button ${button.cssClasses.join(" ")}' data-button-index='${button.index}' ${button.enabled ? "" : "disabled"}>
      ${button.label}
      </button>
      `
    );
    return `
    <div class="side-panel-buttons">
    ${buttonHTML.join("")}
  </div>
  `;
  }

  private _activateButtonListeners(html: JQuery<HTMLElement>) {
    html.find(".side-panel-button").on("click", ev => this._onPressButton(ev));
  }

  _activateListeners(html: JQuery<HTMLElement>) {
    this._activateButtonListeners(html);
    this.activateListeners(html);
  }

  private _onPressButton(ev: JQuery.ClickEvent) {
    const index = HTMLTools.getClosestDataNumber(ev, "buttonIndex");
    const button = this.buttons[index];
    if (!button) {
      throw new Error(`No Button Data at index ${index}`);
    }
    ev.stopPropagation();
    button.onPress();
  }


  activateListeners(_html: JQuery<HTMLElement>): void {
  }

  getData () : Promise<Record<string, unknown>> | Record<string, unknown> {
    return {};
  }

  private async resolveButtonData() : Promise<SidePanel.ResolvedButtonData[]> {
    const promises = this.buttons
    .map( async (button, i) => {
      if (button.visible != undefined) {
        try {
          const visible = await this.resolveButtonDataVal(button.visible);
          if (!visible) {return ;}
        } catch (e) {
          ui.notifications.error("Error on Trying to resolve SidePanel Button Visible status");
          console.error(e);
          return ;
        }
      }
      let label :string;
      try {
        const InnerLabel = await this.resolveButtonDataVal(button.label);
        label = InnerLabel;
      } catch (e) {
        ui.notifications.error("Error on Trying to resolve SidePanel Button Label");
        console.error(e);
        label = "ERROR";
      }
      let enabled :boolean;
      try {
        const InnerEnabled = button.enabled != undefined ? await this.resolveButtonDataVal(button.enabled) : true;
        enabled = InnerEnabled;
      } catch (e) {
        ui.notifications.error("Error on Trying to resolve SidePanel Button Enabled ${label}");
        console.error(e);
        enabled = false;
      }
      const cssClasses : string[] = [];
      for (const cl of button.cssClasses ?? []) {
        try {
          const res = await this.resolveButtonDataVal(cl);
          cssClasses.push(res);
        } catch (e) {
          ui.notifications.error("Error on Trying to resolve SidePanel Button Data");
          console.error(e);
        }
      }
      return {
        enabled,
        label,
        index: i,
        cssClasses,
      };
    });
    const ret = await Promise.all(promises);
    return ret.filter(x => x != undefined);
  }

  private async resolveButtonDataVal<T>(ValOrFunction : SidePanel.ValOrFunctional<T>) : Promise<T> {
    if (typeof ValOrFunction ==  "function") {
      return await (ValOrFunction as () => Promise<T>)();
    }
    return ValOrFunction;
  }

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

