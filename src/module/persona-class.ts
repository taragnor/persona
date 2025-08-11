import { PersonaSettings } from "../config/persona-settings.js";
import { ELEMENTAL_DEFENSE_LINK } from "../config/damage-types.js";
import { Metaverse } from "./metaverse.js";
import { UniversalModifier } from "./item/persona-item.js";
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
	_powers: Power[];
	#cache: PersonaClassCache;

	static leveling = {
		SHADOWS_TO_LEVEL: 10,
		BASE_XP: 600, // XP FOR FIRST LEVEL UP
		XP_GROWTH: 200, //added XP for additional level ups
	}

	constructor (source: ValidAttackers, user: T, powers: Power[]) {
		this.user = user;
		this.source = source;
		this._powers = powers;
		this.resetCache();
	}

	resetCache() {
		this.#cache = {
			mainModifiers: undefined,
		};
	}

	get powers() : Power[] {
		return this.mainPowers.concat(this.user.bonusPowers);
	}

	get mainPowers(): Power[] {
		return this._powers;
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
	if (levelUp ) {
		if (this.user.isNPCAlly() || this.user.isShadow())
			await this.source.levelUp_Incremental();
	}
		return levelUp;
	}

	get baseSituation() : Required<Pick<Situation, "user" | "persona">> {
		return {
			user: this.user.accessor,
			persona: this,
		}
	}


	isEligibleToBecomeDMon() : boolean {
		const source = this.source;
		if (source.hasRole(["boss", "miniboss", "treasure-shadow", "duo", "solo", "summoner"])) return false;
		if (source.system.creatureType != "shadow" && source.system.creatureType != "daemon") return false;
		if (source.hasCreatureTag("pure-shadow")) return false;
		return true;
	}

	isEligibleToBecomePersona(): boolean {
		const source = this.source;
		if (!source.isShadow()) return false;
		if (source.system.creatureType == "daemon") return false;
		if (this.isPersona()) return true;
		if (this.isDMon()) return true;
		return this.isEligibleToBecomeDMon();
	}

	isPersona(): boolean {
		const source = this.source;
		if (source.isPC() || source.isNPCAlly()) return true;
		if (source.system.creatureType == "persona") return true;
		return false;
	}

	isDMon() : boolean {
		const source = this.source;
		if (source.system.creatureType == "d-mon") return true;
		if (source.isShadow() && source.hasCreatureTag("d-mon")) return true;
		return false;
	}

	numOfWeaknesses(): number {
		return Object.values(this.resists)
			.reduce( (acc, res) =>  acc + (res == "weakness" ? 1 : 0) ,0);
	}

	numOfIncAdvances(): number {
		return this.source.numOfIncAdvances();
	}

	getBonuses (modnames : ModifierTarget | ModifierTarget[], sources: ModifierContainer[] = this.mainModifiers() ): ModifierList {
		let modList = new ModifierList( sources.flatMap( item => item.getModifier(modnames, this.source)
			.filter( mod => mod.modifier != 0 || mod.variableModifier.size > 0)
		));
		return modList;
	}

	mainModifiers(options?: {omitPowers?: boolean} ): ModifierContainer[] {
		//NOTE: this could be a risky operation
		const PersonaCaching = PersonaSettings.get("aggressiveCaching");
		if (!options && this.#cache.mainModifiers) {
			return this.#cache.mainModifiers;
		}
		const user = this.user;
		const roomModifiers : UniversalModifier[] = []; 
		if (game.combat) {
			roomModifiers.push(...PersonaCombat.getRoomModifiers(this));
		} else {
			roomModifiers.push(...(Metaverse.getRegion()?.allRoomEffects ?? []));
		}
		const passivePowers = (options && options.omitPowers) ? [] : this.passivePowers();
		const mainMods = [
			...this.passiveFocii(),
			...this.talents,
			...passivePowers,
			...user.actorMainModifiers(),
			...roomModifiers,
			...PersonaDB.getGlobalModifiers(),
			...PersonaDB.navigatorModifiers(),
		].filter( x => x.getEffects(this.user).length > 0);
		this.#cache.mainModifiers = mainMods;
		return mainMods;
	}

	passivePowers() : Power[] {
	return this.powers
		.filter( power=> power.isPassive());
	}

	get effectiveLevel() : number {
	const advances = this.numOfIncAdvances();
	const maxIncAdvances = this.maxIncrementalAdvances();
	const valPerAdvance = 1 / maxIncAdvances;
	return this.source.system.combat.classData.level + (valPerAdvance * advances);
	}

	maxIncrementalAdvances(): number {
		return this.source.maxIncrementalAdvances();
	}

	/* Base XP for one shadow of equal power **/
	static get BaselineXP(): number {
	const SHADOWS_TO_LEVEL = Persona.leveling.SHADOWS_TO_LEVEL;
	const firstLevelUp = Persona.leveling.BASE_XP;
	return firstLevelUp/SHADOWS_TO_LEVEL;
	}

	static MIN_XP_MULT = 0.05;
	static MAX_XP_MULT = 3;

	calcXP(killedTargets: ValidAttackers[], numOfAllies: number): number {
	const XPSubtotal = killedTargets.reduce ((acc, target) => {
		if (!target.isShadow()) return acc;
		const levelDifference = target.persona().effectiveLevel - this.effectiveLevel;
		const rawXPMult= 1 + (levelDifference * 0.75)
		const XPMult= Math.clamp(rawXPMult, Persona.MIN_XP_MULT, Persona.MAX_XP_MULT);
		const realXP = Persona.BaselineXP * XPMult;
		return acc + realXP;
	}, 0);

		return Math.round(XPSubtotal / numOfAllies);
	}

	get baseInitRank() : ValidAttackers["system"]["combat"]["initiative"] {
		return this.source.system.combat.initiative;
	}

	get combatInit(): number {
		const inc = this.classData.incremental.initiative;
		const situation = {user: this.user.accessor};
		const initBonus = this
			.getBonuses("initiative")
			.total(situation);
		const level  = this.classData.level;
		const initScore = this.#translateInitString(this.baseInitRank);
		return initBonus + (inc * 2) + (level * 4) + initScore;
	}

	#translateInitString(initString: ValidAttackers["system"]["combat"]["initiative"]): number {
		switch (initString) {
			case "pathetic": return -8;
			case "weak": return -4;
			case "normal": return 0;
			case "strong": return 4;
			case "ultimate": return 8;
			default:
				initString satisfies never;
				return -999;
		}
	}

	getDefense(defense: keyof ValidAttackers["system"]["combat"]["defenses"]) : ModifierList {
		const mods = new ModifierList();
		const lvl = this.level;
		const baseDef = this.#translateDefenseString(defense, this.defenses[defense]);
		const inc = this.classData.incremental.defense;
		mods.add("Base", 10);
		mods.add("Base Defense Bonus", baseDef);
		mods.add("Level Bonus (x2)", lvl * 2);
		mods.add("Incremental Advance" , inc);
		const otherBonuses = this.getBonuses([defense, "allDefenses"]);
		const defenseMods = this.getBonuses([defense, "allDefenses"], this.user.defensivePowers());
		return mods.concat(otherBonuses).concat(defenseMods);

	}

	#translateDefenseString(defType: keyof ValidAttackers["system"]["combat"]["defenses"], val: ValidAttackers["system"]["combat"]["defenses"]["fort"],): number {
		const weaknesses= this.#getWeaknessesInCategory(defType);
		switch (val) {
			case "pathetic": return Math.min(-6 + 2 * weaknesses,-2) ;
			case "weak": return Math.min(-3 + 1 * weaknesses, -1);
			case "normal": return 0;
			case "strong": return Math.max(3 - 1 * weaknesses, 1);
				case "ultimate": return Math.max(6 - 2 * weaknesses, 2);
			default:
				PersonaError.softFail(`Bad defense tsring ${val} for ${defType}`);
				return -999;
		}
	}

	#getWeaknessesInCategory( defType: keyof ValidAttackers["system"]["combat"]["defenses"]): number {
		const damageTypes = ELEMENTAL_DEFENSE_LINK[defType];
		const weaknesses= damageTypes.filter( dt => this.resists[dt] == "weakness")
		return weaknesses.length;
	}

		get defenses(): ValidAttackers["system"]["combat"]["defenses"] {
			return this.source.system.combat.defenses;
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
		//caching trick to try to save time
		const mods = this.mainModifiers();
		return this.user.statusResist(status, mods);
	}




}


interface PersonaClassCache {
	mainModifiers: U<ModifierContainer[]>;
}
