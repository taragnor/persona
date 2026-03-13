import { HTMLTools } from "../utility/HTMLTools.js";
import { PersonaError } from "../persona-error.js";
import { PersonaDB } from "../persona-db.js";
import {CARD_DROP_RATE, PROBABILITIES_POWER_RARITY, RANDOM_POWER_RATE} from "../../config/probability.js";
import {Persona} from "../persona-class.js";
import {localize} from "../persona.js";
import {PowerTag} from "../../config/power-tags.js";
import {sleep} from "../utility/async-wait.js";

export class PowerPrinter extends Application {
  static _instance : U<PowerPrinter>;

  targetPersona: U<Persona>;

  allowedTags : U<PowerTag[]>;
  baseRarity ?: Power["system"]["rarity"];
  highestSlot ?: Power["system"]["slot"];
  _swapPower ?: Power;
  filterString : string = "";
  showUnique: boolean = false;

  static init() {

  }

  constructor();
  constructor(swapPower: Power, persona : Persona);
  constructor(swapPower?: Power, persona ?: Persona) {
    super();
    if (game.user.isGM) {
      this.showUnique = true;
    }
    if (swapPower && persona) {
      this.highestSlot = swapPower.system.slot;
      let rarity = swapPower.system.rarity;
      switch (rarity) {
        case "never":
          break;
        case "rare":
          rarity = "rare-plus";
          break;
      }
      this.baseRarity = rarity;
      this._swapPower = swapPower;
      this.setTargetPersona(persona);
    }
  }

  static override get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "power-list-printer",
      template: "systems/persona/sheets/lists/power-printout.hbs",
      width: 1500,
      height: 1200,
      minimizable: true,
      resizable: true,
      title: game.i18n.localize("persona.applications.powerPrinter" as LocalizationString),
    });
  }

  override activateListeners(html: JQuery) {
    super.activateListeners(html);
    html.find(".power-name").on("click", ev => void this.openPower(ev));
    html.find(".rarity").on ("click", ev => void this.changeRarityLeftClick(ev));
    html.find(".rarity").on ("contextmenu", ev => void this.changeRarityRightClick(ev));
    html.find(".learn-power").on ("click", ev => void this.learnPower(ev));
    html.find(".learn-power").on ("contextmenu", ev => void this.addToLearningList(ev));
    html.find(".swap-power").on ("click", ev => void this.onSwapPower(ev));
    html.find("input.filter-text").on("change", ev => void this.onFilterStringChange(ev));
    html.find("input.show-unique").on("change", ev => void this.onChangeShowUnique(ev));
    //fix for it automatically reloading the page on filter
    html.find('input').on('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.setFilterString(html.find("input.filter-text").val() as string);
      }
    });
    //fix for it automatically reloading the page on filter
    html.find('form').on('submit', function (e) {
      e.preventDefault();
    });
    // html.find("input.filter-text").trigger("focus");
  }

  static async open(): Promise<PowerPrinter> {
    await PersonaDB.waitUntilLoaded();
    return this.createGeneralizedInstance();
  }

  static openSwap(power: Power, persona: Persona) : PowerPrinter {
    const printer = new PowerPrinter(power, persona);
    printer.render(true);
    return printer;
  }

  private static createGeneralizedInstance() {
    if (!this._instance) {
      this._instance = new PowerPrinter();
    }
    this._instance.render(true);
    return this._instance;
  }


  setTargetPersona(persona : Persona) {
    this.targetPersona = persona;
    this.render();
  }

  static swappablePowers(highestSlot: Power["system"]["slot"], bestRarity: Power["system"]["rarity"]) : Power[] {
    const powerArr = PersonaDB.allPowersArr();
    let slot = highestSlot;
    let rarity : typeof bestRarity = bestRarity == "rare-plus" ? "normal-minus" : bestRarity;
    const P = RANDOM_POWER_RATE;
    const powers : Power[][] = [];
    while (slot >= 0) {
      powers.push(powerArr.filter( pwr => pwr.system.slot == slot && P[pwr.system.rarity] >= P[rarity]));
      slot -= 1;
      switch (rarity) {
        case "normal":
          rarity = "normal-minus";
          break;
        case "normal-minus":
        case "rare-plus":
        case "rare":
          rarity = "rare-plus";
          break;
        default:
          break;
      }
    }
    return powers.flat();
  }

  override async getData(options: Record<string, unknown>) {
    await PersonaDB.waitUntilLoaded();
    const data = await super.getData(options);
    const targetPersona = this.targetPersona && this.targetPersona.source.sheet._state > 0 ? this.targetPersona : undefined;
    const powers = (await this.mainPowerList())
      .filter( x=> x!= undefined && x.length > 0)
      .map( list => list.sort(PowerPrinter.sortPowerFn));
    if (powers.length == 0 && this.filterString.length == 0) {
      throw new PersonaError("No Powers to display");
    }
    return {
      ...data,
      powerLists: powers,
      targetPersona,
      swapPower: this._swapPower,
      filterString: this.filterString,
      showUnique: this.showUnique,
    };
  }

  private async mainPowerList () : Promise<Power[][]> {
    const untypedSkills = [
      (await this.delayedFilter("magic" ,"none"))
      .filter( x=> x.isSupport()),
      (await this.delayedFilter("magic" ,"none"))
      .filter( x=> x.isAilment()),
      (await this.delayedFilter("magic" ,"none"))
      .filter( x=> !x.isAilment() && !x.isSupport()),
    ].filter( x=> x.length > 0);
    const passiveSkills = [
      await this.delayedFilter("passive"),
      await this.delayedFilter("defensive"),
    ].flat();
    return [
      await this.delayedFilter("magic" ,"fire"),
      await this.delayedFilter("magic" , "cold"),
      await this.delayedFilter("magic" , "lightning"),
      await this.delayedFilter("magic" , "wind"),
      await this.delayedFilter("magic" ,"light"),
      await this.delayedFilter("magic" ,"dark"),
      await this.delayedFilter("magic" ,"healing"),
      await this.delayedFilter("magic" ,"untyped"),
      await this.delayedFilter("weapon" ,"physical"),
      await this.delayedFilter("weapon" ,"gun"),
      await this.delayedFilter("weapon" ,"by-power"),
      await this.delayedFilter("weapon" ,["fire", "cold", "lightning", "wind", "dark", "light", "untyped" ]),
      ...untypedSkills,
      passiveSkills,
    ] ;
  }

  private async delayedFilter(subtype: Power["system"]["subtype"], powerType ?: Power["system"]["dmg_type"] | Power["system"]["dmg_type"][]) : Promise<Power[]> {
    const data =  this.filterByType(subtype, powerType);
    await sleep(2); //sleep delay for more responsiveness
    return data;
  }

  filterByType (subtype: Power["system"]["subtype"], powerType ?: Power["system"]["dmg_type"] | Power["system"]["dmg_type"][]) : Power[] {
    if (powerType && !Array.isArray(powerType)) {
      powerType = [powerType];
    }
    return this.powerList()
      .filter( pwr => pwr.system.subtype == subtype && !pwr.isTeamwork() && !pwr.isOpener() && !pwr.isNavigator())
      .filter( pwr=> powerType ? powerType.includes(pwr.system.dmg_type) : true)
      .filter( x=> !x.hasTag("shadow-only"));
  }

  powerList() : readonly Power[] {
    let powerArr =  (this.highestSlot != undefined) 
      ? PowerPrinter.swappablePowers(this.highestSlot ?? 0, this.baseRarity ?? "normal")
      : PersonaDB.allPowersArr();
    if (this.filterString.length > 0) {
      const filterStr = this.filterString.toLowerCase();
      powerArr = powerArr.filter( pwr=> pwr.name.toLowerCase().includes(filterStr));
    }
    if (this.allowedTags) {
      const allowedTags = Array.isArray(this.allowedTags) ? this.allowedTags : [this.allowedTags];
      powerArr = powerArr
        .filter(pwr => allowedTags.some ( tag => pwr.hasTag(tag))
        );
    }
    if (!this.showUnique) {
      powerArr = powerArr
        .filter(pwr => pwr.system.rarity != "never");
    }
    return powerArr;
  }

  static sortPowerFn(this: void, a: Power, b: Power) : number {
    const sort= a.system.slot - b.system.slot;
    if (sort != 0) {return sort;}
    if (b.system.rarity != a.system.rarity) {
      return CARD_DROP_RATE[b.system.rarity] - CARD_DROP_RATE[a.system.rarity];
    }
    const exoticSort= (a.hasTag("exotic")? 1 : 0)
      - (b.hasTag("exotic") ? 1 : 0);
    if (exoticSort != 0) {return exoticSort;}
    return a.name.localeCompare(b.name);
  }

  openPower(event: JQuery.ClickEvent) {
    this.fetchPower(event).sheet.render(true);
  }

  private async changeRarityLeftClick(event: JQuery.ClickEvent) {
    if (!game.user.isGM) {return;}
    await this.fetchPower(event).increaseRarity();
  }

  private async changeRarityRightClick(event: JQuery.ContextMenuEvent) {
    if (!game.user.isGM) {return;}
    await this.fetchPower(event).reduceRarity();
  }

  private fetchPower(event: JQuery.Event) : Power {
    const powerId = HTMLTools.getClosestData(event, "powerId");
    if (powerId == undefined) {
      throw new PersonaError(`Can't find power`);
    }
    const power = PersonaDB.allPowers().get(powerId);
    if (!power) {
      throw new PersonaError(`Can't find power id ${powerId}`);
    }
    return power;
  }

  async learnPower(ev: JQuery.ClickEvent) {
    const power = this.fetchPower(ev);
    if (!this.targetPersona) {
      throw new PersonaError("No Target is selected, open a sheet to select a target");
    }
    if (!game.user.isGM) {
      if (!this.targetPersona.user.isOwner || !this.targetPersona.source.isOwner) {
        throw new PersonaError("You don't own this.");
      }
      if (!this.targetPersona.isCustomPersona) {
        throw new PersonaError("Only Custom Persona's can learn powers");
      }
      if (power.system.rarity != "normal" && power.system.rarity != "normal-minus") {
        const localizedRarity = localize(PROBABILITIES_POWER_RARITY[power.system.rarity]);
        throw new PersonaError(`Can't learn ${localizedRarity} power this way.`);
      }
    }
    await this.targetPersona.learnPower(power);
  }

  async addToLearningList(ev: JQuery.ContextMenuEvent) {
    const power = this.fetchPower(ev);
    if (!game.user.isGM) {return;}
    if (!this.targetPersona) {
      throw new PersonaError("No Target is selected, open a sheet to select a target");
    }
    await this.targetPersona.powerLearning.addLearnedPower(power);
  }

  async onSwapPower(ev: JQuery.ClickEvent) {
    const power = this.fetchPower(ev);
    if (!this.targetPersona || !this._swapPower) {
      throw new PersonaError("improperly set up power printer window");
    }
    await this.targetPersona.swapPower(this._swapPower, power);
    await this.close();
  }

  onFilterStringChange(ev: JQuery.ChangeEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    this.setFilterString($(ev.currentTarget).val() as string);
  }

  onChangeShowUnique(ev: JQuery.ChangeEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    this.showUnique = ($(ev.currentTarget).prop("checked") as boolean);
    this.render(false);
}

  setFilterString(newval: string) {
    this.filterString = newval;
    console.log(`Search string changed to ${newval}`);
    this.render(false);
  }

}

Hooks.on("DBrefresh", function () {
  const instance = PowerPrinter._instance;
  if (instance && instance._state >= 2) {
    instance.render(false);
  }
});

async function powerPrinter() {
  await PowerPrinter.open();
  return PowerPrinter._instance;
}


//@ts-expect-error adding to global scope
window.powerList = powerPrinter;
