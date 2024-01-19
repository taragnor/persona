import { PC } from "../actor/persona-actor";
import { SocialStat } from "../../config/student-skills";
import { ModifierList } from "../combat/modifier-list";
import { STUDENT_SKILLS } from "../../config/student-skills";
import { Situation } from "../combat/modifier-list";
import { PersonaRoll } from "../persona-roll";
import { PersonaDB } from "../persona-db";

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
