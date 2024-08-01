import { PersonaActorSheetBase } from "../actor/sheets/actor-sheet.base.js";
import { Shadow } from "../actor/persona-actor.js";

export class ScanDialog extends Dialog {
	constructor(html: string, scanLevel = 1) {
		const dialogData : DialogOptions = {
			title: "Scan",
			content: html,
			render: ScanDialog.onRender,
			buttons: {
			},

		};
		super(dialogData, {width: 600, height: 600});

	}

	static onRender(html: string) {


	}


	static async create(shadow: Combatant<Shadow>, scanLevel: number) {
		const CONST = PersonaActorSheetBase.CONST();
		const templateData = {token: shadow.token, actor: shadow.actor, scanLevel, CONST};
		const html = await renderTemplate("systems/persona/sheets/dialogs/scan-dialog.hbs" , templateData);
		const dialog = new ScanDialog(html, scanLevel);
		dialog.render(true);
	}

}

