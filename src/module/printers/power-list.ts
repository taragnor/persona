import { PersonaDB } from "../persona-db";

class PowerPrinter extends Application {

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "power-list-printer",
			template: "systems/persona/sheets/lists/power-list.hbs",
			width: 600,
			height: 800,
			minimizable: true,
			resizable: true,
			title: game.i18n.localize("persona.applications.powerPrinter"),
		});
	}

	override async activateListeners(html: JQuery) {
		super.activateListeners(html);

	}

	static open() {
		return new PowerPrinter();
	}

	override async getData() {
		const powers= PersonaDB.allPowersArr()
			.filter( x=> x.system.dmg_type == "fire");
		return {
			powers,
		};

	}

}

