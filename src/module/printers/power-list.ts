import { HTMLTools } from "../utility/HTMLTools.js";
import { PersonaError } from "../persona-error.js";
import { Power } from "../item/persona-item.js";
import { PersonaDB } from "../persona-db.js";

export class PowerPrinter extends Application {
	static _instance : U<PowerPrinter>;

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

	override activateListeners(html: JQuery) {
		super.activateListeners(html);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		html.find(".power-name").on("click", this.openPower.bind(this));

	}

	static async open() {
		await PersonaDB.waitUntilLoaded();
		if (!this._instance) {
			this._instance = new PowerPrinter();
		}
		this._instance.render(true);

		return this._instance;
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
			...untypedSkills,
			passiveSkills,
			// PowerPrinter.filterByType("passive"),
			// PowerPrinter.filterByType("defensive"),
		].map( list => list.sort(PowerPrinter.sortPowerFn));

		return {
			...data,
			powerLists: powers,
		};
	}

	static filterByType (subtype: Power["system"]["subtype"], powerType ?: Power["system"]["dmg_type"]) : Power[] {
		return PersonaDB.allPowersArr()
			.filter( pwr => pwr.system.subtype == subtype && !pwr.isTeamwork() && !pwr.isOpener() && !pwr.isNavigator())
			.filter( pwr=> powerType ? pwr.system.dmg_type == powerType: true)
			.filter( x=> !x.hasTag("shadow-only"));
	}

	static sortPowerFn(this: void, a: Power, b: Power) : number {
		const sort= a.system.slot - b.system.slot;
		if (sort != 0) {return sort;}
		const exoticSort= (a.hasTag("exotic")? 1 : 0)
			- (b.hasTag("exotic") ? 1 : 0);
		if (exoticSort != 0) {return exoticSort;}
		return a.name.localeCompare(b.name);
	}

	async openPower(event: JQuery.ClickEvent) {
		const powerId = HTMLTools.getClosestData(event, "powerId");
		if (powerId == undefined) {
			throw new PersonaError(`Can't find power`);
		}
		const power = PersonaDB.allPowers().get(powerId);
		if (!power) {
			throw new PersonaError(`Can't find power id ${powerId}`);
		}
		await power.sheet.render(true);
	}



}

Hooks.on("DBrefresh", function () {
	const instance = PowerPrinter._instance;
	if (instance && instance._state >= 2) {
		instance.render(true);
	}
});


