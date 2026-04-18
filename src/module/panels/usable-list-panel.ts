import {PersonaActor} from "../actor/persona-actor.js";
import {CombatEngine} from "../combat/combat-engine.js";
import {PersonaCombat, PToken} from "../combat/persona-combat.js";
import {PersonaTargetting} from "../combat/persona-targetting.js";
import {PersonaItem} from "../item/persona-item.js";
import {PersonaError} from "../persona-error.js";
import {SidePanel} from "../side-panel/side-panel.js";
import {lockObject} from "../utility/anti-loop.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {PowerTargetSelectionPanel} from "./power-target-selection-panel.js";
import {SubPanel} from "./sub-panel.js";

export abstract class UsableListPanel extends SubPanel {
  protected actor: ValidAttackers;
  protected filter: U<(x: Usable) => boolean>;
  private itemListFn : () => Usable[];
  static USE_POWER_TIMEOUT = 25000;

  constructor (actor: ValidAttackers, listFn: UsableListPanel["itemListFn"], filter ?: (x: Usable) => boolean) {
    super("item-use-panel");
    this.itemListFn = listFn;
    this.actor = actor;
    this.filter = filter;
  }

  override get templatePath() : U<string>{
    return undefined;
  }

  async onUpdateCombat(_changes : DeepPartial<PersonaCombat>) {
    await this.updatePanel();
  }

  async onUpdateItem( updatedItem: PersonaItem) {
    if (this.itemList().some(listItem=> listItem == updatedItem || listItem.itemBase == updatedItem)
    )  {await this.updatePanel();}
  }

  async onUpdateActor( updatedActor: PersonaActor) {
    if (this.actor == updatedActor) {
      await this.updatePanel();
    }
  }

  override staticHTML() {
    return `<h3>
      ${this.actor.name} Items
      </h3>`;
  }

  private _itemList() : Usable[] {
    return this.itemListFn();
  }

  itemList() : Usable[] {
    const baseList = this._itemList();
    if (!this.filter) {
      return baseList;
    }
    return baseList.filter( this.filter);
  }

  override activateListeners(html : JQuery) {
    super.activateListeners(html);
  }

  protected async _onUseItem(ev: JQuery.ClickEvent) {
    ev.stopPropagation();
    if (!this.actor) {return;}
    const itemId = HTMLTools.getClosestData(ev, "itemId");
    const item = this.actor.items.find(item => item.id == itemId);
    if (!item) {
      throw new PersonaError(`Can't find Item Id:${itemId}`);
    }
    if (!item.isUsableType()) {
      throw new PersonaError(`Can't use this item`);
    }
    await this._useItemOrPower(this.actor, item);
  }

  static async useItemOrPower(panel: SidePanel, user: ValidAttackers, power : UsableAndCard, targets ?: PToken[]) {
    if (!user) {return;}
    const selection = targets ? targets : PersonaTargetting.targettedPTokens() ;
    if (selection.length != 1 && power.requiresTargetSelection()) {
      await panel.push(new PowerTargetSelectionPanel(user, power as Usable));
      return;
    }
    await lockObject(this,
      async () => await CombatEngine.usePower(user, power, power.requiresTargetSelection() ? targets : undefined),
      {
        timeoutMs: UsableListPanel.USE_POWER_TIMEOUT,
        inUseMsg: "Already Using a power",
      }
    );
  }

  protected async _useItemOrPower(user: ValidAttackers, power : UsableAndCard, targets ?: PToken[]) {
    return await UsableListPanel.useItemOrPower(this, user, power, targets);
}

}

