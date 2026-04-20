import {PersonaCombat} from "../combat/persona-combat.js";
import {Metaverse} from "../metaverse.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSockets} from "../persona.js";
import {PersonaRegion} from "../region/persona-region.js";
import {Helpers} from "../utility/helpers.js";
import {ExplorationPowerPanel} from "./explorationPowerPanel.js";
import {ItemUsePanel} from "./item-use-panel.js";
import {PersonaPanel} from "./sub-panel.js";

export class ExplorationPanel extends PersonaPanel {
  region: U<PersonaRegion>;

	override get templatePath(): string {
		return "systems/persona/other-hbs/region-panel.hbs";
	}

	constructor() {
		super("region-info-panel");
	}

  override get autoActivateOnUpdate() : boolean {
    return true;
  }

	override activateListeners(html: JQuery<HTMLElement>): void {
		super.activateListeners(html);
		html.find(".search-button").on("click", (ev) => this.searchButton(ev));
		html.find(".crunch-button").on("click", (_ev) => void Metaverse.toggleCrunchParty());
	}

  setRegion(region: PersonaRegion) {
    this.region = region;
  }

  override async getData() {
    if (!this.region) {
      throw new Error("No region defined");
    }
    return {
      ...await super.getData(),
      region: this.region,
      data: this.region.regionData,
    };
  }

  override async updatePanel( region?: PersonaRegion) {
    if (region) {
      this.setRegion(region);
    }
    await super.updatePanel();
  }

  override buttonConfig() : SidePanel.ButtonConfig[] {
    const buttons =  [ {
      label: "Search Room",
      onPress : () => this.searchButton(),
      enabled : () => this.region != undefined && this.region.isSearchable && !PersonaCombat.combat,
    }
    ];
    const ownedMembers = PersonaDB.activePCParty()
      .filter (member => member.isOwner);
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

  async _openInventoryPanel(member: PC | NPCAlly) {
    await this.push(new ItemUsePanel(member, (item:Usable) => item.canBeUsedInExploration()));
  }

	searchButton(_ev ?: JQuery.ClickEvent) {
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

  override prereqs() {
    return [
      () => PersonaDB.isLoaded
    ];
  }

  async _openUsePowerPanel (actor : ValidAttackers) {
    await this.push(new ExplorationPowerPanel(actor));
  }

}


