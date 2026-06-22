import {PersonaError} from "../persona-error.js";
import {waitUntilTrue} from "../utility/async-wait.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {SidePanelManager} from "./side-panel-manager.js";

export abstract class SidePanel {
  panelName: string;
  iterations : number = 0;
  private _ready : boolean = false;
  _buttonData : readonly SidePanel.ButtonConfig[] = [];

  protected get CSSClassName() : string {
    return `.${this.panelName} side-panel`;
  }

  protected getButtons() : MaybePromise<SidePanel.ButtonConfig[]> {
    return this.buttonConfig();
  }

  /** designed to be overridden*/
  protected buttonConfig() : MaybePromise<SidePanel.ButtonConfig[]> {
    return [];
  }

  async deactivate() {
    await SidePanelManager.deactivate(this);
  }

  isActive() : boolean {
    return SidePanelManager.isActive(this);
  }

  async pop() {
    if (this.isActive()) {
      return await SidePanelManager.pop();
    }
  }

  async push(panel: SidePanel) {
    return await SidePanelManager.push(panel);
  }

  get autoActivateOnUpdate() : boolean {
    return false;
  }

  //** if conditional activaiton is selected it will only activate if it's not currently active or part of the panel stack
  async activate(conditional: boolean = false) {
    if (!conditional ||
      ( !SidePanelManager.isActive(this) &&
        !SidePanelManager.isOnPanelStack(this))
    ) {
      await SidePanelManager.activate(this);
    }
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

  abstract get templatePath() : U<string>;

  constructor (panelName: string) {
    if (panelName.startsWith(".")) {
      throw new PersonaError(`Can't start Sidepanel name ${panelName} with period.`);
    }
    this.panelName = panelName;
  }

  async onDeactivate() : Promise<void> {

  }

  staticHTML() : Promise<string> | string {
    return "";
  }

  async renderPanelBody() : Promise<string> {
    if (this.templatePath) {
      const templateData = {
        ...await this.getData(),
        _iteration : this.iterations,
      };
      try {
        return await foundry.applications.handlebars.renderTemplate(this.templatePath, templateData);
      } catch (e) {
        if (e instanceof Error) {
          if (!game.user.isGM) {
            return `ERROR: ${e.message}`;
          }
          return `ERROR: ${e.message} \n ${e.stack}`;
        }
        return String(e);
      }
    }
    return await this.staticHTML();
  }

  async renderHTML () : Promise<string>{
    await this.waitUntilReady();
    let html = await this.renderPanelBody();
    const buttons = await this.getButtons();
    if (buttons.length) {
      html += await this._renderButtons();
    }
    this.iterations++;
    return `
    <div class="side-panel-body ${this.panelName}">
    ${html}
    </div>
    `;
  }

  static getInstances< const T extends SidePanel, const G extends ConstructorOf<T> = ConstructorOf<T>>(panelType: G) : T[] {
    return SidePanelManager.getInstances(panelType);
  }

  async updatePanel() {
    await SidePanelManager.renderPanel(this);
  }

  private async _renderButtons() : Promise<string> {
    this._buttonData = await this.getButtons();
    const buttonData = await this.resolveButtonData(this._buttonData);
    const buttonHTML = buttonData
    .map( (button) => {
      const tooltip = button.tooltip
        ? ` <div class="tooltiptext">
      ${button.tooltip}
        </div>`
        : "";
      return `<button class='side-panel-button tooltip ${button.cssClasses.join(" ")}' data-button-index='${button.index}' ${button.enabled ? "" : "disabled"} >
      ${button.label}
      ${tooltip}
      </button>
      `;
    });
    return `
    <div class="side-panel-buttons button-list">
    ${buttonHTML.join("")}
  </div>
  `;
  }

  private _activateButtonListeners(html: JQuery<HTMLElement>) {
    html.find(".side-panel-button").on("click", ev => void this._onPressButton(ev));
  }

  _activateListeners(html: JQuery<HTMLElement>) {
    this._activateButtonListeners(html);
    this.activateListeners(html);
  }

  private async _onPressButton(ev: JQuery.ClickEvent) {
    const index = HTMLTools.getClosestDataNumber(ev, "buttonIndex");
    // const buttons = await this.getButtons();
    const buttons = this._buttonData;
    const button = buttons[index];
    if (!button) {
      throw new Error(`No Button Data at index ${index}`);
    }
    ev.stopPropagation();
    await button.onPress();
  }


  activateListeners(_html: JQuery<HTMLElement>): void {
  }

  getData () : Promise<Record<string, unknown>> | Record<string, unknown> {
    return {};
  }

  private async resolveButtonData(buttons: readonly SidePanel.ButtonConfig[]) : Promise<SidePanel.ResolvedButtonData[]> {
    // const buttons= await this.getButtons();
    const promises = buttons
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
      const tooltip = await this.resolveButtonDataVal(button.tooltip) ?? "";
      return {
        enabled,
        label,
        index: i,
        cssClasses,
        tooltip,
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
      tooltip ?: ValOrFunctional<string>;
    }

    interface ResolvedButtonData {
      label: string;
      enabled: boolean;
      index: number;
      // onPress: () => unknown,
      cssClasses : string[];
      tooltip: string;
    }

    type ValOrFunctional<T> = T | (() => T) | (() => Promise<T>);
  }

}

