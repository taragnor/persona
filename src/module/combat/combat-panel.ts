import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaActorSheetBase} from "../actor/sheets/actor-sheet.base.js";
import {PersonaError} from "../persona-error.js";
import {SidePanel} from "../side-panel.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {CombatEngine} from "./combat-engine.js";
import {PersonaCombat, PersonaCombatant, PToken} from "./persona-combat.js";

export class CombatPanel extends SidePanel {
	target: U<PToken>;
	static instance: CombatPanel;
	_powerUseLock: boolean = false;

	constructor() {
		super ("combat-panel");
	}

	get combat() : PersonaCombat {
		const combat = game.combat as PersonaCombat;
		if (!combat) {
			ui.notifications.warn("No combat running");
		}
		return combat;
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
		 html.find(".active-control-panel .control-panel .main-power .pretty-power-name").on("click", ev => void this._onClickPower(ev));
		 html.find(".active-control-panel .control-panel button.basic-power").on("click", (ev) => void this._onClickPower(ev));
		 html.find(".control-panel .token-name").on("click", ev => void this.openToken(ev));
	 }

	async setTarget(token: UN<PToken>) {
		if (!PersonaSettings.combatPanel()) {return;}
		if (token == undefined || !token.actor) {
			this.target = undefined;
			this.clearPanel();
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
		const actor = this.target?.actor;
		const persona = actor?.persona();
		const token = this.target;
		const combatant = this.combat.getCombatantByActor(actor as ValidAttackers);
		let engagedList : PersonaCombatant[] = [];
		if (combatant && PersonaCombat.isPersonaCombatant(combatant))  {
		engagedList = this.combat.getAllEngagedEnemies(combatant);
		}
		return {
			...data,
			engagedList,
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
		if (this._powerUseLock) {
			ui.notifications.notify("Can't use another power now, as a power is already in process");
			return;
		}
		await this.lockSection(CombatEngine.usePower(this.actor, power));
	}

	private async lockSection(promise: Promise<unknown>) {
		this._powerUseLock = true;
		try {
			await promise;
		} catch (e) {
			console.warn(e);
			Debug(e);
		}
		this._powerUseLock = false;
	}

	async openToken(_ev: JQuery.ClickEvent) {
		await this.actor?.sheet.render(true);
	}

	isActiveControl() : boolean {
		const combat = PersonaCombat.combat;
		if (!combat || combat.isSocial || combat.combatant?.token == undefined) {return false;}
		if (this.target != combat.combatant.token) {return false;}
		return this.target?.actor?.isOwner ?? false;
	}

	static isActiveControl() : boolean {
		return this.instance.isActiveControl();
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
		Hooks.on("refreshToken", (token) => {
			if (this.instance.target == token.document) {
				void this.instance.updatePanel({});
			}
		});


		Hooks.on("updateToken", (token) => {
			if (this.instance.target == token) {
				void this.instance.updatePanel({});
				//for some reason update doesn't register on the combat for determining distance, so a bit of waiting is required,might have to do with animations for moving the token
				// void sleep(250).then(() => void this.instance.updatePanel({}));
			}
		});

	}

}
