import {PersonaSettings} from "../../config/persona-settings.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaActorSheetBase} from "../actor/sheets/actor-sheet.base.js";
import {PersonaError} from "../persona-error.js";
import {SidePanel} from "../side-panel.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {CombatEngine} from "./combat-engine.js";
import {PersonaCombat, PersonaCombatant, PToken} from "./persona-combat.js";

export class CombatPanel extends SidePanel {
	_target: U<PToken>;
	static instance: CombatPanel;
	_powerUseLock: boolean = false;
	mode: "main" | "inventory" | "persona" | "tactical";
	tacticalTarget: U<PToken>;

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

	get allowGMPCControl () {
		return PersonaSettings.debugMode();
	}

	get target() {
		if (this.mode =="tactical") {return this.tacticalTarget ?? this._target;}
		return this._target;
	}

	get actor() : U<ValidAttackers> {
		const actor = this.target?.actor;
		if (actor?.isValidCombatant()) {return actor;}
		return undefined;
	}

	override get templatePath(): string {
		const target = this.mode != "tactical" ? this.target?.actor : this.tacticalTarget?.actor ?? this.target?.actor;
		if (!target) {return "";}
		switch (true) {
			case target.isNPCAlly():
			case target.isPC() && target.isRealPC(): {
				const allowGM = this.allowGMPCControl;
				if (game.user.isGM && !allowGM) {
					break;
				}
				if (target.isOwner) {
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
		 html.find(".active-control-panel .main-power .pretty-power-name").on("click", ev => void this._onClickPower(ev));
		 html.find(".active-control-panel button.basic-power").on("click", (ev) => void this._onClickPower(ev));
		 html.find(".control-panel .token-name").on("click", ev => void this.openToken(ev));
		 html.find(".control-panel button.inventory-button").on("click", (ev) => void this._onInventoryButton(ev));
		 html.find(".control-panel button.return-button").on("click", (ev) => void this._onReturnToMainButton(ev));
		 html.find(".active-control-panel .inventory-item:not(.faded)").on("click", (ev) => void this._onUseItem(ev));
		 html.find(".control-panel .tacticalMode").on("click", (ev) => void this._onTacticalMode(ev));
		 html.find(".control-panel button.persona-switch").on("click", (ev) => void this._onPersonaModeSwitchButton(ev));
		 html.find(".control-panel button.persona-name-button").on("click", (ev) => void this._onPersonaSwitchButton(ev));
		 html.rightclick( (ev) => this._onReturnToMainButton(ev));
		 if ( this.target ) {
			 this.target.actor.refreshTheurgyBarStyle();
		 }
	 }

	async setTacticalTarget(token: UN<PToken>) {
		if (!PersonaSettings.combatPanel()) {return;}
		if (token == undefined) {
			this.tacticalTarget = undefined;
			await this.updatePanel({});
			return;
		}
		if (!token.actor.isValidCombatant()) {return;}
			this.tacticalTarget = token;
			await this.updatePanel({});
	}

	async setTarget(token: UN<PToken>) {
		if (!PersonaSettings.combatPanel()) {return;}
		if (token == undefined || !token.actor) {
			this._target = undefined;
			this.clearPanel();
			this.mode = "main";
			return;
		}
		if (token.actor.isPC() && !token.actor.isRealPC()) {
			return;
		}
		this._target = token;
		this.mode = "main";
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
			mode: this.mode,
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

	private async _onInventoryButton(_ev: JQuery.ClickEvent) {

		this.mode = "inventory";
		await this.updatePanel({});
	}

	private async _onReturnToMainButton(ev: JQuery.ClickEvent) {
		if (this.mode == "main") {return;}
		ev.stopPropagation();
		this.mode = "main";
		await this.updatePanel({});
	}

	private async _onUseItem(ev: JQuery.ClickEvent) {
		ev.stopPropagation();
		if (!this.actor) {return;}
		const itemId = HTMLTools.getClosestData(ev, "itemId");
		const item = this.actor.items.find(item => item.id == itemId);
		if (!item) {
			throw new PersonaError(`Can't find Item Id:${itemId}`);
		}
		if (!item.isConsumable()) {
			throw new PersonaError(`Can't use this item`);
		}
		await this._useItemOrPower(item);
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

	private async _onTacticalMode(ev: JQuery.ClickEvent) {
		ev.stopPropagation();
		this.mode = "tactical";
		await this.updatePanel();
	}

	private async _onPersonaModeSwitchButton(ev: JQuery.ClickEvent) {
		ev.stopPropagation();
		if (!this.target) {return;}
		const actor = this.target.actor;
		const currentPersona = actor.persona();
		const filteredPList = actor.personaList
			.filter( p => !p.equals(currentPersona));
		if (filteredPList.length == 1) {
			if (!this.isActiveControl()) {
				ui.notifications.notify("Can't swap right now.");
				return;
			}
			await actor.switchPersona(filteredPList.at(0)!.source.id);
			return;
		}
		this.mode = "persona";
		await this.updatePanel();
	}

	private async _onPersonaSwitchButton(event: JQuery.ClickEvent) {
		if (!this.isActiveControl()) {
			ui.notifications.warn("Can't switch personas right now");
			return;
		}
		const personaId = HTMLTools.getClosestData(event, "personaId");
		if (this.target) {
			await this.target.actor.switchPersona(personaId);
		}
	}

	async openToken(_ev: JQuery.ClickEvent) {
		await this.actor?.sheet.render(true);
	}

	isActiveControl() : boolean {
		const combat = PersonaCombat.combat;
		if (!combat || combat.isSocial || combat.combatant?.token == undefined) {return false;}
		if (!this.target || !combat.turnCheck(this.target)) {return false;}
		return this.target?.actor?.isOwner ?? false;
		//TODO: may want to check that target is combatant in battle
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
			}
		});

		Hooks.on("hoverToken", (token, isSelecting) => {
			if (this.instance.mode != "tactical") {return;}
			const panel = this.instance;
			if (isSelecting) {
				void panel.setTacticalTarget(token.document as PToken);
			} else {
				void panel.setTacticalTarget(null);
			}

		});

	}

}
