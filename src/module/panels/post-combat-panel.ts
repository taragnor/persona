import {PersonaActor} from "../actor/persona-actor.js";
import {CombatScene} from "../combat/combat-scene.js";
import {PersonaCombat} from "../combat/persona-combat.js";
import {Metaverse} from "../metaverse.js";
import {PersonaSockets} from "../persona.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {VotingDialog} from "../utility/shared-dialog.js";
import {ExplorationPowerPanel} from "./explorationPowerPanel.js";
import {ItemUsePanel} from "./item-use-panel.js";
import {PersonaPanel} from "./sub-panel.js";
import {PersonaScene} from "../persona-scene.js";

export class PostCombatPanel extends PersonaPanel {
  static instance = new PostCombatPanel();

  constructor() {
    super("post-combat-panel");
  }

  override get templatePath(): U<string> {
    return undefined;
  }

  protected override buttonConfig() : SidePanel.ButtonConfig[] {
    return [
      {
        label: "Return to Exploring",
        onPress: () => this._onReturnToExploring(),
      },
      ...this.PowersAndItemsButtons(),
    ];
  }

  static init() {
  }

  private PowersAndItemsButtons(): SidePanel.ButtonConfig[] {
    const buttons : SidePanel.ButtonConfig[] = [];
    const ownedMembers = PersonaDB.activePCParty()
      .filter (actor => actor.isPCLike() && actor.isOwner);
    for (const member of ownedMembers) {
      if (member.persona().explorationPowers.length == 0) {continue;}
      buttons.push( {
        label: `${ownedMembers.length > 1 ? member.name : ""} Item`,
        onPress: () => void this._openInventoryPanel(member),
        enabled: () => true,

      });
      buttons.push( {
        label: `${ownedMembers.length > 1 ? member.name : ""} Powers`,
        onPress: () => void this._openUsePowerPanel(member),
        enabled: () => true,
      });
    }
    const NPCAlly = PersonaDB.activePCParty().find( x=> x.isNPCAlly());
    buttons.push( {
      label: `Swap ${NPCAlly?.displayedName ?? "Teammate"}`,
      onPress: () => void Metaverse.chooseAlly(),
      enabled: () => !PersonaCombat.combat,
    });
    return buttons;
  }

  private async _openInventoryPanel(member: PC | NPCAlly) {
    await this.push(new ItemUsePanel(member, (item:Usable) => item.canBeUsedInExploration()));
  }

  private async _openUsePowerPanel (actor : ValidAttackers) {
    await this.push(new ExplorationPowerPanel(actor));
  }

  private async _onReturnToExploring() {
    if (game.user.isGM) {
      await this.requestVote_GM();
    } else {
      this.requestVote_PC();
    }
  }

  private requestVote_PC() {
    const gm = game.users.find(x=> x.active && x.isGM);
    if (!gm) {throw new PersonaError("No GM Connected");}
    PersonaSockets.simpleSend("REQUEST_EXIT_COMBAT_VOTE", undefined, [gm.id]);
  }

  public async requestVote_GM() {
    if (!game.user.isGM) {throw new PersonaError("Non GM trying to request vote");}
    const dialog = new VotingDialog(["Continue Exploring", "Hold up"], "Return to Exploration Map?");
    const vote = await dialog.majorityVote();
    if (vote != "Continue Exploring") {return;}
    if (!CombatScene.instance) {
      const region = Metaverse.getRegion();
      if (!region || !(region.parent instanceof PersonaScene)) {
        throw new PersonaError("No Active Combat Scene, must return manually");
      }
      await CombatScene.returnToPreviousScene(region.parent);
      return;
    }
    CombatScene.instance.onReturnToExploringVote();
  }
}

Hooks.on("controlToken", async (token : Token<PersonaActor>) => {
  if (Metaverse.getPhase() != "postcombat") {return;}
  const actor = token?.document?.actor;
  if (!actor) {return;}
  if (actor.isOwner && actor.isPCLike()) {
    await PostCombatPanel.instance.activate();
  }
});

Hooks.on("socketsReady",(manager)  => {
  manager.setHandler("REQUEST_EXIT_COMBAT_VOTE", () => PostCombatPanel.instance.requestVote_GM());
});

Hooks.on("deleteCombat", async (combat : PersonaCombat) => {
  if (!combat.isSocial && game.scenes.active == CombatScene.scene) {
    await PostCombatPanel.instance.activate();
  }
});

Hooks.on("updateScene", () => {
  if (game.scenes.active != PersonaCombat.instance?.scene) {
    void PostCombatPanel.instance.deactivate();
  }
});

declare global {
  interface SocketMessage {
    "REQUEST_EXIT_COMBAT_VOTE": undefined,
  }
}
