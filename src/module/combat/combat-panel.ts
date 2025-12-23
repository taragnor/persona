import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaActorSheetBase} from "../actor/sheets/actor-sheet.base.js";
import {PersonaError} from "../persona-error.js";
import {SidePanel} from "../side-panel.js";
import {PersonaCombat, PToken} from "./persona-combat";

export class CombatPanel extends SidePanel {
	target: U<PToken>;
	static instance: CombatPanel;

	constructor() {
		super ("combat-panel");
	}

	override get templatePath(): string {
		const target = this.target?.actor;
		if (!target) {return "";}
		switch (true) {
			case target.isNPCAlly():
			case target.isPC() && target.isRealPC(): {
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
			case target.isPC(): {
				//unreal PC
				return "";
			}
			default:
				target satisfies never;
				throw new PersonaError(`Unknown Template for ${this.panelName}`);
		}
		return this._observerTemplate();
	}

	async setTarget(token: UN<PToken>) {
		if (!PersonaSettings.combatPanel()) {return;}
		if (token == undefined) {
			this.target = undefined;
			this.clearPanel();
			return;
		}
		if (!token.actor) {
			return;
		}
		if (token.actor.isPC() && !token.actor.isRealPC()) {
			return;
		}
		this.target = token;
		try {
			await this.updatePanel({});
		} catch (e) {
			if (e instanceof Error) {
				PersonaError.softFail(e.message, e);
				return;
			}
		}
	}

	private _controlledTemplate() : string {
		return "systems/persona/other-hbs/combat-panel-control.hbs";
	}

	private _observerTemplate(): string {
		return "systems/persona/other-hbs/combat-panel-obs.hbs";
	}

	override async getData() {
		const data = await super.getData();
		const CONST = PersonaActorSheetBase.CONST();
		return {
			...data,
			CONST,
			target: this.target,
		};
	}

	static init() {
		if (!this.instance) {
			this.instance = new CombatPanel();
			this.initHooks();
		}
	}

	private static initHooks() {
		Hooks.on("controlToken", async (token : Token<PersonaActor>) => {
			const actor = token?.document?.actor;
			const combat = game.combat as U<PersonaCombat>;
			if (!combat || combat.isSocial) {return;}
			if (!actor) {return;}
			if (actor.isValidCombatant()) {
				await this.instance.setTarget(token.document as PToken);
			}
		});

		Hooks.on("deleteCombat", (_combat) => {
			this.instance.clearPanel();
		});

		Hooks.on("canvasInit", () => {
			void this.instance.setTarget(null);
		});

	}


}
