import {PersonaActor} from "../actor/persona-actor";
import {PersonaDB} from "../persona-db.js";
import {HTMLTools} from "../utility/HTMLTools.js";

export class PersonaPrinter extends Application {
	static _instance : U<PersonaPrinter>;

	static init() {

	}

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "talent-list-printer",
			template: "systems/persona/sheets/lists/persona-printout.hbs",
			width: 1000,
			height: 1200,
			minimizable: true,
			resizable: true,
			title: game.i18n.localize("persona.applications.talentPrinter"),
		});
	}

	static async open() {
		if (!game.user.isGM) {ui.notifications.warn("Only GM can open this");}
		await PersonaDB.waitUntilLoaded();
		if (!this._instance) {
			this._instance = new PersonaPrinter();
		}
		this._instance.render(true);
		return this._instance;
	}

	override async getData(options: Record<string, unknown>) {
		await PersonaDB.waitUntilLoaded();
		PersonaDB.clearCache();
		const data = await super.getData(options);
		const personaList = PersonaDB.PersonaableShadowsOfArcana(1, 100, true);
		for (const listKey of Object.keys(personaList)) {
			const key = listKey as keyof typeof personaList; 
			if (!personaList[key]) {continue;}
			personaList[key] = personaList[key]
				.sort( (a,b) => a.startingLevel - b.startingLevel);
		}
		data["personaList"] = personaList;
		return data;
	}

	override activateListeners(html: JQuery) {
		super.activateListeners(html);
		html.find(".persona-list .persona").on ("click", (ev) => this.openPersona(ev));
	}

	openPersona(event: JQuery.ClickEvent) {
		const personaId = HTMLTools.getClosestData(event, "personaId");
		const shadow = PersonaDB.getActorById(personaId);
		if (!shadow || !shadow.isShadow()) {
			throw new Error(`Can't find Shadow for  ${shadow?.name}`);
		}
		void shadow.sheet.render(true);
	}

}

// Hooks.on("updateActor", function (actor: PersonaActor ) {
// 	const instance = PersonaPrinter._instance;
// 	if (instance && actor.isShadow())  {
// 		instance.render(false);
// 	}
// });


//@ts-expect-error editing global scope
window.PersonaList = PersonaPrinter;

