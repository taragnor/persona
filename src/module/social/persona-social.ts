import { PC } from "../actor/persona-actor.js";
import { SocialStat } from "../../config/student-skills.js";
import { ModifierList } from "../combat/modifier-list.js";
import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { Situation } from "../preconditions.js";
import { PersonaRoll } from "../persona-roll.js";
import { PersonaDB } from "../persona-db.js";
import { HTMLTools } from "../utility/HTMLTools.js";

export class PersonaSocial {

	static async rollSocialStat( pc: PC, socialStat: SocialStat) : Promise<ChatMessage> {
		const mods = pc.getSocialStat(socialStat);
		const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
		mods.add("Custom Modifier", customMod);
		const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
		const sit: Situation = {
			user: PersonaDB.getUniversalActorAccessor(pc),
		};
		const dice = new PersonaRoll("1d20", mods, sit, skillName);
		await dice.roll();
		return await dice.toModifiedMessage();
	}

}
