import { HTMLTools } from "./utility/HTMLTools.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaDB } from "./persona-db.js";
import { SocialStat } from "../config/student-skills.js";
import { STUDENT_SKILLS } from "../config/student-skills.js";
import {ResolvedRollBundle, RollBundle} from "./roll-bundle.js";
import {StatusEffectId} from "../config/status-effects.js";
import {PersonaActor} from "./actor/persona-actor.js";


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

	static async #makeRoll(rollName:string, mods: ModifierList, situation: SituationComponent.RollParts.PreRoll, DC : RollBundle["DC"], resultFn ?: RollBundle["_resultFn"]): Promise<ResolvedRollBundle> {
	// static async #makeRoll(...args: ConstructorParameters<typeof RollBundle>): Promise<ResolvedRollBundle> {
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
    const resultFn = (DC: number, total:number) => {
      if (total >= DC + 10) {
        return "crit";
      }
      if (total >= DC) {
        return "hit";
      }
      return "miss";
    };
    const bundle = await this.#makeRoll(rollName, mods, situation, DC, resultFn);
    // const resSit = bundle.resultSituation;
    // let result : SituationTypes.Roll["result"] = "miss";
    // if (DC != undefined) {
    //   if (resSit.rollTotal >= DC) {
    //     result = "hit";
    //   }
    //   if (resSit.rollTotal >= DC + 10) {
    //     result = "crit";
    //   }
    // }
    // resSit["result"] = result;
    ////@ts-expect-error adding prop to situation
    // resSit["usedSkill"] = socialStat;
    // const sitFilledIn = {
    //   ...resSit,
    //   result,
    //   usedSkill: socialStat,
    // };
    // await pc.onRoll(resSit);
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
    // const resSit = bundle.resultSituation;
    // let result : "miss" | "hit" = "miss";
    //if (DC != undefined) {
    //  if (resSit.rollTotal >= DC) {
    //    result = "hit";
    //  }
    //  // resSit.hit = resSit.rollTotal >= DC;
    //  // resSit.criticalHit = false;
    //}
    //resSit["result"] = result;
    ////@ts-expect-error adding prop to situation
    //resSit["saveVersus"] = options.saveVersus ?? null;
    //const filledInRes = {
    //  ...resSit,
    //  result,
    //  saveVersus: options.saveVersus ?? null,
    //};
    // await actor.onRoll(filledInRes);
    return bundle;
  }

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

type SaveOptions = RollOptions & {
	saveVersus?: StatusEffectId,
}

Hooks.on("renderChatMessageHTML", (_msg, html) => {
	if (!game.user.isGM) {
		$(html).find(".gm-only").hide();
	}
});


