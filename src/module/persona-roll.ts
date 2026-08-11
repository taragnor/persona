import { HTMLTools } from "./utility/HTMLTools.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaDB } from "./persona-db.js";
import { SocialStat } from "../config/student-skills.js";
import { STUDENT_SKILLS } from "../config/student-skills.js";
import {ResolvedRollBundle, RollBundle, ValidModListType} from "./roll-bundle.js";
import {StatusEffectId} from "../config/status-effects.js";
import {PersonaActor} from "./actor/persona-actor.js";
import {PersonaError} from "./persona-error.js";
import {CalculationV2} from "./utility/calculation-v2.js";
import {Calculation} from "./utility/calculation.js";


export class PersonaRoller {

  /**  will not animate this roll */
  public static hideAnimation(r: Roll) : Roll{
    r.dice
      .forEach(d => d.results
        //@ts-expect-error dice so nice value
        .forEach( r=> r.hidden = true)
      );
    return r;
  }

  /**  will not animate this roll */
  public static async hiddenRoll() : Promise<Roll> {
    const r = await new Roll("1d20").roll();
    return this.hideAnimation(r);
  }

  static async #makeRoll(rollName:string, mods: ValidModListType, situation: SituationComponent.RollParts.PreRoll, DC : RollBundle["DC"], resultFn ?: RollBundle["_resultFn"]): Promise<ResolvedRollBundle> {
    const user = situation.user;
    const actor = PersonaDB.findActor(user);
    const roll = await new Roll("1d20").roll();
    const playerRoll = this.isPlayerRoll(user);
    const bundle = new RollBundle(rollName, roll, playerRoll, mods, situation, DC);
    if (resultFn) {
      bundle.setResultFn(resultFn);
    }
    const res = bundle.resolve();
    await actor.onRoll(res.resultSituation);
    return res;
  }

  private static isPlayerRoll(user: UniversalActorAccessor<PersonaActor>) : boolean {
		let playerRoll = !game.user.isGM;
		if (user) {
			const roller = PersonaDB.findActor(user);
			if (roller?.isPC() || roller?.isNPCAlly()) {
				playerRoll = true;
			}
		}
    return playerRoll;
  }

	static #getDC<T extends ValidModListType>(situation: SituationComponent.RollParts.PreRoll, options: RollOptions<T>) : number | undefined {
		const {DCMods} = options;
		let {DC} = options;
    situation["rollTags"] = options.rollTags ?? [];
		if (DC != undefined && DCMods != undefined) {
			DC += this.getTotalOf(DCMods, situation) ?? 0;
			// const DCModsTotal = DCMods.total(situation);
			// DC += DCModsTotal;
		}
		return DC;
	}

  static getTotalOf(modList: ValidModListType, situation: SituationComponent.RollParts.PreRoll) : number {
    if (modList instanceof ModifierList) {
      return modList.total(situation);
    }
    return modList.eval(situation).total;
  }

  static addItem<T extends ValidModListType> (list: T, name: string, amount: number) : T {
    if (list instanceof ModifierList) {
      list.add(name, amount);
      return list;
    }
    list.add(0, amount, name);
    return list;
  }

  static mergeList<T extends ValidModListType>( list: T, otherList: T) : T {
    if (list instanceof ModifierList) {
      if ( otherList instanceof ModifierList) {
        return list.concat(otherList) as T;
      }
      throw new PersonaError("Merging two incompatible types", list, otherList);
    }
    if (list instanceof CalculationV2) {
      return list.merge(otherList as typeof list) as T;
    }
    return list.merge(otherList as Readonly<Calculation>) as T;
  }

  // static async #compileModifiers (options: RollOptions, ...existingMods: (ModifierList | undefined)[]) : Promise<ModifierList> {
  static async #compileModifiers <T extends ValidModListType>(options: RollOptions<T>, ...existingMods: (T | undefined)[]) : Promise<T> {
    //TODO switch this over to use the BonusCalculation instead of modifier list
    const blankList : T = this.generateBlankList(existingMods.at(0)) as T;
    let mods = existingMods
    .filter (x=> x != undefined)
    .reduce ( (acc, list) => this.mergeList(acc, list),
      blankList);
    // let mods = existingMods
    // .filter (x=> x != undefined)
    // .reduce ( (acc, list) => acc.concat(list),
    //   new ModifierList());
    if (options.askForModifier) {
      const customMod = await HTMLTools.getNumber("Custom Modifier") ?? 0;
      // mods.add("Custom modifier", customMod);
      this.addItem(mods, "Custom modifier", customMod);
    }
    if (options.modifier) {
      // mods.add("Modifier", options.modifier);
      this.addItem(mods, "Modifier", options.modifier);
    }
    if (options.modifierList) {
      mods = this.mergeList(mods, options.modifierList);
      // mods = mods.concat(options.modifierList);
    }
    return mods;
  }

  static generateBlankList<T extends ValidModListType | undefined>(item: T): T extends ValidModListType ? T : ModifierList {
  type ret= T extends ValidModListType ? T : ModifierList;
  if (item instanceof ModifierList) {
    return new ModifierList() as ret;
  }
  if (item instanceof Calculation) {
    return new Calculation() as ret;
  }
  if (item instanceof CalculationV2) {
    return new CalculationV2() as ret;
  }
  return new ModifierList() as ret;
}

  static async rollSocialStat(pc: PC, socialStat: SocialStat, options  : RollOptions): Promise<ResolvedRollBundle> {
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
    const resultFn = (DC: number, total:number) =>
      total >= DC +10 ? "crit"
      : total >= DC ? "hit"
      : "miss"
    ;
    const bundle = await this.#makeRoll(rollName, mods, situation, DC, resultFn);
    return bundle;
  }

  static async rollFlat <T extends ValidModListType>(actor: ValidAttackers, options: RollOptions<T>): Promise<ResolvedRollBundle> {
    const situation =  options.situation ? options.situation: {
      user: actor.accessor,
      DC: undefined,
      rollTags: [],
      addedTags: [],
      "rollType": "standard",
    } satisfies Situation;
    const rollTags = options.rollTags == undefined ? [] : options.rollTags.slice();
    situation.rollTags.pushUnique(...rollTags);
    rollTags.pushUnique("flat-roll");
    const mods = await this.#compileModifiers(options);
    const DC = this.#getDC(situation, options);
    const bundle = await this.#makeRoll("Flat Roll", mods, situation, DC);
    return bundle;
  }

  static async rollSave (actor: ValidAttackers, options: SaveOptions): Promise<ResolvedRollBundle> {
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
    return bundle;
  }

}

type RollOptions<ModList extends ValidModListType = ModifierList> = {
	label : string | undefined,
	DC: number | undefined,
	DCMods ?: ModList,
	// DCMods ?: ModifierList,
	askForModifier ?: boolean,
	modifier ?: number,
	rollTags : NonNullable<SituationComponent.RollParts.PreRoll["rollTags"]>,
	modifierList ?: ModList,
	situation ?: SituationComponent.RollParts.PreRoll,
}

type SaveOptions<ModList extends ValidModListType = ModifierList> = RollOptions<ModList> & {
	saveVersus?: StatusEffectId,
}

Hooks.on("renderChatMessageHTML", (_msg, html) => {
	if (!game.user.isGM) {
		$(html).find(".gm-only").hide();
	}
});



