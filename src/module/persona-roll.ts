import { ValidAttackers } from "./combat/persona-combat.js";
import { PToken } from "./combat/persona-combat.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { PersonaError } from "./persona-error.js";
import { ResolvedModifierList } from "./combat/modifier-list.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaDB } from "./persona-db.js";
import { UniversalActorAccessor } from "./utility/db-accessor.js";

export class RollBundle {
	roll: Roll;
	modList: UnresolvedMods | ResolvedMods;
	name: string;
	_playerRoll: boolean;

	constructor (rollName: string,roll : Roll, playerRoll : boolean,  modList ?: ModifierList, situation ?: Situation) {
		this._playerRoll = playerRoll;
		if (!roll._evaluated)
			throw new Error("Can't construct a Roll bundle with unevaluated roll");
		this.roll = roll;
		this.modList = {
			mods: modList ?? new ModifierList(),
			situation: situation ?? null,
		};
		this.name = rollName;
	}

	setName(newName: string): void {
		this.name = newName;
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

	get gmRoll() : boolean {
		return !this._playerRoll;
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
		const actorAcc = (this.modList as ResolvedMods).actor;
		let speaker: Foundry.ChatSpeakerObject;
		if (actorAcc) {
			const actor  = PersonaDB.findActor(actorAcc);
			let token : PToken | undefined;
			token = PersonaCombat.getPTokenFromActorAccessor(actor.accessor);
			speaker = {
				actor: token?.actor?.id ?? actor.id,
				token: token?.id,
				alias: token?.name,
			};
		} else {
			speaker = {alias: "System"};
		}
		const msg = await ChatMessage.create({
			speaker,
			content: html,
			user: game.user,
			style: CONST.CHAT_MESSAGE_STYLES.OOC,
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
	actor: UniversalActorAccessor<ValidAttackers> | undefined,
};

Hooks.on("renderChatMessage", async (_msg, html) => {
	if (!game.user.isGM) {
		html.find(".gm-only").hide();
	}
});


