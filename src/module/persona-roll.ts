import { PersonaError } from "./persona-error.js";
import { ResolvedModifierList } from "./combat/modifier-list.js";
import { ModifierList } from "./combat/modifier-list.js";
import { Situation } from "./preconditions.js";
import { PersonaDB } from "./persona-db.js";
import { UniversalActorAccessor } from "./utility/db-accessor.js";
import { PC } from "./actor/persona-actor.js";
import { Shadow } from "./actor/persona-actor.js";

export class RollBundle {
	roll: Roll;
	modList: UnresolvedMods | ResolvedMods;
	name: string

	constructor (rollName: string,roll : Roll, modList ?: ModifierList, situation ?: Situation) {
		if (!roll._evaluated)
			throw new Error("Can't construct a Roll bundle with unevaluated roll");
		this.roll = roll;
		this.modList = {
			mods: modList ?? new ModifierList(),
			situation: situation ?? null,
		};
		this.name = rollName;
	}

	resolveMods() : ResolvedMods {
		if ("modtotal" in this.modList) {
			return this.modList;
		}
		const {mods, situation} = this.modList;
		if (!situation)
			throw new Error("No Situation can't resolve");
		this.modList =  {
			mods : mods.printable(situation),
			modtotal: mods.total(situation),
			actor: situation.user,
		} satisfies ResolvedMods;
		return this.modList;
	}

	set situation(sit: Situation) {
		if ("modtotal" in this.modList) {
			throw new Error("can't change situation in resolved modList");
		}
		this.modList.situation = sit;
	}

	get natural(): number {
		return this.dice[0].total;
	}

	get dice() {
		return this.roll.dice;
	}

	get total() : number {
		try {
			if (!this.roll._evaluated)
				throw new Error("Roll isn't evaluated");
			this.resolveMods();
			if ("situation" in this.modList) {
				throw new PersonaError("Mod List not resolved");
			}
			return this.roll.total + this.modList.modtotal;
		} catch (e) {
			return -999;
		}
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
			rolls: [this.roll],
			sound: CONFIG.sounds.dice
		}, {});
		return msg;
	}

	get printableMods() : ResolvedModifierList {
		if ("situation" in this.modList) {
			return this.resolveMods().mods;
		}
		return this.modList.mods;
	}

	get result(): string {
		return this.total.toString();
	}

}


type UnresolvedMods = {
	mods: ModifierList,
	situation: Situation | null,
}

type ResolvedMods = {
	mods: ResolvedModifierList,
	modtotal : number,
	actor: UniversalActorAccessor<PC | Shadow>,
};



// export class PersonaRoll extends Roll {
// 	modList: UnresolvedRoll | ResolvedRoll;
// 	name: string;

// 	constructor (dice: string, modifierList : ModifierList, situation: Situation, rollName: string) {
// 		super(dice);
// 		this.modList = {
// 			mods : modifierList,
// 			situation : situation,
// 		};
// 		this.name = rollName;
// 	}

// 	get printableMods() : ResolvedModifierList {
// 		if ("situation" in this.modList) {
// 			return this.resolveMods().mods;
// 		}
// 		return this.modList.mods;
// 	}

// 	resolveMods() : ResolvedRoll {
// 		if ("modtotal" in this.modList) {
// 			return this.modList;
// 		}
// 		const {mods, situation} = this.modList;
// 		this.modList =  {
// 			mods : mods.printable(situation),
// 			modtotal: mods.total(situation),
// 			actor: situation.user,
// 		} satisfies ResolvedRoll;
// 		return this.modList;
// 	}

// 	setSituation(sit: Situation) {
// 		if ("modtotal" in this.modList) {
// 			throw new PersonaError("Can't set Situation, Roll is already resolved");
// 		}
// 		this.modList.situation = sit;
// 	}

// 	async toModifiedMessage() : Promise<ChatMessage> {
// 		this.resolveMods();
// 		if ("situation" in this.modList) {
// 			throw new PersonaError("Mod List not resolved");
// 		}
// 		const html = await renderTemplate("systems/persona/parts/simple-roll.hbs", {roll: this});
// 		const actor  = PersonaDB.findActor(this.modList.actor);
// 		const speaker : ChatSpeakerObject = {
// 			actor: actor.id,
// 		};
// 		const msg = await ChatMessage.create({
// 			speaker,
// 			content: html,
// 			user: game.user,
// 			type:CONST.CHAT_MESSAGE_TYPES.ROLL,
// 			rolls: [this],
// 			sound: CONFIG.sounds.dice
// 		}, {});
// 		return msg;
// 	}

// 	get natural(): number {
// 		return this.dice[0].total;
// 	}

// 	override get total(): number {
// 		try {
// 			this.resolveMods();
// 			if ("situation" in this.modList) {
// 				throw new PersonaError("Mod List not resolved");
// 			}
// 			const total = super.total + this.modList.modtotal;
// 			return total;
// 		} catch (e) {
// 			return -999;
// 		}
// 	}

// 	override get result(): string {
// 		return this.total.toString();
// 	}

// }

// type UnresolvedRoll = {
// 	mods: ModifierList,
// 	situation: Situation,
// }

// type ResolvedRoll = {
// 	mods: ResolvedModifierList,
// 	modtotal : number,
// 	actor: UniversalActorAccessor<PC | Shadow>,
// }

