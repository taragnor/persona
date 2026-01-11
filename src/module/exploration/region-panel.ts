import {Metaverse} from "../metaverse.js";
import {PersonaSockets} from "../persona.js";
import {PersonaError} from "../persona-error.js";
import {PersonaRegion} from "../region/persona-region.js";
import {Helpers} from "../utility/helpers.js";
import {PersonaActor} from "../actor/persona-actor.js";
import {PersonaSettings} from "../../config/persona-settings.js";
import {SidePanel} from "../side-panel.js";

class RegionPanelComponent extends SidePanel {
	override get templatePath(): string {
		return "systems/persona/other-hbs/region-panel.hbs";
	}

	constructor() {
		super("region-info-panel");
	}

	override activateListeners(html: JQuery<HTMLElement>): void {
		super.activateListeners(html);
		html.find(".search-button").on("click", (ev) => RegionPanel.searchButton(ev));
		html.find(".crunch-button").on("click", (_ev) => void Metaverse.toggleCrunchParty());
	}
}

export class RegionPanel {
	private static panel: RegionPanelComponent;

	static init() {
		if (!this.panel) {
			this.panel = new RegionPanelComponent();
			this.initHooks();
		}
	}


	static clearRegionDisplay() {
		this.panel.clearPanel();
	}

	static async updateRegionDisplay(token: TokenDocument<PersonaActor>, tokenMove: boolean = true) {
		const scene = token.parent;
		const region = scene.regions.find( (region : PersonaRegion) => region.tokens.has(token) && !region?.regionData?.ignore);
		if (!region || game?.combat?.active) {
			RegionPanel.clearRegionDisplay();
			return;
		}
		//TODO: refactor into onMove, onSelect and actual updateRegion functions
		await this._updateRegionDisplay(region as PersonaRegion);
		const lastRegion = PersonaSettings.getLastRegion();
		if (tokenMove && lastRegion.lastRegionId != region.id) {
			if (game.user.isGM) {
				await PersonaSettings.setLastRegion({
					lastRegionId: region.id,
					lastSceneId: scene.id,
				});
				await (region as PersonaRegion).onEnterRegion(token);
			}
		}
	}

	static async _updateRegionDisplay (region: PersonaRegion) {
		await this.panel.updatePanel( {region, data: region.regionData});
	}

	static searchButton(_ev: JQuery.ClickEvent) {
		if (game.user.isGM) {
			void Metaverse.searchRoom();
			return;
		}
		Helpers.pauseCheck();
		const region = Metaverse.getRegion();
		if (!region) {
			throw new PersonaError("Can't find region");
		}
		const data = {regionId: region.id};
		PersonaSockets.simpleSend("SEARCH_REQUEST", data, game.users.filter(x=> x.isGM && x.active).map(x=> x.id));
	}

	private static initHooks() {
		console.log("Init Region Panel Hooks");

		Hooks.on("socketsReady", () => {
			PersonaSockets.setHandler("SEARCH_REQUEST", async function (data) {
				const region = game.scenes.current.regions.find( r=> data.regionId == r.id);
				if (!region) {throw new PersonaError(`Can't find region ${data.regionId}`);}
				await Metaverse.searchRegion(region as PersonaRegion);
			});
		});

		Hooks.on("canvasInit", () => {
			RegionPanel.clearRegionDisplay();
		});

		Hooks.on("updateRegion", async (region) => {
			const lastRegion = PersonaSettings.getLastRegion();
			if (region.id == lastRegion.lastRegionId) {
				await RegionPanel._updateRegionDisplay(region as PersonaRegion);
			}
		});

		Hooks.on("updateToken", async (token: TokenDocument<PersonaActor>, changes) => {
			const actor = token.actor as PersonaActor;
			if (!actor) {return;}
			if (token.hidden) {return;}
			if (actor.system.type != "pc" || !actor.hasPlayerOwner) {
				return;
			}
			if ((changes.x ?? changes.y) == undefined)
			{return;}
			const scene = token.parent;
			if (!scene) {return;}
			await RegionPanel.updateRegionDisplay(token);
		});

		Hooks.on("updateCombat", (_combat) => {
			RegionPanel.clearRegionDisplay();
		});

		Hooks.on("controlToken", async (token : Token<PersonaActor>) => {
			const actor = token?.document?.actor;
			if (!actor) {return;}
			if (actor.isPC()) {
				await RegionPanel.updateRegionDisplay(token.document, false);
			}
		});

	}

}
