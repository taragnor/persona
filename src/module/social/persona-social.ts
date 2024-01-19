import { PC } from "../actor/persona-actor.js";
import { SocialStat } from "../../config/student-skills.js";
import { ModifierList } from "../combat/modifier-list.js";
import { STUDENT_SKILLS } from "../../config/student-skills.js";
import { Situation } from "../combat/modifier-list.js";
import { PersonaRoll } from "../persona-roll.js";
import { PersonaDB } from "../persona-db.js";

export class PersonaSocial {

	static async rollSocialStat( pc: PC, socialStat: SocialStat) : Promise<ChatMessage> {
		const stat = pc.system.skills[socialStat];
		const mods = new ModifierList();
		mods.add(STUDENT_SKILLS[socialStat], stat);
		const sit: Situation = {
			user: PersonaDB.getUniversalActorAccessor(pc),
		};
		const dice = new PersonaRoll("1d20", mods, sit);
		await dice.roll();
		return await dice.toModifiedMessage(sit);
	}


}
