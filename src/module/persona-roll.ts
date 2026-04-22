import { StatusEffectId } from "../config/status-effects.js";
import { HTMLTools } from "./utility/HTMLTools.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { PersonaError } from "./persona-error.js";
import { ResolvedModifierList } from "./combat/modifier-list.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaDB } from "./persona-db.js";
import { SocialStat } from "../config/student-skills.js";
import { STUDENT_SKILLS } from "../config/student-skills.js";
import {Calculation} from "./utility/calculation.js";
import {CombatEngine} from "./combat/combat-engine.js";
import {checkSituationProp} from "./preconditions.js";


export class PersonaRoller {

	 /**  will not animate this roll */
	 public static hideAnimation(r: Roll) : Roll{
			r.dice
				 .forEach(d => d.results
						//@ts-expect-error dice so nice value
						.forEach( r=>r.hidden = true)
				 );
			return r;
	 }

	 /**  will not animate this roll */
	 public static async hiddenRoll() : Promise<Roll> {
			const r = await new Roll("1d20").roll();
			return this.hideAnimation(r);
	 }

	static async #makeRoll(rollName:string, mods: ModifierList, situation: SituationComponent.RollParts.PreRoll, DC ?: number ): Promise<RollBundle & {modList: ResolvedMods}> {
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

	static #getDC(situation: SituationComponent.RollParts.PreRoll, options: RollOptions) : number | undefined {
		const {DCMods} = options;
		let {DC} = options;
    situation["rollTags"] = options.rollTags ?? [];
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
    const situation =  options.situation ? options.situation: {
      user: pc.accessor,
      DC: undefined,
      rollTags: [],
      addedTags: [],
    };
    const rollTags =  options.rollTags.slice();
    rollTags.pushUnique(socialStat);
    rollTags.pushUnique("social");
    situation.rollTags.pushUnique(...rollTags);
    const DC = this.#getDC(situation, options);
    const baseMods = pc.getSocialStat(socialStat);
    const socialMods = pc.getPersonalBonuses("socialRoll");
    const mods = await this.#compileModifiers(options, baseMods, socialMods);
    const skillName = game.i18n.localize(STUDENT_SKILLS[socialStat]);
    const rollName = skillName;
    const bundle = await this.#makeRoll(rollName, mods, situation, DC);
    const resSit = bundle.modList.resolvedSituation;
    let result : SituationTypes.Roll["result"] = "hit";
    if (DC != undefined) {
      if (resSit.rollTotal >= DC) {
        result = "hit";
      }
      if (resSit.rollTotal >= DC + 10) {
        result = "crit";
      }
    }
    const sitFilledIn = {
      ...resSit,
      result,
      usedSkill: socialStat,
    };
    await pc.onRoll(sitFilledIn);
    return bundle;
  }

  static async rollSave (actor: ValidAttackers, options: SaveOptions): Promise< RollBundle & {modList: ResolvedMods}> {
    const {saveVersus, label} = options;
    const rollTags = options.rollTags == undefined ? [] : options.rollTags.slice();
    const baseMods = actor.getSaveBonus();
    rollTags.pushUnique("save");
    const mods = await this.#compileModifiers(options, baseMods);
    const situation={
      ...(options.situation ?? {}),
      saveVersus: saveVersus ? saveVersus : undefined,
      user: PersonaDB.getUniversalActorAccessor(actor),
      rollTags: rollTags.concat(...options.situation?.rollTags ?? []),
      DC: undefined,
      addedTags : [],
    };
    const maybeDC = this.#getDC(situation, options);
    const DC = maybeDC ? maybeDC : 11;
    const difficultyTxt = DC == 11 ? "normal" : DC == 16 ? "hard" : DC == 6 ? "easy" : "unknown difficulty";
    const labelTxt = `Saving Throw (${label ? label + " " + difficultyTxt : ""})`;
    const bundle = await this.#makeRoll(labelTxt, mods, situation, DC);
    const resSit = bundle.modList.resolvedSituation;
    let result : "miss" | "hit" = "miss";
    if (DC != undefined) {
      if (resSit.rollTotal >= DC) {
        result = "hit";
      }
      // resSit.hit = resSit.rollTotal >= DC;
      // resSit.criticalHit = false;
    }
    const filledInRes = {
      ...resSit,
      result,
      saveVersus: options.saveVersus ?? null,
    };
    await actor.onRoll(filledInRes);
    return bundle;
  }

}

export class RollBundle {
	roll: Roll;
	modList: UnresolvedMods | ResolvedMods;
	name: string | ((b: RollBundle) => string);
	DC ?: number;
	_playerRoll: boolean;

	constructor (rollName: typeof this["name"] ,roll : Roll, playerRoll : boolean,  modList ?: ModifierList | Calculation, situation ?: SituationTypes.PreRoll, DC ?: number) {
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

	setName(newName: typeof this["name"] ): void {
		this.name = newName;
	}

	resolveMods() : ResolvedMods {
		if (typeof this.name == "function") {
			this.name = this.name(this);
		}
		if ("modtotal" in this.modList) {
			return this.modList;
		}
		const {mods, situation} = this.modList;
		if (!situation)
		{throw new Error("Situation can't resolve");}
		if (mods instanceof ModifierList) {
			const total = mods.total(situation);
			this.modList =  {
				mods : mods.printable(situation),
				modtotal: total,
				actor: situation.user,
				resolvedSituation: this.generateResolvedSituation(situation, total),
			} satisfies ResolvedMods;
			return this.modList;
		} else {
			const resolved = mods.eval(situation);
			this.modList = {
				modtotal: resolved.total,
				mods: resolved.steps,
				actor: situation.user,
				resolvedSituation: this.generateResolvedSituation(situation, resolved.total),
			} satisfies ResolvedMods;
			return this.modList;
		}
	}

	generateResolvedSituation(situation: SituationTypes.PreRoll, total: number) : Omit<SituationTypes.Roll, "result"> {
		if (situation.user) {
      const rollTags = checkSituationProp(situation, "rollTags") ? situation.rollTags : [];
      const addedTags = checkSituationProp(situation, "addedTags") ? situation.rollTags : [];
			const rollSituation = {
        ...situation,
        naturalRoll: this.roll.total,
        rollTags: rollTags,
        addedTags: addedTags,
        rollTotal: this.roll.total + total,
        user: situation.user,
        DC: undefined,
      } satisfies Omit<SituationTypes.Roll, "result">;
			return rollSituation;
		}
		PersonaError.softFail("No user for this roll", situation);
		return situation as SituationTypes.Roll;
	}

	get gmRoll() : boolean {
		return !this._playerRoll;
	}

	set situation(sit: SituationTypes.PreRoll) {
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
			return CombatEngine.isAnyHit(this.modList.resolvedSituation);
		}
	}

	get critical(): boolean | undefined {
		if ("modtotal" in this.modList) {
			return CombatEngine.isCrit(this.modList.resolvedSituation);
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
	mods: ModifierList | Calculation,
	situation: SituationComponent.RollParts.PreRoll | null,
}

type ResolvedMods = {
	mods: ResolvedModifierList,
	modtotal : number,
	actor: UniversalActorAccessor<ValidAttackers> | undefined,
	resolvedSituation: Omit<SituationTypes.Roll, "result"> & Partial<Pick<SituationTypes.Roll, "result">>;
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
	rollTags : NonNullable<SituationComponent.RollParts.PreRoll["rollTags"]>,
	modifierList ?: ModifierList,
	situation ?: SituationComponent.RollParts.PreRoll,
}
