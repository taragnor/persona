import { PersonaError } from "./persona-error.js";
import { ResolvedModifierList } from "./combat/modifier-list.js";
import { ModifierList } from "./combat/modifier-list.js";
import { Situation } from "./preconditions.js";
import { PersonaDB } from "./persona-db.js";
import { UniversalActorAccessor } from "./utility/db-accessor.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";

export class PersonaRoll extends Roll {
	modList: UnresolvedRoll | ResolvedRoll;
	name: string;

	constructor (dice: string, modifierList : ModifierList, situation: Situation, rollName: string) {
		super(dice);
		this.modList = {
			mods : modifierList,
			situation : situation,
		};
		this.name = rollName;
	}

	get printableMods() : ResolvedModifierList {
		if ("situation" in this.modList) {
			return this.resolveMods().mods;
		}
		return this.modList.mods;
	}

	resolveMods() : ResolvedRoll {
		if ("modtotal" in this.modList) {
			return this.modList;
		}
		const {mods, situation} = this.modList;
		this.modList =  {
			mods : mods.printable(situation),
			modtotal: mods.total(situation),
			actor: situation.user,
		} satisfies ResolvedRoll;
		return this.modList;
	}

	setSituation(sit: Situation) {
		if ("modtotal" in this.modList) {
			throw new PersonaError("Can't set Situation, Roll is already resolved");
		}
		this.modList.situation = sit;
	}

	 async toModifiedMessage() : Promise<ChatMessage> {
		 this.resolveMods();
		 if ("situation" in this.modList) {
			 throw new PersonaError("Mod List not resolved");
		 }
		const html = await renderTemplate("systems/persona/parts/simple-roll.hbs", {roll: this});
		 const actor  = PersonaDB.findActor(this.modList.actor);
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
		try {
			this.resolveMods();
			if ("situation" in this.modList) {
				throw new PersonaError("Mod List not resolved");
			}
			const total = super.total + this.modList.modtotal;
			return total;
		} catch (e) {
			return -999;
		}
	}

	override get result(): string {
		return this.total.toString();
	}

}

type UnresolvedRoll = {
	mods: ModifierList,
	situation: Situation,
}

type ResolvedRoll = {
	mods: ResolvedModifierList,
	modtotal : number,
	actor: UniversalActorAccessor<PC | Shadow>,
}
