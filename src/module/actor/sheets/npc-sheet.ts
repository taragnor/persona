import { PersonaSocial } from "../../social/persona-social.js";
import { PersonaActor } from "../persona-actor.js";
import { HBS_TEMPLATES_DIR } from "../../../config/persona-settings.js";
import { NoncombatantSheet } from "./noncombatant-sheet.js";
import { PersonaDB } from "../../persona-db.js";

export class NPCSheet extends NoncombatantSheet  {
	override actor: Subtype<PersonaActor, "npc">;

	static override get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["persona", "sheet", "actor"],
			template: `${HBS_TEMPLATES_DIR}/npc-sheet.hbs`,
			width: 800,
			height: 800,
			tabs: [{navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main"}]
		});
	}

	// override async getData() {
	// 	const data= await super.getData();
	// 	data.RELATIONSHIP_TYPES = PersonaDB.allSocialCards()
	// 		.flatMap(card => card.system.qualifiers)
	// 		.map(qual=> qual.relationshipName)
	// 		.filter( (val, i, arr) => arr.indexOf(val) == i);
	// 	return data;

	// }

	override activateListeners(html: JQuery<HTMLElement>) {
		html.find(".award-perk").on("click", this.activatePerk.bind(this));
		super.activateListeners(html);
	}

	activatePerk(ev: JQuery.ClickEvent) {
		const target = Array.from(game.user.targets)
			.find( (x: Token<PersonaActor>) => x.actor.system.type == "pc");
		if (target) {
			console.log(`Awarding Perk to ${target?.name}`)
			PersonaSocial.awardPerk(target.actor, this.actor);
		}


	}


}

