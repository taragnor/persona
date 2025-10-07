import { UserSituation } from "../config/situation.js";
import { StatusEffectId } from "../config/status-effects.js";
import { HTMLTools } from "./utility/HTMLTools.js";
import { RollSituation } from "../config/situation.js";
import { ValidAttackers } from "./combat/persona-combat.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { PersonaError } from "./persona-error.js";
import { ResolvedModifierList } from "./combat/modifier-list.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaDB } from "./persona-db.js";
import { RollTag } from "../config/roll-tags.js";
import { CardTag } from "../config/card-tags.js";
import { SocialStat } from "../config/student-skills.js";
import { PC } from "./actor/persona-actor.js";
import { STUDENT_SKILLS } from "../config/student-skills.js";


export class PersonaRoller {
	static async #makeRoll(rollName:string, mods: ModifierList, situation: Situation & {rollTags: (RollTag | CardTag)[]}, DC ?: number ): Promise<RollBundle & {modList: ResolvedMods}> {
		const user = situation.user;
		let playerRoll = !game.user.isGM;
		if (user) {
			const roller = PersonaDB.findActor(user);
			if (roller?.isPC() || roller?.isNPCAlly()) {
				playerRoll = true;
			}
		}
		const r = await new Roll("1d20").roll();
		const bundle = new RollBundle(rollName, r, playerRoll,  mods, situation, DC);
		bundle.resolveMods();
		return bundle as RollBundle & {modList: ResolvedMods};
	}

	static #getDC(situation: UserSituation & Situation, options: RollOptions) : number | undefined {
		const {DCMods} = options;
		let {DC} = options;
		situation = {
			...situation,
			rollTags: options.rollTags ?? [],
		};
		if (DC != undefined && DCMods != undefined) {
			const DCModsTotal = DCMods.total(situation);
			DC += DCModsTotal;
		}
		return DC;
	}

	static async #compileModifiers (options: RollOptions, ...existingMods: (ModifierList | undefined)[]) : Promise<ModifierList> {
		let mods = new ModifierList();
		for (const list of existingMods) {
			if (!list) {continue;}
			mods = mods.concat(list);
		}
		if (options.askForModifier) {
			const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
			mods.add("Custom modifier", customMod);
		}
		if (options.modifier) {
			mods.add("Modifier", options.modifier);
		}
		if (options.modifierList) {
			mods = mods.concat(options.modifierList);
		}
		return mods;
	}

	static async rollSocialStat(pc: PC, socialStat: SocialStat, options  : RollOptions): Promise<RollBundle & {modList: ResolvedMods}> {
		let {situation} = options;
		if (!situation) {
			situation = {
				user: pc.accessor,
				attacker: pc.accessor,
			};
		}
		const rollTags =  options.rollTags.slice();
		rollTags.pushUnique(socialStat);
		rollTags.pushUnique("social");
		const DC = this.#getDC(situation, options);
		const situationWithRollTags = {
			...situation,
			rollTags: rollTags.concat(situation?.rollTags ?? []),
			DC
		};
		const baseMods = pc.getSocialStat(socialStat);
		const socialMods = pc.getPersonalBonuses("socialRoll");
		const mods = await this.#compileModifiers(options, baseMods, socialMods);
		const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
		const rollName = skillName;
		const bundle = await this.#makeRoll(rollName, mods, situationWithRollTags, DC);
		const resSit = bundle.modList.resolvedSituation;
		if (DC != undefined) {
			resSit.hit = resSit.rollTotal >= DC;
			resSit.criticalHit = resSit.rollTotal >= DC + 10;
		}
		await pc.onRoll(resSit);
		return bundle;
	}

	static async rollSave (actor: ValidAttackers, options: SaveOptions): Promise< RollBundle & {modList: ResolvedMods}> {
		const {saveVersus, label} = options;
		let {rollTags, situation} = options;
		rollTags = rollTags == undefined ? [] : rollTags;
		const baseMods = actor.getSaveBonus();
		rollTags = rollTags.slice();
		rollTags.pushUnique("save");
		const mods = await this.#compileModifiers(options, baseMods);
		if (!situation) {
			situation = {
				user: PersonaDB.getUniversalActorAccessor(actor),
				saveVersus: saveVersus ? saveVersus : undefined,
			};
		}
		const maybeDC = this.#getDC(situation, options);
		const DC = maybeDC ? maybeDC : 11;
		const situationWithRollTags = {
			...situation,
			rollTags: rollTags.concat(situation?.rollTags ?? []),
			saveVersus: situation.saveVersus ? situation.saveVersus : saveVersus,
		} satisfies Situation;
		const difficultyTxt = DC == 11 ? "normal" : DC == 16 ? "hard" : DC == 6 ? "easy" : "unknown difficulty";
		const labelTxt = `Saving Throw (${label ? label + " " + difficultyTxt : ""})`;
		const bundle = await this.#makeRoll(labelTxt, mods, situationWithRollTags, DC);
		const resSit = bundle.modList.resolvedSituation;
		if (DC != undefined) {
			resSit.hit = resSit.rollTotal >= DC;
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
	DC ?: number;
	_playerRoll: boolean;

	constructor (rollName: string,roll : Roll, playerRoll : boolean,  modList ?: ModifierList, situation ?: Situation, DC ?: number) {
		this._playerRoll = playerRoll;
		if (!roll._evaluated)
			{throw new Error("Can't construct a Roll bundle with unevaluated roll");}
		this.roll = roll;
		this.modList = {
			mods: modList ?? new ModifierList(),
			situation: situation ?? null,
		};
		this.name = rollName;
		this.DC = DC;
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
			{throw new Error("Situation can't resolve");}
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
		return situation as Situation & RollSituation;
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
				{throw new Error("Roll isn't evaluated");}
			this.resolveMods();
			if ("situation" in this.modList) {
				throw new PersonaError("Mod List not resolved");
			}
			return this.roll.total + this.modList.modtotal;
		} catch {
			return -999;
		}
	}

	async getHTML(showSuccess :boolean): Promise<string> {
		this.resolveMods();
		if ("situation" in this.modList) {
			throw new PersonaError("Mod List not resolved");
		}
		if (this.DC == 0) {
			PersonaError.softFail("DC of 0 in roll", this);
			// debugger;
		}
		const html = await foundry.applications.handlebars.renderTemplate("systems/persona/parts/simple-roll.hbs", {roll: this, showSuccess});
		return html;
	}

	async toModifiedMessage(showSuccess : boolean) : Promise<ChatMessage> {
		const html = await this.getHTML(showSuccess);
		const actorAcc = (this.modList as ResolvedMods).actor;
		let speaker: Foundry.ChatSpeakerObject;
		if (actorAcc) {
			const actor  = PersonaDB.findActor(actorAcc);
			// let token : PToken | undefined;
			const token = PersonaCombat.getPTokenFromActorAccessor(actor.accessor);
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

Hooks.on("renderChatMessageHTML", (_msg, html) => {
	if (!game.user.isGM) {
		$(html).find(".gm-only").hide();
	}
});

type SaveOptions = RollOptions & {
	saveVersus?: StatusEffectId,
}


type RollOptions = {
	label : string | undefined,
	DC: number | undefined,
	DCMods ?: ModifierList,
	askForModifier ?: boolean,
	modifier ?: number,
	rollTags : (RollTag | CardTag) [],
	modifierList ?: ModifierList,
	situation ?: UserSituation & Situation,
}
