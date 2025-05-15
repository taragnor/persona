import { SaveOptions } from "./combat/persona-combat.js";
import { HTMLTools } from "./utility/HTMLTools.js";
import { RollSituation } from "../config/situation.js";
import { ValidAttackers } from "./combat/persona-combat.js";
import { PToken } from "./combat/persona-combat.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { PersonaError } from "./persona-error.js";
import { ResolvedModifierList } from "./combat/modifier-list.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaDB } from "./persona-db.js";
import { UniversalActorAccessor } from "./utility/db-accessor.js";
import { RollTag } from "../config/roll-tags.js";
import { CardTag } from "../config/card-tags.js";
import { SocialStat } from "../config/student-skills.js";
import { PC } from "./actor/persona-actor.js";
import { STUDENT_SKILLS } from "../config/student-skills.js";


export class PersonaRoller {
	static async #makeRoll(rollName:string, mods: ModifierList, situation: Situation & {rollTags: (RollTag | CardTag)[]} ): Promise<RollBundle & {modList: ResolvedMods}> {
		const user = situation.user;
		let playerRoll = !game.user.isGM;
		if (user) {
			const roller = PersonaDB.findActor(user);
			if (roller?.isPC() || roller?.isNPCAlly()) {
				playerRoll = true;
			}
		}
		const r = await new Roll("1d20").roll();
		const bundle = new RollBundle(rollName, r, playerRoll,  mods, situation);
		bundle.resolveMods();
		return bundle as RollBundle & {modList: ResolvedMods};
	}

	static async rollsocialStat(pc: PC, socialStat: SocialStat, rollTags : (RollTag | CardTag)[] = [], situation ?: Situation, extraMods ?: ModifierList, DC ?: number): Promise<RollBundle & {modList: ResolvedMods}> {
		if (!situation) {
			situation = {
				user: pc.accessor,
				attacker: pc.accessor,
			}
		}
		rollTags=  rollTags.slice();
		rollTags.pushUnique(socialStat);
		const situationWithRollTags = {
			...situation,
			rollTags: rollTags.concat(situation?.rollTags ?? []),
			DC
		};
		let mods = pc.getSocialStat(socialStat);
		let socialmods = pc.getPersonalBonuses("socialRoll");
		mods = mods.concat(socialmods);
		const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
		mods.add("Custom Modifier", customMod);
		const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
		const rollName = skillName;
		if (extraMods) {
			mods = mods.concat(extraMods);
		}
		const bundle = await this.#makeRoll(rollName, mods, situationWithRollTags);
		const resSit = bundle.modList.resolvedSituation;
		if (DC != undefined) {
			resSit.hit = resSit.rollTotal > DC;
			resSit.criticalHit = false;
		}
		await pc.onRoll(resSit);
		return bundle;
	}

	static async rollSave (actor: ValidAttackers, {DC, label, askForModifier, saveVersus, modifier, rollTags}: SaveOptions, situation ?: Situation): Promise< RollBundle & {modList: ResolvedMods}> {
		rollTags = rollTags == undefined ? [] : rollTags;
		DC = DC ? DC : 11;
		const mods = actor.getSaveBonus();
		rollTags = rollTags.slice();
		rollTags.pushUnique("save");
		if (modifier) {
			mods.add("Modifier", modifier);
		}
		if (askForModifier) {
			const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
			mods.add("Custom modifier", customMod);
		}
		if (!situation) {
			situation = {
				user: PersonaDB.getUniversalActorAccessor(actor),
				saveVersus: saveVersus ? saveVersus : undefined,
			};
		}
		const situationWithRollTags = {
			...situation,
			rollTags: rollTags.concat(situation?.rollTags ?? []),
			saveVersus: situation.saveVersus ? situation.saveVersus : saveVersus,
		} satisfies Situation;
		const difficultyTxt = DC == 11 ? "normal" : DC == 16 ? "hard" : DC == 6 ? "easy" : "unknown difficulty";
		const labelTxt = `Saving Throw (${label ? label + " " + difficultyTxt : ""})`;
		const bundle = await this.#makeRoll(labelTxt, mods, situationWithRollTags);
		const resSit = bundle.modList.resolvedSituation;
		if (DC != undefined) {
			resSit.hit = resSit.rollTotal > DC;
			resSit.criticalHit = false;
		}
		await actor.onRoll(resSit);
		return bundle;
	}

}



export class RollBundle {
	roll: Roll;
	modList: UnresolvedMods | ResolvedMods;
	name: string;
	_playerRoll: boolean;

	constructor (rollName: string,roll : Roll, playerRoll : boolean,  modList ?: ModifierList, situation ?: Situation ) {
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
			throw new Error("Situation can't resolve");
		const total = mods.total(situation);
		this.modList =  {
			mods : mods.printable(situation),
			modtotal: total,
			actor: situation.user,
			resolvedSituation: this.generateResolvedSituation(situation, total),
		} satisfies ResolvedMods;
		return this.modList;
	}

	generateResolvedSituation(situation: Situation , total: number) : Situation & RollSituation {
		if (situation.user) {
			const rollSituation : Situation & RollSituation = {
				...situation,
				naturalRoll: this.roll.total,
				rollTags: situation.rollTags ?? [],
				rollTotal: this.roll.total + total,
				user: situation.user,
			};
			return rollSituation;
		}
		PersonaError.softFail("No user for this roll", situation);
		return situation as any;
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

	get situation() : Situation | null {
		if ("modtotal" in this.modList) {
			return this.modList.resolvedSituation;
		}
		return this.modList.situation;
	}

	resolvedSituation(this: RollBundle & {modList: ResolvedMods}) : ResolvedMods["resolvedSituation"] {
		return this.modList.resolvedSituation;
	}

	get success() : boolean | undefined {
		if ("modtotal" in this.modList) {
			return this.modList.resolvedSituation.hit;
		}
	}

	get critical(): boolean | undefined {
		if ("modtotal" in this.modList) {
			return this.modList.resolvedSituation.criticalHit;
		}
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
	situation: (Situation) | null,
}

type ResolvedMods = {
	mods: ResolvedModifierList,
	modtotal : number,
	actor: UniversalActorAccessor<ValidAttackers> | undefined,
	resolvedSituation: Situation & RollSituation,
};

Hooks.on("renderChatMessage", async (_msg, html) => {
	if (!game.user.isGM) {
		html.find(".gm-only").hide();
	}
});


