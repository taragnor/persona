import {PersonaActor} from "../actor/persona-actor.js";
import {CombatPanel} from "../combat/panels/combat-panel.js";
import {PersonaCombat, PToken} from "../combat/persona-combat.js";
import {Metaverse} from "../metaverse.js";

export class PersonaTokenObject extends CONFIG.Token.objectClass {
  override get actor() {return super.actor as PersonaActor;}

  override _onClickLeft2(event: TypeGuess<JQuery.Event>) {
    if (!game.user.isGM
      && this.actor?.isShadow()
      && !this.actor.isOwner) {
      if (Metaverse.getPhase() == "combat") {
        void this.openObserverPanel();
        return;
      }
    } else {
      super._onClickLeft2(event);
    }
  }

  async openObserverPanel() {
    const actor = this.actor;
    if (!actor.isValidCombatant()) {return;}
    const token = PersonaCombat.combat?.getCombatantByActor(actor)?.token;
    if (!token) {return;}
    await CombatPanel.instance.activate();
    await CombatPanel.instance.setMode("tactical");
    await CombatPanel.instance.setTacticalTarget(token as PToken);
  }

}


// FUTURE: for changing left click to allow on nonowners,
// MouseInteractionManager._canView(user, event)


