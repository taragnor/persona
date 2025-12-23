import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaActorSheetBase} from "../actor/sheets/actor-sheet.base.js";
import {UsableAndCard} from "../item/persona-item.js";
import {PersonaError} from "../persona-error.js";
import {SidePanel} from "../side-panel.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {CombatEngine} from "./combat-engine.js";
import {PersonaCombat, PToken} from "./persona-combat.js";

export class CombatPanel extends SidePanel {
	target: U<PToken>;
	static instance: CombatPanel;
	_powerUseLock: boolean = false;

	constructor() {
		super ("combat-panel");
	}

	get actor() : U<ValidAttackers> {
		const actor = this.target?.actor;
		if (actor?.isValidCombatant()) {return actor;}
		return undefined;
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

	 override activateListeners(html: JQuery) {
		 super.activateListeners(html);
		 html.find(".control-panel .main-power .pretty-power-name").on("click", (ev) => void this._onClickPower(ev));
		 html.find(".control-panel button.basic-power").on("click", (ev) => void this._onClickPower(ev));
		 console.log("listener activated");
	 }

	async setTarget(token: UN<PToken>) {
		if (!PersonaSettings.combatPanel()) {return;}
		if (token == undefined || !token.actor) {
			this.target = undefined;
			this.clearPanel();
			return;
		}
		console.log(`Setting Panel Target: ${token.name}`);
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
		const actor = this.target?.actor;
		const persona = actor?.persona();
		const token = this.target;
		return {
			...data,
			CONST,
			target: this.target,
			persona,
			actor,
			token,
		};
	}

	static init() {
		if (!this.instance) {
			this.instance = new CombatPanel();
			this.initHooks();
		}
	}


	private async _onClickPower(ev: JQuery.ClickEvent) {
		ev.stopPropagation();
		if (!this.actor) {return;}
		const powerId = HTMLTools.getClosestData(ev, "powerId");
		const power = this.actor.powers.find(power => power.id == powerId);
		if (!power) {
			throw new PersonaError(`Can't find Power Id:${powerId}`);
		}
		const ptype = power.system.type;
		if (ptype != "power" && ptype != "consumable")
		{throw new PersonaError(`powerId pointed to unsualbe power ${powerId}`);}
		await this._useItemOrPower(power);
	}

	private async _useItemOrPower(power : UsableAndCard) {
		if (!this.actor) {return;}
		// Helpers.pauseCheck();
		// Helpers.ownerCheck(this.actor);
		if (this._powerUseLock) {
			ui.notifications.notify("Can't use another power now, as a power is already in process");
			return;
		}
		this._powerUseLock = true;

		//let token : PToken | undefined;
		//if (actor.token) {
		//	token = actor.token as PToken;
		//} else {
		//	const tokens = this.actor._dependentTokens.get(game.scenes.current)!;
		//	//THIS IS PROBABLY A bad idea to iterate over weakset
		//	//@ts-expect-error not sure what type tokens are
		//	token = Array.from(tokens)[0];
		//}
		//if (!token) {
		//	token = game.scenes.current.tokens.find(tok => tok.actorId == actor.id) as PToken;
		//}

		//if (!token) {
		//	throw new PersonaError(`Can't find token for ${this.actor.name}: ${this.actor.id}` );
		//}

		await CombatEngine.usePower(this.actor, power);

		// try {
		// 	const engine = new CombatEngine(undefined);
		// 	await engine.usePower(token, power );
		// } catch (e) {
		// 	switch (true) {
		// 		case e instanceof CanceledDialgogError: {
		// 			break;
		// 		}
		// 		case e instanceof TargettingError: {
		// 			break;
		// 		}
		// 		case e instanceof Error: {
		// 			console.error(e);
		// 			console.error(e.stack);
		// 			PersonaError.softFail("Problem with Using Item or Power", e, e.stack);
		// 			break;
		// 		}
		// 		default: break;
		// 	}
		// }

		this._powerUseLock = false;
	}

	private static initHooks() {
		Hooks.on("controlToken", async (token : Token<PersonaActor>, selected: boolean) => {
			if (!selected) {
				await this.instance.setTarget(null);
				return;}
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

		Hooks.on("updateActor", (actor) => {
			if (this.instance.target?.actor == actor) {
				void this.instance.updatePanel({});
			}
		});

		Hooks.on("updateToken", (token) => {
			if (this.instance.target == token) {
				void this.instance.updatePanel({});
			}
		});

	}

}
