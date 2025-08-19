import { Power } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";

export class PowerPrinter extends Application {

	static init() {

	}

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "power-list-printer",
			template: "systems/persona/sheets/lists/power-printout.hbs",
			width: 1000,
			height: 1200,
			minimizable: true,
			resizable: true,
			title: game.i18n.localize("persona.applications.powerPrinter"),
		});
	}

	override async activateListeners(html: JQuery) {
		super.activateListeners(html);

	}

	static open() {
		const x= new PowerPrinter();
		x.render(true);
		return x;
	}

	override async getData(options: Record<string, unknown>) {
		await PersonaDB.waitUntilLoaded();
		const data = super.getData(options);
		const powers : Power[][] = [
				PowerPrinter.filterByType("magic" ,"fire"),
				PowerPrinter.filterByType("magic" , "cold"),
				PowerPrinter.filterByType("magic" , "lightning"),
				PowerPrinter.filterByType("magic" , "wind"),
				PowerPrinter.filterByType("magic" ,"light"),
				PowerPrinter.filterByType("magic" ,"dark"),
				PowerPrinter.filterByType("magic" ,"healing"),
				PowerPrinter.filterByType("magic" ,"untyped"),
				PowerPrinter.filterByType("magic" ,"none"),
				PowerPrinter.filterByType("weapon" ,"physical"),
				PowerPrinter.filterByType("weapon" ,"gun"),
				PowerPrinter.filterByType("weapon" ,"by-power"),
				PowerPrinter.filterByType("passive"),
				PowerPrinter.filterByType("defensive"),
		];
		return {
			...data,
			powerLists: powers,
		};
	}

	static filterByType (subtype: Power["system"]["subtype"], powerType ?: Power["system"]["dmg_type"]) : Power[] {
		return PersonaDB.allPowersArr()
			.filter( pwr => pwr.system.subtype == subtype && !pwr.isTeamwork() && !pwr.isOpener() && !pwr.isNavigator())
			.filter( pwr=> powerType ? pwr.system.dmg_type == powerType: true)
			.filter( x=> !x.hasTag("shadow-only"))
			.sort( (a,b) => {
				const sort= a.system.slot - b.system.slot
				if (sort != 0) return sort;
				const exoticSort= (a.hasTag("exotic")? 1 : 0) -
					(b.hasTag("exotic") ? 1 : 0);
				if (exoticSort != 0) return exoticSort;
				return a.name.localeCompare(b.name);
			});
	}



}


//@ts-ignore
window.PowerPrinter = PowerPrinter;
