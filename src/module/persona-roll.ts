import { PToken } from "./combat/persona-combat.js";
import { PersonaCombat } from "./combat/persona-combat.js";
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

	async getHTML(): Promise<string> {
		this.resolveMods();
		if ("situation" in this.modList) {
			throw new PersonaError("Mod List not resolved");
		}
		const html = await renderTemplate("systems/persona/parts/simple-roll.hbs", {roll: this});
		return html;
	}

	async toModifiedMessage() : Promise<ChatMessage> {
		const html = await this.getHTML();
		const actor  = PersonaDB.findActor((this.modList as ResolvedMods).actor);
		let token : PToken | undefined;
		token = PersonaCombat.getPTokenFromActorAccessor(actor.accessor);
		const speaker : ChatSpeakerObject = {
			actor: token?.actor?.id ?? actor.id,
			token: token?.id,
			alias: token?.name,
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



