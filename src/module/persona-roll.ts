import { ModifierList } from "./combat/modifier-list";
import { Situation } from "./combat/modifier-list";

export class PersonaRoll extends Roll {
	mods: ModifierList;
	situation: Situation;

	constructor (dice: string, modifierList : ModifierList, situation: Situation) {
		super(dice);
		this.mods = modifierList;
		this.situation = situation;
	}

	 async toModifiedMessage(situation: Situation ) : Promise<ChatMessage> {
		 const mods = this.mods;
		const html = await renderTemplate("system/persona/other-hbs/simple-roll.hbs", {mods, roll: this});
		const msg = await ChatMessage.create(html);
		return msg;
	}

	override get total(): number {
		const total = this.total + this.mods.total(this.situation);
		return total;
	}

	override get result(): string {
		return this.total.toString();
	}

}
