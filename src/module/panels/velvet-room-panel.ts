import {CardCraftingPanel} from "./card-crafting-panel.js";
import {SubPanel} from "./sub-panel.js";

export class VelvetRoomPanel extends SubPanel {

  actor: PC;

  override get templatePath(): U<string> {
    return undefined;
  }

  constructor(pc: PC) {
    super("velvet-room-panel");
    this.actor = pc;
  }

  override staticHTML() {
    return "<h2> Velvet Room </h2>";
  }

  protected override buttonConfig() : SidePanel.ButtonConfig[] {
    const velvetAccess : boolean = this.actor != undefined
      && this.actor.hasVelvetRoomAccess;
    return [ {
      label: "Create Cards (Velvet Room)",
      onPress: () => CardCraftingPanel.open(this.actor, this),
      enabled: () => CardCraftingPanel.allowCrafting(),
      visible: () => velvetAccess,
      cssClasses : ["tall-button"]
    }, {
      label: "Compendium Fusion",
      onPress: () => this.push( new FusionPanel(this.actor, true)),
      enabled: () => this.actor.canUseWildPersonas,
      visible: () => velvetAccess,
      cssClasses : ["tall-button"]
    }
    ];

  } ;
}

export class FusionPanel extends SubPanel {
  actor: PC;
  compendiumFusion: boolean;

  constructor(pc: PC, compFusion: boolean) {
    super("fusion-panel");
    this.compendiumFusion = compFusion;
    this.actor = pc;
  }

  override get templatePath(): U<string> {
    return undefined;
  }

  override staticHTML() {
    if (this.compendiumFusion) {
      return "<h2> Compendium Fusion</h2>";
    }
    return "<h2> Persona Fusion</h2>";
  }

}

