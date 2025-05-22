import { StatusEffectId } from "../config/status-effects.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { ModifierList } from "./combat/modifier-list.js";
import { ModifierContainer } from "./item/persona-item.js";
import { ModifierTarget } from "../config/item-modifiers.js";
import { PersonaError } from "./persona-error.js";
import { localize } from "./persona.js";
import { STATUS_EFFECT_TRANSLATION_TABLE } from "../config/status-effects.js";
import { RESIST_STRENGTH_LIST } from "../config/damage-types.js";
import { getActiveConsequences } from "./preconditions.js";
import { PersonaI } from "../config/persona-interface.js";
import { DamageType } from "../config/damage-types.js";
import { ResistStrength } from "../config/damage-types.js";
import {ValidAttackers} from "./combat/persona-combat.js";
import {Power, Talent, Focus} from "./item/persona-item.js";

export class Persona<T extends ValidAttackers = ValidAttackers> implements PersonaI {
	user: T;
	source: ValidAttackers;
	powers: Power[];

	static leveling = {
		SHADOWS_TO_LEVEL: 10,
		BASE_XP: 600, // XP FOR FIRST LEVEL UP
		XP_GROWTH: 200, //added XP for additional level ups
	}

	constructor (source: ValidAttackers, user: T, powers: Power[]) {
		this.user = user;
		this.source = source;
		this.powers = powers;
	}

	get statusResists() : ValidAttackers["system"]["combat"]["statusResists"] {
		return this.source.system.combat.statusResists;
	}

	get resists(): ValidAttackers["system"]["combat"]["resists"] {
		return this.source.system.combat.resists;
	}

	get classData(): ValidAttackers["system"]["combat"]["classData"] {
		return this.source.system.combat.classData;
	}

	get focii(): Focus[] {
		return this.source.focii;
	}

	get talents(): Talent[] {
		return this.source.talents;
	}

	get name(): string {
		switch (this.source.system.type) {
			case "pc":
			case "npcAlly":
				return this.source.system.personaName;
			case "shadow":
				return this.source.name;
			default:
				this.source.system satisfies never;
				return "ERROR";
		}
	}

	get XPForNextLevel() : number {
		return this.source.XPForNextLevel;
	}

	get scanLevel(): number {
		const user = this.user;
		const source = this.source;
		if (game.user.isGM) return 3;
		if (user.hasPlayerOwner) {
			return 3;
		}
		if (source.isShadow()) {
			return source.system.scanLevel ?? 0;
		}
		return 0;
	}

	get xp(): number {
		return this.source.system.combat.xp;
	}


	equals(other: Persona<any>) : boolean {
		return this.source == other.source;
	}

	get level() : number {
		return this.classData.level;
	}

	/** return true on level up*/
	async awardXP(amt: number): Promise<boolean> {
		if (!amt) {
			return false;
		}
		if (Number.isNaN(amt)) {
			PersonaError.softFail(`Attempting to add NaN XP to ${this.name}, aborted`);
			return false;
		}
		const sit: Situation = {
			...this.baseSituation,
		};
		amt = amt * this.getBonuses("xp-multiplier").total(sit, "percentage");

		if (amt <= 0) {
			PersonaError.softFail(`Could be an error as XP gained is now ${amt}`);
			return false;
		}
		let levelUp = false;
		const XPrequired= this.XPForNextLevel;
		let newxp = this.xp + amt;
		while (newxp > XPrequired) {
			newxp -= XPrequired;
			levelUp = true;
		}
		await this.source.update({"system.combat.xp" : newxp});
		return levelUp;
	}

	get baseSituation() : Required<Pick<Situation, "user" | "persona">> {
		return {
			user: this.user.accessor,
			persona: this,
		}
	}

	getBonuses (modnames : ModifierTarget | ModifierTarget[], sources: ModifierContainer[] = this.mainModifiers() ): ModifierList {
		let modList = new ModifierList( sources.flatMap( item => item.getModifier(modnames, this.source)
			.filter( mod => mod.modifier != 0 || mod.variableModifier.size > 0)
		));
		return modList;
	}

	mainModifiers(options?: {omitPowers?: boolean} ): ModifierContainer[] {
		const user = this.user;
		// const source = this.source;
		const roomModifiers = PersonaCombat.getRoomModifiers(this);
		const passivePowers = (options && options.omitPowers) ? [] : this.passivePowers();
		return [
			...this.passiveFocii(),
			...this.talents,
			...passivePowers,
			...user.actorMainModifiers(),
			...roomModifiers,
			...PersonaDB.getGlobalModifiers(),
			...PersonaDB.navigatorModifiers(),
		].filter( x => x.getEffects(this.user).length > 0);
	}

	passivePowers() : Power[] {
	return this.powers
		.filter( power=> power.system.subtype == "passive");
	}

	passiveFocii() : Focus[] {
		return this.focii.filter( f=> !f.system.defensive);
	}

	defensiveFocii(): Focus[] {
		return this.focii.filter( f=> f.system.defensive);
	}

	elemResist(type: Exclude<DamageType, "by-power">): ResistStrength {
		switch (type) {
			case "untyped":  case "none":
			case "all-out":
				return "normal";
			case "healing":
				return "absorb";
		}

		const baseResist = this.resists[type] ?? "normal";
		const effectChangers=  this.user.mainModifiers().filter( x=> x.getEffects(this.user)
			.some(x=> x.consequences
				.some( cons=>cons.type == "raise-resistance" || cons.type == "lower-resistance")));
		const situation : Situation = {
			user: this.user.accessor,
			target: this.user.accessor,
		};
		const consequences = effectChangers.flatMap(
			item => item.getEffects(this.user).flatMap(eff =>
				getActiveConsequences(eff, situation, item)
			)
		);
		const resval = (x: ResistStrength): number => RESIST_STRENGTH_LIST.indexOf(x);
		let resBonus = 0;
		let resPenalty = 0;
		for (const cons of consequences) {
			switch (cons.type) {
				case "raise-resistance":
					if (cons.resistType == type &&
						resval(cons.resistanceLevel!) > resval(baseResist)) {
						resBonus = Math.max(resBonus, resval(cons.resistanceLevel!) - resval(baseResist))
					}
					break;
				case "lower-resistance":
					if (cons.resistType == type &&
						resval (cons.resistanceLevel!) < resval(baseResist))  {
						resPenalty = Math.min(resPenalty, resval(cons.resistanceLevel!) - resval(baseResist))
					}
					break;
				default:
					break;
			}
		}
		const resLevel = Math.clamp(resval(baseResist) + resBonus + resPenalty, 0 , RESIST_STRENGTH_LIST.length-1);
		return RESIST_STRENGTH_LIST[resLevel];
	}

	static combinedPersona<T extends ValidAttackers>(basePersona: Persona<T>, attachedPersona: Persona<any>) : Persona<T> {
		const fusedPowers = attachedPersona.powers.concat(
			basePersona.powers);
		fusedPowers.length = Math.min(6, fusedPowers.length);
		const fusedPersona = new Persona(attachedPersona.source, attachedPersona.user, fusedPowers);
		fusedPersona.user = basePersona.user;
		fusedPersona.source = attachedPersona.source;
		return fusedPersona;
	}

	get isBasePersona(): boolean {
		return this.source == this.user;
	}

	get printableResistanceString() : string {
		const resists = this.statusResists;
		const retdata = Object.entries(resists)
			.map(([statusRaw, _level]) => {
				const actual = this.statusResist(statusRaw as StatusEffectId);
				const statusTrans = localize(STATUS_EFFECT_TRANSLATION_TABLE[statusRaw as StatusEffectId]);
				if (statusTrans == undefined) {
					debugger;
					return "";
				}
				switch (actual) {
					case "resist": return `Resist ${statusTrans}`;
					case "absorb":
					case "reflect":
					case "block": return `Block ${statusTrans}`;
					default: return "";
				}
			})
			.filter( x=> x.length > 0)
			.join(", ");
		return retdata;
	}

	statusResist(status: StatusEffectId) : ResistStrength {
		return this.user.statusResist(status);
	}


}
