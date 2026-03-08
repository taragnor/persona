import { HTMLTools } from "../utility/HTMLTools.js";
import { PersonaError } from "../persona-error.js";
import { PersonaDB } from "../persona-db.js";
import {CARD_DROP_RATE, PROBABILITIES_POWER_RARITY} from "../../config/probability.js";
import {Persona} from "../persona-class.js";
import {localize} from "../persona.js";

export class PowerPrinter extends Application {
	static _instance : U<PowerPrinter>;

  targetPersona: U<Persona>;

	static init() {

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
	}

	static async open() {
		await PersonaDB.waitUntilLoaded();
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

	override async getData(options: Record<string, unknown>) {
		await PersonaDB.waitUntilLoaded();
		const data = await super.getData(options);
		const untypedSkills = [
			PowerPrinter.filterByType("magic" ,"none").filter( x=> x.isSupport()),
			PowerPrinter.filterByType("magic" ,"none").filter( x=> x.isAilment()),
			PowerPrinter.filterByType("magic" ,"none").filter( x=> !x.isAilment() && !x.isSupport()),
		].filter( x=> x.length > 0);
		const passiveSkills = [
			PowerPrinter.filterByType("passive"),
			PowerPrinter.filterByType("defensive"),
		].flat();

    const targetPersona = this.targetPersona && this.targetPersona.source.sheet._state > 0 ? this.targetPersona : undefined;

		const powers : Power[][] = [
			PowerPrinter.filterByType("magic" ,"fire"),
			PowerPrinter.filterByType("magic" , "cold"),
			PowerPrinter.filterByType("magic" , "lightning"),
			PowerPrinter.filterByType("magic" , "wind"),
			PowerPrinter.filterByType("magic" ,"light"),
			PowerPrinter.filterByType("magic" ,"dark"),
			PowerPrinter.filterByType("magic" ,"healing"),
			PowerPrinter.filterByType("magic" ,"untyped"),
			PowerPrinter.filterByType("weapon" ,"physical"),
			PowerPrinter.filterByType("weapon" ,"gun"),
			PowerPrinter.filterByType("weapon" ,"by-power"),
			PowerPrinter.filterByType("weapon" ,["fire", "cold", "lightning", "wind", "dark", "light", "untyped" ]),
			...untypedSkills,
			passiveSkills,
			// PowerPrinter.filterByType("passive"),
			// PowerPrinter.filterByType("defensive"),
		].map( list => list.sort(PowerPrinter.sortPowerFn));

		return {
			...data,
			powerLists: powers,
      targetPersona,
		};
	}

	static filterByType (subtype: Power["system"]["subtype"], powerType ?: Power["system"]["dmg_type"] | Power["system"]["dmg_type"][]) : Power[] {
		if (powerType && !Array.isArray(powerType)) {
			powerType = [powerType];
		}
		return PersonaDB.allPowersArr()
			.filter( pwr => pwr.system.subtype == subtype && !pwr.isTeamwork() && !pwr.isOpener() && !pwr.isNavigator())
			.filter( pwr=> powerType ? powerType.includes(pwr.system.dmg_type) : true)
			.filter( x=> !x.hasTag("shadow-only"));
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

	async openPower(event: JQuery.ClickEvent) {
		await this.fetchPower(event).sheet.render(true);
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
    await this.targetPersona.source.powerLearning().addLearnedPower(power);
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
