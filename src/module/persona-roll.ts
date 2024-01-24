import { ModifierList } from "./combat/modifier-list.js";
import { Situation } from "./combat/modifier-list.js";
import { PersonaDB } from "./persona-db.js";

export class PersonaRoll extends Roll {
	mods: ModifierList;
	situation: Situation;
	name: string;

	constructor (dice: string, modifierList : ModifierList, situation: Situation, rollName: string) {
		super(dice);
		this.mods = modifierList;
		this.situation = situation;
		this.name = rollName;
	}

	get printableMods() {
		return this.mods.printable(this.situation);
	}

	setSituation(sit: Situation) {
		this.situation = sit;
	}

	 async toModifiedMessage() : Promise<ChatMessage> {
		const html = await renderTemplate("systems/persona/parts/simple-roll.hbs", {roll: this});
		 const actor  = PersonaDB.findActor(this.situation.user);
		 const speaker : ChatSpeakerObject = {
			 actor: actor.id,
		 };
		const msg = await ChatMessage.create({
			speaker,
			content: html,
			user: game.user,
			type:CONST.CHAT_MESSAGE_TYPES.ROLL,
			rolls: [this],
			sound: CONFIG.sounds.dice
		}, {});
		return msg;
	}

	override get total(): number {
		const total = super.total + this.mods.total(this.situation);
		return total;
	}

	override get result(): string {
		return this.total.toString();
	}

}

