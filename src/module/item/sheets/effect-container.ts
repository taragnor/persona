import { PersonaItemSheetBase } from "./base-item-sheet.js";
import { PowerContainer } from "../persona-item.js";
import { PersonaDB } from "../../persona-db.js";
import {PowerStuff} from "../../../config/power-stuff.js";


export abstract class PersonaEffectContainerBaseSheet extends PersonaItemSheetBase {
	declare item: PowerContainer | SocialCard;
	static _powerStuffBase?: Record<string, unknown>;

	override async getData() {
		if (this.item.isOwner && this.item.system.type != "socialCard") {
			await (this.item as PowerContainer).sanitizeEffectsData();//required becuase foundry input hates arrays;
		}
		const data = await super.getData();
		const SOCIAL_LINKS = Object.fromEntries(
			PersonaDB.socialLinks().map(actor => [actor.id, actor.name])
		);
		SOCIAL_LINKS[""] = "-";
		data.POWERSTUFF = PersonaEffectContainerBaseSheet.powerStuff;
		return data;
	}


	static get powerStuff(): Record<string, unknown> {
		return PowerStuff.powerStuff();
	}

	override activateListeners(html: JQuery<HTMLElement>) {
		super.activateListeners(html);
	}


}
