/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { HTMLTools } from "../../utility/HTMLTools.js";
import { PersonaItem } from "../persona-item.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import {PersonaDB} from "../../persona-db.js";
import {ContextMenu,  ContextMenuOptions} from "../../utility/context-menu.js";
import {NonDeprecatedPrecondition} from "../../../config/precondition-types.js";
import {NonDeprecatedConsequence} from "../../../config/consequence-types.js";
import {ConditionalEffectManager, MenuDataI} from "../../conditionalEffects/conditional-effect-manager.js";

export class PersonaItemSheetBase extends foundry.appv1.sheets.ItemSheet<PersonaItem> implements MenuDataI {

  protected contextMenu: ContextMenu;

  constructor(obj: object, options: object) {
    super(obj, options );
    this.contextMenu = new ContextMenu("item-sheet-context-menu");
  }

  static override get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["persona", "sheet", "item"],
      template: `${HBS_TEMPLATES_DIR}/item-sheet-base.hbs`,
      width: 800,
      height: 800,
      tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
    });
  }

  override async getData() {
    await PersonaDB.waitUntilLoaded();
    return super.getData();
  }

  override activateListeners(html: JQuery<HTMLElement>) {
    super.activateListeners(html);
    this.contextMenu.attachToContainer(html);
    ConditionalEffectManager.applyHandlers(html, this.item, this.contextMenu);
    html.find(".itemTags .addItemTag").on("click", this.addItemTag.bind(this));
    html.find(".itemTags .delTag").on("click", this.deleteItemTag.bind(this));
  }

  async addItemTag(_ev: JQuery.ClickEvent) {
    await (this.item as Consumable).addItemTag();
  }

  async deleteItemTag(ev: JQuery.ClickEvent) {
    const index = HTMLTools.getClosestData(ev, "tagIndex");
    await (this.item as Consumable).deleteItemTag(Number(index));

  }

  newConditionalMenu() : ContextMenuOptions<NonDeprecatedPrecondition>[]  {
    return [];
  }

  newConsequenceMenu() : ContextMenuOptions<NonDeprecatedConsequence>[]  {
    return [
      {
        label: "Damage",
        action: () => ({
          type: "combat-effect",
          combatEffect:"damage",
          applyTo: "target",
          damageSubtype: "odd-even",
          damageType :"by-power",
        } satisfies NonDeprecatedConsequence),
      },
      {
        label: "Add Status",
        action: () => ({
          type: "combat-effect",
          combatEffect:"addStatus",
          "applyTo" : "target",
          "potency": 1,
          "statusDuration": "3-rounds",
          "durationApplyTo": "target",
          "statusName": "burn",
        } satisfies NonDeprecatedConsequence),
      },
      {
        label: "SFX",
        action: () => ({
          type :"sfx",
          sfxType: "play-animation",
          actionType: "standard",
          applyTo: "target",
          fileName : "",
          offType : "none",
          priority : 0,
          order: 0,
          projectile : "none",
        } satisfies NonDeprecatedConsequence),
      },
    ];
  }

  defaultConditionalEffect(_ev: JQuery.ClickEvent): ConditionalEffect {
    const effect : ConditionalEffect = {
      isDefensive: false,
      isEmbedded: false,
      isAura: false,
      conditions: [{
        type: "always",
      }],
      consequences: [ {
        type: "none"
      }]
    };
    return effect;
  }

}
