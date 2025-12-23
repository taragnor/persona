import {PersonaError} from "../persona-error.js";
import {SidePanel} from "../side-panel.js";
import {PToken} from "./persona-combat";

export class CombatPanel extends SidePanel {
	target: U<PToken>;

	override get templatePath(): string {
		const target = this.target?.actor;
		if (!target) {return "";}
		switch (true) {
			case target.isNPCAlly():
			case target.isPC(): {
				if (!game.user.isGM && target.isOwner) {
					return this._controlledTemplate();
				}
				break;
			}
			case target.isShadow(): {
				if (game.user.isGM) {
					return this._controlledTemplate();
				}
				break;
			}
			default:
				target satisfies never;
				throw new PersonaError(`Unknown Template for ${this.panelName}`);
		}
		return this._observerTemplate();
	}

	private _controlledTemplate() : string {
		return "systems/persona/other-hbs/combat-panel-control.hbs";
	}

	private _observerTemplate(): string {
		return "systems/persona/other-hbs/combat-panel-obs.hbs";
	}

}
