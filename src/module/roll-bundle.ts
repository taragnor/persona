import { ResolvedModifierList } from "./combat/modifier-list.js"; import {Calculation} from "./utility/calculation.js";
import {CombatEngine} from "./combat/combat-engine.js";
import {checkSituationProp} from "./preconditions.js";
import { ModifierList } from "./combat/modifier-list.js";
import { PersonaError } from "./persona-error.js";
import {PersonaDB} from "./persona-db.js";
import {PersonaCombat} from "./combat/persona-combat.js";

abstract class RollBundleBase {
  name: string | ((b: RollBundle) => string);
  _playerRoll: boolean;
  roll: Roll;

  constructor (rollName: typeof this["name"] ,roll : Roll, playerRoll : boolean) {
    this._playerRoll = playerRoll;
    if (!roll._evaluated)
    {throw new Error("Can't construct a Roll bundle with unevaluated roll");}
    this.roll = roll;
    this.name = rollName;
  }

  setName(newName: typeof this["name"] ): void {
    this.name = newName;
  }

  get natural(): number { return this.dice[0].total; }
  get dice() { return this.roll.dice; }
  get gmRoll() : boolean { return !this._playerRoll; }
}

export class RollBundle extends RollBundleBase {
  private modList: {
    mods: ModifierList | Calculation;
    situation: SituationComponent.RollParts.PreRoll;
  };
  private DC ?: number | ((b: RollBundle) => number);
  _resultFn : U< ((DC: number, total: number, rb: RollBundle) => SituationTypes.Roll["result"])>;

  constructor (rollName: RollBundleBase["name"] ,roll : Roll, playerRoll : boolean,  modList : ModifierList | Calculation, situation : SituationTypes.PreRoll, DC : RollBundle["DC"]) {
    super(rollName, roll, playerRoll);
    if (!roll._evaluated)
    {throw new Error("Can't construct a Roll bundle with unevaluated roll");}
    this.modList = {
      mods: modList ?? new ModifierList(),
      situation: situation,
    };
    this.DC = DC;
  }

  setResultFn( resultFn: NonNullable<RollBundle["_resultFn"]>) {
    this._resultFn = resultFn;
  }

  resolve() : ResolvedRollBundle {
    const name = typeof this.name == "function" ? this.name(this): this.name;
    const resolved = this.resolveMods();
    const total = this.roll.total + resolved.modtotal;
    const situation = this.generateResolvedSituation(this.modList.situation, total);
    return new ResolvedRollBundle(name, this.roll, this._playerRoll, resolved, situation);
  }

  private resolveMods() : ResolvedRollBundle["modList"] {
    const {mods, situation} = this.modList;
    if (!situation)
    {throw new Error("Situation can't resolve");}
    if (mods instanceof ModifierList) {
      const total = mods.total(situation);
      const resolved =  {
        mods : mods.printable(situation),
        modtotal: total,
        actor: situation.user,
        resolvedSituation: this.generateResolvedSituation(situation, total),
      } satisfies ResolvedRollBundle["modList"];
      return resolved;
    } else {
      const resolved = mods.eval(situation);
      const resolvedMods = {
        modtotal: resolved.total,
        mods: resolved.steps,
        actor: situation.user,
        resolvedSituation: this.generateResolvedSituation(situation, resolved.total),
      } satisfies ResolvedRollBundle["modList"];
      return resolvedMods;
    }
  }

  resolveDC() : number {
    if (this.DC == undefined) {
      PersonaError.softFail("Roll DC is undefined", this);
      return -1;
    }
    if (typeof this.DC == "number") {return this.DC;}
    return this.DC(this);
  }

  private generateResolvedSituation(situation: SituationTypes.PreRoll, total: number) : SituationTypes.Roll {
    if (situation.user) {
      const rollTags = checkSituationProp(situation, "rollTags") ? situation.rollTags : [];
      const addedTags = checkSituationProp(situation, "addedTags") ? situation.addedTags : [];
      const DC = this.resolveDC();
      const rollSituation = {
        ...situation,
        naturalRoll: this.roll.total,
        rollTags: rollTags,
        addedTags: addedTags,
        rollTotal: this.roll.total + total,
        user: situation.user,
        DC,
        result: this.generateResult(DC, total),
      } satisfies SituationTypes.Roll;
      return rollSituation;
    }
    PersonaError.softFail("No user for this roll", situation);
    return situation as SituationTypes.Roll;
  }

  generateResult(DC : number, total:number) : SituationTypes.Roll["result"] {
    if (this._resultFn) {return this._resultFn(DC, total, this );}
    return DC < total ? "miss" : "hit";
  }

}


export class ResolvedRollBundle extends RollBundleBase {
  declare name: string;
  private modList: {
    mods: ResolvedModifierList;
    modtotal : number;
    actor: UniversalActorAccessor<ValidAttackers> | undefined;
    resolvedSituation: Omit<SituationTypes.Roll, "result"> & Partial<Pick<SituationTypes.Roll, "result">>;
  };

  private _resultSituation: SituationTypes.Roll;
  DC: number;

  constructor (name: string, roll: Roll, playerRoll:boolean, modList: ResolvedRollBundle["modList"], resultSituation: SituationTypes.Roll) {
    super (name, roll, playerRoll);
    this.modList = modList;
    this._resultSituation = resultSituation;
    this.DC = resultSituation.DC ?? -1;
  }

  get resultSituation() {
    return this._resultSituation;
  }

  async getHTML(showSuccess :boolean): Promise<string> {
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
    const actorAcc = this.modList.actor;
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

  get success() : boolean | undefined {
    return CombatEngine.isAnyHit(this.resultSituation);
  }

  get critical(): boolean | undefined {
    return CombatEngine.isCrit(this.resultSituation);
  }

  get total() : number {
    return this.roll.total + this.modList.modtotal;
  }

  get printableMods() : ResolvedModifierList {
    return this.modList.mods;
  }

}

// class RollBundle_old {
// 	roll: Roll;
// 	modList: UnresolvedMods | ResolvedMods;
// 	name: string | ((b: RollBundle) => string);
// 	DC ?: number;
// 	_playerRoll: boolean;

// 	constructor (rollName: typeof this["name"] ,roll : Roll, playerRoll : boolean,  modList ?: ModifierList | Calculation, situation ?: SituationTypes.PreRoll, DC ?: number) {
// 		this._playerRoll = playerRoll;
// 		if (!roll._evaluated)
// 		{throw new Error("Can't construct a Roll bundle with unevaluated roll");}
// 		this.roll = roll;
// 		this.modList = {
// 			mods: modList ?? new ModifierList(),
// 			situation: situation ?? null,
// 		};
// 		this.name = rollName;
// 		this.DC = DC;
// 	}

// 	// setName(newName: typeof this["name"] ): void {
// 	// 	this.name = newName;
// 	// }

// 	resolveMods() : ResolvedMods {
// 		if (typeof this.name == "function") {
// 			this.name = this.name(this);
// 		}
// 		if ("modtotal" in this.modList) {
// 			return this.modList;
// 		}
// 		const {mods, situation} = this.modList;
// 		if (!situation)
// 		{throw new Error("Situation can't resolve");}
// 		if (mods instanceof ModifierList) {
// 			const total = mods.total(situation);
// 			this.modList =  {
// 				mods : mods.printable(situation),
// 				modtotal: total,
// 				actor: situation.user,
// 				resolvedSituation: this.generateResolvedSituation(situation, total),
// 			} satisfies ResolvedMods;
// 			return this.modList;
// 		} else {
// 			const resolved = mods.eval(situation);
// 			this.modList = {
// 				modtotal: resolved.total,
// 				mods: resolved.steps,
// 				actor: situation.user,
// 				resolvedSituation: this.generateResolvedSituation(situation, resolved.total),
// 			} satisfies ResolvedMods;
// 			return this.modList;
// 		}
// 	}

// 	generateResolvedSituation(situation: SituationTypes.PreRoll, total: number): SituationTypes.Roll {
// 		if (situation.user) {
//       const rollTags = checkSituationProp(situation, "rollTags") ? situation.rollTags : [];
//       const addedTags = checkSituationProp(situation, "addedTags") ? situation.rollTags : [];
// 			const rollSituation = {
//         ...situation,
//         naturalRoll: this.roll.total,
//         rollTags: rollTags,
//         addedTags: addedTags,
//         rollTotal: this.roll.total + total,
//         user: situation.user,
//         DC: undefined,
//         result: this.getResult(total, DC),
//       } satisfies SituationTypes.Roll;
// 			return rollSituation;
// 		}
// 		PersonaError.softFail("No user for this roll", situation);
// 		return situation as SituationTypes.Roll;
// 	}


// getResult (

// set situation(sit: SituationTypes.PreRoll) {
// 	if ("modtotal" in this.modList) {
// 		throw new Error("can't change situation in resolved modList");
// 	}
// 	this.modList.situation = sit;
// }

// get situation() : Situation | null {
// 	if ("modtotal" in this.modList) {
// 		return this.modList.resolvedSituation;
// 	}
// 	return this.modList.situation;
// }

// 	resolvedSituation(this: RollBundle & {modList: ResolvedMods}) : ResolvedMods["resolvedSituation"] {
//     const resolved= this.resolveMods();
//     return resolved.resolvedSituation;
// 		// return this.modList.resolvedSituation;
// 	}

//   get success() : boolean | undefined {
//     const resolved= this.resolveMods();
//     return CombatEngine.isAnyHit(resolved.resolvedSituation);
//     // if ("modtotal" in this.modList) {
//     // 	return CombatEngine.isAnyHit(this.modList.resolvedSituation);
//     // }

//   }

// 	get critical(): boolean | undefined {
//     const resolved= this.resolveMods();
//     return CombatEngine.isCrit(resolved.resolvedSituation);
// 		// if ("modtotal" in this.modList) {
// 		// 	return CombatEngine.isCrit(this.modList.resolvedSituation);
// 		// }
  // 	}

  // 	get natural(): number {
// 		return this.dice[0].total;
// 	}

// 	get dice() {
// 		return this.roll.dice;
  // 	}

// 	get total() : number {
  // 		try {
// 			if (!this.roll._evaluated)
  // 				{throw new Error("Roll isn't evaluated");}
// 			this.resolveMods();
// 			if ("situation" in this.modList) {
// 				throw new PersonaError("Mod List not resolved");
// 			}
// 			return this.roll.total + this.modList.modtotal;
// 		} catch {
// 			return -999;
// 		}
// 	}

// 	// async getHTML(showSuccess :boolean): Promise<string> {
// 	// 	this.resolveMods();
// 	// 	if ("situation" in this.modList) {
  // 	// 		throw new PersonaError("Mod List not resolved");
  // 	// 	}
// 	// 	if (this.DC == 0) {
// 	// 		PersonaError.softFail("DC of 0 in roll", this);
  // 	// 		// debugger;
  // 	// 	}
// 	// 	const html = await foundry.applications.handlebars.renderTemplate("systems/persona/parts/simple-roll.hbs", {roll: this, showSuccess});
// 	// 	return html;
// 	// }

// 	// async toModifiedMessage(showSuccess : boolean) : Promise<ChatMessage> {
  // 	// 	const html = await this.getHTML(showSuccess);
  // 	// 	const actorAcc = (this.modList as ResolvedMods).actor;
  // 	// 	let speaker: Foundry.ChatSpeakerObject;
  // 	// 	if (actorAcc) {
// 	// 		const actor  = PersonaDB.findActor(actorAcc);
// 	// 		// let token : PToken | undefined;
// 	// 		const token = PersonaCombat.getPTokenFromActorAccessor(actor.accessor);
// 	// 		speaker = {
// 	// 			actor: token?.actor?.id ?? actor.id,
// 	// 			token: token?.id,
// 	// 			alias: token?.name,
// 	// 		};
// 	// 	} else {
// 	// 		speaker = {alias: "System"};
// 	// 	}
// 	// 	const msg = await ChatMessage.create({
// 	// 		speaker,
// 	// 		content: html,
// 	// 		user: game.user,
// 	// 		style: CONST.CHAT_MESSAGE_STYLES.OOC,
// 	// 		rolls: [this.roll],
// 	// 		sound: CONFIG.sounds.dice
// 	// 	}, {});
// 	// 	return msg;
// 	// }

// 	get printableMods() : ResolvedModifierList {
// 		if ("situation" in this.modList) {
// 			return this.resolveMods().mods;
// 		}
// 		return this.modList.mods;
// 	}

// 	get result(): string {
// 		return this.total.toString();
// 	}
// }


// type UnresolvedMods = {
// 	mods: ModifierList | Calculation,
// 	situation: SituationComponent.RollParts.PreRoll | null,
// }

// type ResolvedMods = {
// 	mods: ResolvedModifierList,
// 	modtotal : number,
// 	actor: UniversalActorAccessor<ValidAttackers> | undefined,
// 	resolvedSituation: Omit<SituationTypes.Roll, "result"> & Partial<Pick<SituationTypes.Roll, "result">>;
// };


