import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {PersonaItem} from "../item/persona-item.js";
import {Persona} from "../persona-class.js";
import {UsableListPanel} from "./usable-list-panel.js";

export class ItemUsePanel extends UsableListPanel {

  constructor (actor: PC | NPCAlly, filter ?: (x: Usable) => boolean) {
    const consumablesFn = () => this.actor.usableConsumables;
    super(actor, consumablesFn, filter);
  }

  protected override buttonConfig(): SidePanel.ButtonConfig[] {
    return this.itemList()
      .map ( usable => this.usableToButton(usable));
  }

  private usableToButton(usable: Usable) : SidePanel.ButtonConfig {
    const persona = this.actor.persona();
    const button : SidePanel.ButtonConfig = {
      label: this.getButtonLabel(usable),
      onPress: () => this._useItemOrPower(this.actor, usable),
      enabled: () => persona.canUsePower(usable),
      cssClasses: ["inventory-item"],
      tooltip: () => this.getItemTooltip(usable, persona),
    };
    return button;
  }

  protected getItemIconHTML(item: Usable) {
    const filepath =  item.getIconPath(this.actor);
    if (!filepath) {return new Handlebars.SafeString("");}
    return new Handlebars.SafeString(`<img class="item-icon" src='${filepath}' title='${item.displayedName.toString()}'>`);
  }

  protected getButtonLabel(usable: Usable) {
    const icon = `
    <span class="item-icon">
    ${this.getItemIconHTML(usable).toString()}
    </span>`;
    const nameBlock= `<span class="itemName">${usable.name}</span>`;
    const amountTxt = usable.amount > 1 ? `${usable.amount}` : "";
    const amountBlock = `<span class="item-amount">${amountTxt}</span>`;

    return `${icon}${nameBlock}${amountBlock}`;
  }

  async getItemTooltip(usable: Usable, persona: Persona) : Promise<string>  {
    const templateData = {
      persona,
      power: usable,
    };
    return await foundry.applications.handlebars.renderTemplate("systems/persona/parts/power-tooltip-lite.hbs", templateData);
  }

}

Hooks.on("updateCombat", (_combat: PersonaCombat, changes : DeepPartial<PersonaCombat>) => {
  const activePanels = ItemUsePanel.getInstances<ItemUsePanel>(ItemUsePanel);
  for (const panel of activePanels) {
    void panel.onUpdateCombat(changes);
  }
});

Hooks.on("updateItem", (item: PersonaItem) => {
  const activePanels = ItemUsePanel.getInstances<ItemUsePanel>(ItemUsePanel);
  for (const panel of activePanels) {
    void panel.onUpdateItem(item);
  }
});

Hooks.on("updateActor", (actor: PersonaActor) => {
  const activePanels = ItemUsePanel.getInstances<ItemUsePanel>(ItemUsePanel);
  for (const panel of activePanels) {
    void panel.onUpdateActor(actor);
  }
});

