import {PersonaCombat} from "../combat/persona-combat.js";
import {Metaverse} from "../metaverse.js";
import {PersonaDB} from "../persona-db.js";
import {PersonaError} from "../persona-error.js";
import {PersonaSockets} from "../persona.js";
import {PersonaRegion} from "../region/persona-region.js";
import {Helpers} from "../utility/helpers.js";
import {HTMLTools} from "../utility/HTMLTools.js";
import {DowntimePanel} from "./downtime-panel.js";
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
    html.find(".room-mods .mod").on("click", ev => this._openRoomMod(ev));
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
    const myPC = PersonaDB.activePCParty().find (
      member => member.isRealPC() && member.isTrueOwner);
    const buttons : SidePanel.ButtonConfig[] =  [ {
      label: "Search Room",
      onPress : () => this.searchButton(),
      enabled : () => this.region != undefined && this.region.isSearchable && !PersonaCombat.combat,
    },
      ...DowntimePanel.craftingButtons(myPC, this),
    ];
    buttons.push(...this.PowersAndItemsButtons());
    const NPCAlly = PersonaDB.activePCParty().find( x=> x.isNPCAlly());
    buttons.push( {
      label: `Swap ${NPCAlly?.displayedName ?? "Teammate"}`,
      onPress: () => void Metaverse.chooseAlly(),
      enabled: () => !PersonaCombat.combat,
    });
    // buttons.push( {
    //   label: `Velvet Room`,
    //   onPress: () => void this._onVelvetRoomButton(),
    //   enabled: () => !PersonaCompendium.canUseCompendium(),
    // });
    return buttons;
  }

  PowersAndItemsButtons(): SidePanel.ButtonConfig[] {
    const buttons : SidePanel.ButtonConfig[] = [];
    const ownedMembers = PersonaDB.activePCParty()
    .filter (actor => actor.isPCLike() && actor.isOwner);
    if (PersonaDB.partyTokenActor()) {
      ownedMembers.unshift(PersonaDB.partyTokenActor()!);
    }
    for (const member of ownedMembers) {
      buttons.push( {
        label: `${ownedMembers.length > 1 ? member.name : ""} Item`,
        onPress: () => void this._openInventoryPanel(member),
        enabled: () => true,

      });
      buttons.push( {
        label: `${ownedMembers.length > 1 ? member.name : ""} Powers`,
        onPress: () => void this._openUsePowerPanel(member),
        enabled: () => true,
        visible: () => member.persona().explorationPowers.length > 0
      });
    }
    return buttons;
  }

  async _openInventoryPanel(member: PC | NPCAlly) {
    await this.push(new ItemUsePanel(member, (item:Usable) => item.canBeUsedInExploration()));
  }

  // async _onVelvetRoomButton() {
  //   await this.push(new VelvetRoomPanel());
  // }

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

  private _openRoomMod(ev: JQuery.ClickEvent) {
    const modId = HTMLTools.getClosestData<Item["id"]>(ev, "modId");
    const item = PersonaDB.getItemById(modId);
    if (item && item.isOwner) {item.sheet.render(true);}
  }


  async _openUsePowerPanel (actor : ValidAttackers) {
    await this.push(new ExplorationPowerPanel(actor));
  }

}

