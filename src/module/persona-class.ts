import { ELEMENTAL_DEFENSE_LINK } from "../config/damage-types.js";
import { LevelUpCalculator } from "../config/level-up-calculator.js";
import { PersonaCombatStats } from "./actor/persona-combat-stats.js";
import { NonDeprecatedModifierType } from "../config/item-modifiers.js";
import { Consumable, InvItem, PersonaItem } from "./item/persona-item.js";
import { Logger } from "./utility/logger.js";
import { removeDuplicates } from "./utility/array-tools.js";
import { Shadow } from "./actor/persona-actor.js";
import { NPCAlly } from "./actor/persona-actor.js";
import { PC } from "./actor/persona-actor.js";
import { UsableAndCard } from "./item/persona-item.js";
import { PersonaSettings } from "../config/persona-settings.js";
import { Metaverse } from "./metaverse.js";
import { UniversalModifier } from "./item/persona-item.js";
import { StatusEffectId } from "../config/status-effects.js";
import { PersonaDB } from "./persona-db.js";
import { PersonaCombat } from "./combat/persona-combat.js";
import { ModifierList } from "./combat/modifier-list.js";
import { ModifierContainer } from "./item/persona-item.js";
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
import {PersonaTag} from "../config/creature-tags.js";
import {Defense} from "../config/defense-types.js";
import {DamageCalculator, NewDamageParams} from "./combat/damage-calc.js";

export class Persona<T extends ValidAttackers = ValidAttackers> implements PersonaI {
	#combatStats: U<PersonaCombatStats>;
	user: T;
	source: ValidAttackers;
	_powers: Power[];
	#cache: PersonaClassCache;

	static leveling = {
		SHADOWS_TO_LEVEL: 10,
		BASE_XP: 600, // XP FOR FIRST LEVEL UP
		XP_GROWTH: 200, //added XP for additional level ups
	};

	constructor (source: ValidAttackers, user: T, powers: Power[]) {
		this.user = user;
		this.source = source;
		this._powers = powers;
		this.resetCache();
	}

	resetCache() {
		this.#cache = {
			mainModifiers: undefined,
			passivePowers: undefined,
			defensivePowers : undefined,
		};
	}


	get img() : string {
		return this.source.img;
	}

	get powers() : readonly Power[] {
		return this.mainPowers.concat(this.bonusPowers);
	}

	get activeCombatPowers() : readonly Power[] {
		return this.powers.filter( pwr => pwr.system.subtype == "magic" || pwr.system.subtype == "weapon");
	}

	get bonusPowers() : readonly Power [] {
		const bonusPowers : Power[] =
			this.mainModifiers({omitPowers:true})
			.filter(trait => trait.grantsPowers())
			.flatMap(powerGranter=> powerGranter.getGrantedPowers(this.user))
			.sort ( (a,b)=> a.name.localeCompare(b.name)) ;
		return removeDuplicates(bonusPowers);
	}

	get mainPowers(): Power[] {
		return this._powers;
	}

	get statusResists() : Readonly<ValidAttackers["system"]["combat"]["statusResists"]> {
		return this.source.system.combat.statusResists;
	}

	get resists(): Readonly<ValidAttackers["system"]["combat"]["resists"]> {
		return this.source.system.combat.resists;
	}

	get classData(): Readonly<ValidAttackers["system"]["combat"]["classData"]> {
		return this.source.system.combat.classData;
	}

	get focii(): readonly Focus[] {
		return this.source.focii;
	}

	get talents() : readonly Talent[] {
		return this.source.system.combat.talents
			.map( id => PersonaDB.getItemById<Talent>(id))
			.filter( tal => tal != undefined);
	}

	getTalentLevel(talent: Talent | Talent["id"]) : number {
		const id = talent instanceof PersonaItem ? talent.id : talent;
		const source = this.source;
		const talents = source.system.combat.talents;
		let index = talents.indexOf(id);
		if (index == -1) {return 0;}
		const inc = source.system.combat.classData.incremental.talent ? 1 : 0;
		const convertedLevel = Math.floor(this.level/10) + 1;
		const effectiveLevel = Math.max(0, convertedLevel + inc -1);
		const baseVal = Math.floor(effectiveLevel / 3);
		const partial = effectiveLevel % 3;
		index = index >= 2 ? 2 : index;
		if (index < partial) {
			return baseVal + 1;
		}
		return baseVal;
	}

	get name(): string {
		switch (this.source.system.type) {
			case "pc":
			case "npcAlly":
				return this.source.system.personaName ?? this.source.displayedName;
			case "shadow":
					return this.source.displayedName;
			default:
					this.source.system satisfies never;
				return "ERROR";
		}
	}

	get displayedName(): string {
		return this.name;
	}

	get unspentStatPoints() : number {
		return this.combatStats.unspentStatPoints();
	}

	get XPForNextLevel() : number {
		return LevelUpCalculator.XPRequiredToAdvanceToLevel(this.level +1);
		// return this.source.XPForNextLevel;
	}

	get xp(): number {
		return this.source.system.combat.personaStats.xp - LevelUpCalculator.minXPForEffectiveLevel(this.level);
	}

	get scanLevel(): number {
		const user = this.user;
		const source = this.source;
		if (game.user.isGM) {return 3;}
		if (source.hasPlayerOwner && user.hasPlayerOwner) {
			return 3;
		}
		const permission = Math.min(source.permission, user.permission);
		if (permission >= 2) {return 3;}
		if (source.isShadow()) {
			return source.system.scanLevel ?? 0;
		}
		return 0;
	}

	critResist(): ModifierList {
		const ret = new ModifierList();
		const mods = this.mainModifiers().flatMap( item => item.getModifier("critResist", this.user));
		const list =  ret.concat(new ModifierList(mods));
		list.add("Luck Bonus", this.combatStats.lukCriticalResist());
		return list;
	}

	critBoost() : ModifierList {
		const mods = this.mainModifiers().flatMap( item => item.getModifier("criticalBoost", this.user));
		const list= new ModifierList(mods);
		list.add("Luck Bonus", this.combatStats.lukCriticalBoost());
		return list;
	}

	equals(other: Persona) : boolean {
		return this.source == other.source;
	}

	get level() : number {
		// return this.classData.level;
		return this.source.system.combat.personaStats.pLevel ?? 0;
	}

	/** return leveled Persona on level up*/
	async awardXP(amt: number, allowMult = true): Promise<U<Persona>> {
		if (!amt) {
			return undefined;
		}
		if (Number.isNaN(amt)) {
			PersonaError.softFail(`Attempting to add NaN XP to ${this.name}, aborted`);
			return undefined;
		}
		amt = Math.floor(amt);
		const sit: Situation = {
			...this.baseSituation,
		};
		if (allowMult) {
			const XPMult = this.getBonuses("xp-multiplier").total(sit, "percentage") ?? 1;
			amt = amt * XPMult;
		}
		if (amt <= 0) {
			PersonaError.softFail(`Could be an error as XP gained is now ${amt}`);
			return undefined;
		}
		let levelUp = false;
		const currXP  = this.source.system.combat.personaStats.xp;
		const newXP = currXP + amt;
		let newLevel = this.level;
		while (newXP >= LevelUpCalculator.minXPForEffectiveLevel(newLevel +1)) {
			newLevel += 1;
		}
		if (newLevel > this.level) {
			levelUp = true;
			//TODO: FINISH THIS
			// await this.source.onLevelUp_BasePersona(newLevel);
		}
		await this.source.update({
			"system.combat.personaStats.xp" : newXP,
			"system.combat.personaStats.pLevel" : newLevel
		});
		// await this.source.update({"system.combat.xp" : newxp});
		if (levelUp ) {
			// const newLevel = 1; //placeholder
			await this.source.onLevelUp_BasePersona(newLevel);
		}
		return levelUp ? this : undefined;
	}

	get baseSituation() : Required<Pick<Situation, "user" | "persona">> {
		return {
			user: this.user.accessor,
			persona: this,
		};
	}


	get pLevel() : number {
		return this.source.system.combat.personaStats.pLevel;
	}

	isEligibleToBecomeDMon() : boolean {
		const source = this.source;
		if (source.hasRole(["boss", "miniboss", "treasure-shadow", "duo", "solo", "summoner"])) {return false;}
		if (source.system.creatureType != "shadow" && source.system.creatureType != "daemon") {return false;}
		if (source.hasCreatureTag("pure-shadow")) {return false;}
		return true;
	}

	isEligibleToBecomePersona(): boolean {
		const source = this.source;
		if (!source.isShadow()) {return false;}
		if (source.system.creatureType == "daemon") {return false;}
		if (this.isPersona()) {return true;}
		if (this.isDMon()) {return true;}
		return this.isEligibleToBecomeDMon();
	}

	isPersona(): boolean {
		const source = this.source;
		if (source.isPC() || source.isNPCAlly()) {return true;}
		if (source.system.creatureType == "persona") {return true;}
		return false;
	}

	isDMon() : boolean {
		const source = this.source;
		if (source.system.creatureType == "d-mon") {return true;}
		if (source.isShadow() && source.hasCreatureTag("d-mon")) {return true;}
		return false;
	}

	numOfWeaknesses(): number {
		return Object.values(this.resists)
			.reduce( (acc, res) =>  acc + (res == "weakness" ? 1 : 0) ,0);
	}

	numOfIncAdvances(): number {
		return this.source.numOfIncAdvances();
	}

	getBonuses (modnames : NonDeprecatedModifierType | NonDeprecatedModifierType[], sources: readonly ModifierContainer[] = this.mainModifiers() ): ModifierList {
		const modList = new ModifierList( sources.flatMap( item => item.getModifier(modnames, this.source)
			.filter( mod => mod.modifier != 0 || mod.variableModifier.size > 0)
		));
		return modList;
	}

	mainModifiers(options?: {omitPowers?: boolean} ): readonly ModifierContainer[] {
		//NOTE: this could be a risky operation
		const PersonaCaching = PersonaSettings.agressiveCaching();
		if (!options && PersonaCaching && this.#cache.mainModifiers) {
			return this.#cache.mainModifiers;
		}
		const user = this.user;
		const roomModifiers : UniversalModifier[] = [];
		if (game.combat) {
			roomModifiers.push(...PersonaCombat.getRoomModifiers(this));
		} else {
			roomModifiers.push(...(Metaverse.getRegion()?.allRoomEffects ?? []));
		}
		const passiveOrTriggeredPowers = (options && options.omitPowers) ? [] : this.passiveOrTriggeredPowers();
		const mainMods = [
			...this.passiveFocii(),
			...this.talents,
			...passiveOrTriggeredPowers,
			...user.actorMainModifiers(),
			...roomModifiers,
			...PersonaDB.getGlobalPassives(),
			// ...PersonaDB.getGlobalModifiers(),
			...PersonaDB.navigatorModifiers(),
		].filter( x => x.getEffects(this.user).length > 0);
		if (!options) {
			this.#cache.mainModifiers = mainMods;
		}
		return mainMods;
	}

	passiveOrTriggeredPowers() : readonly Power[] {
		const PersonaCaching = PersonaSettings.agressiveCaching();
		if (!this.#cache.passivePowers || !PersonaCaching) {
			this.#cache.passivePowers = this.powers
				.filter( power=> power.hasPassiveEffects(this.user) || power.hasTriggeredEffects(this.user));
		}
		return this.#cache.passivePowers;
	}

	defensiveModifiers(): readonly ModifierContainer[] {
		const PersonaCaching = PersonaSettings.agressiveCaching();
		if (!this.#cache.defensivePowers || !PersonaCaching) {
			this.#cache.defensivePowers =
				[
					//can't do this yet becuase it mixes defensives and passives in main
					// ...PersonaDB.getGlobalDefensives(),
					...this.user.userDefensivePowers(),
					...this.defensiveFocii(),
					...this.powers,
				].filter( power=> power.hasDefensiveEffects(this.user));
		}
		return this.#cache.defensivePowers;

	}

	async addTalent(talent: Talent) {
		const source = this.source;
		const arr = source.system.combat.talents;
		arr.push(talent.id);
		await source.update( {"system.combat.talents": arr});
		await Logger.sendToChat(`${this.name} added ${talent.name} Talent` , source);
	}

	async deleteTalent(id: string) {
		const source = this.source;
		const talent = PersonaDB.getItemById<Talent>(id);
		if (!talent) {throw new PersonaError(`No such talent ${id}`);}
		const arr = source.system.combat.talents
			.filter(x=> x != id);
		await source.update( {"system.combat.talents": arr});
		await Logger.sendToChat(`${this.name} deleted ${talent.name} Talent` , source);
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
		const XP= killedTargets.reduce( (a,x) => x.XPValue() + a, 0);
		return Math.floor(XP / numOfAllies);
		// const XPSubtotal = killedTargets.reduce ((acc, target) => {
		// 	if (!target.isShadow()) return acc;
		// 	const levelDifference = target.persona().effectiveLevel - this.effectiveLevel;
		// 	const rawXPMult= 1 + (levelDifference * 0.75)
		// 	const XPMult= Math.clamp(rawXPMult, Persona.MIN_XP_MULT, Persona.MAX_XP_MULT);
		// 	const realXP = Persona.BaselineXP * XPMult;
		// 	return acc + realXP;
		// }, 0);

		// return Math.round(XPSubtotal / numOfAllies);
	}

	get baseInitRank() : ValidAttackers["system"]["combat"]["initiative"] {
		return this.source.system.combat.initiative;
	}

	get combatInit(): number {
		// const inc = this.classData.incremental.initiative;
		const situation = {user: this.user.accessor};
		const initBonus = this
			.getBonuses("initiative")
			.total(situation);
		const agi = this.combatStats.baseInit();
		const initMod = 0;
		// const initMod = this.#translateInitString(this.baseInitRank);
		return initBonus + agi + initMod;
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

	printableDefenseMods( defense: Defense) {
		const def = this.getDefense(defense);
		const situation : Situation  = {
			user: this.user.accessor,
			target: this.user.accessor,
		};
		return def.printable(situation);
	}

	getDefense(defense: Defense) : ModifierList {
		const mods = new ModifierList();
		switch (defense) {
			case "ref": {
				mods.add("Agility Bonus", this.combatStats.baseRef());
				break;
			}
			case "will": {
				mods.add("Luck Bonus", this.combatStats.baseWill());
				break;
			}
			case "fort": {
				mods.add("Endurance Bonus", this.combatStats.baseWill());
				break;
      }
			case "kill":
				mods.add("Luck Death Resist", this.combatStats.instantDeathDefense());
				break;
			case "ail":
				mods.add("Luck Ailment Resist", this.combatStats.ailmentDefense());
				break;
			case "none":
				return mods;
			default:
				defense satisfies never;
				ui.notifications.warn(`Attmept to access nonsense Defense :${defense as string}`);
				return mods;
		}
		// const baseDef = this.#translateDefenseString(defense, this.defenses[defense]);
		// mods.add("Base Defense Bonus", baseDef);
		const otherBonuses = this.getBonuses([defense, "allDefenses"]);
		const defenseMods = this.getBonuses([defense, "allDefenses"], this.defensiveModifiers());
		return mods.concat(otherBonuses).concat(defenseMods);

	}

	#translateDefenseString(defType: keyof ValidAttackers["system"]["combat"]["defenses"], val: ValidAttackers["system"]["combat"]["defenses"]["fort"],): number {
		const weaknesses= this.#getWeaknessesInCategory(defType);
		switch (val) {
			case "pathetic": return Math.min(-4 + 2 * weaknesses,-2) ;
			case "weak": return Math.min(-2 + 1 * weaknesses, -1);
			case "normal": return 0;
			case "strong": return Math.max(2 - 1 * weaknesses, 1);
			case "ultimate": return Math.max(4 - 2 * weaknesses, 2);
			default:
				PersonaError.softFail(`Bad defense tsring ${String(val)} for ${defType}`);
				return -999;
		}
	}

	#getWeaknessesInCategory( defType: keyof ValidAttackers["system"]["combat"]["defenses"]): number {
		const damageTypes = ELEMENTAL_DEFENSE_LINK[defType];
		const weaknesses= damageTypes.filter( dt => this.resists[dt] == "weakness");
		return weaknesses.length;
	}

	get defenses(): ValidAttackers["system"]["combat"]["defenses"] {
		return this.source.system.combat.defenses;
	}

	// #emptyStatPlaceholder(): number{
	// 	// return Math.round(30 * this.level / 5);//placeholder
	// 	const statsPerLevel = PersonaCombatStats.STAT_POINTS_PER_LEVEL;
	// 	return Math.round(1 + statsPerLevel * this.level / 5);//placeholder
	// }

	get tarot() {
		return this.source.tarot;
	}

	// get combatStats() {
	// 	return this.source.system.combat.personaStats;
	// }

	get combatStats(): PersonaCombatStats {
		if (this.#combatStats == undefined) {
			this.#combatStats = new PersonaCombatStats(this);
		}
		return this.#combatStats;
	}


	passiveFocii() : Focus[] {
		return this.focii.filter( f=> f.hasPassiveEffects(this.user));
	}

	defensiveFocii(): Focus[] {
		return this.focii.filter( f=> f.hasDefensiveEffects(this.user));
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
		const effectChangers=  this.mainModifiers().filter( x=> x.getEffects(this.user)
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
						resval(cons.resistanceLevel) > resval(baseResist)) {
						resBonus = Math.max(resBonus, resval(cons.resistanceLevel) - resval(baseResist));
					}
					break;
				case "lower-resistance":
					if (cons.resistType == type &&
						resval (cons.resistanceLevel) < resval(baseResist))  {
						resPenalty = Math.min(resPenalty, resval(cons.resistanceLevel) - resval(baseResist));
					}
					break;
				default:
					break;
			}
		}
		const resLevel = Math.clamp(resval(baseResist) + resBonus + resPenalty, 0 , RESIST_STRENGTH_LIST.length-1);
		return RESIST_STRENGTH_LIST[resLevel];
	}

	static combinedPersona<T extends ValidAttackers>(basePersona: Persona<T>, attachedPersona: Persona) : Persona<T> {
		const fusedPowers = attachedPersona.powers.concat(
			basePersona.powers);
		fusedPowers.length = Math.min(6, fusedPowers.length);
		const fusedPersona = new Persona(attachedPersona.source, attachedPersona.user, fusedPowers);
		fusedPersona.user = basePersona.user;
		fusedPersona.source = attachedPersona.source;
     //I am not sure if this really persona<T> as there were errors but not sure if this ufnction is even used
		return fusedPersona as Persona<T>;
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
					// eslint-disable-next-line no-debugger
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


	get maxSideboardPowers() : number {
		if (!this.source.isValidCombatant()) {return 0;}
		switch (this.source.system.type) {
			case "npcAlly":
			case "shadow":
				return 0;
			case "pc": {
         const extraMaxPowers = this.getBonuses("extraMaxPowers");
				return extraMaxPowers
					.total ( {user: this.user.accessor});
      }
			default:
				this.source.system satisfies never;
				return -1;
		}
	}

	get maxMainPowers() : number {
		switch (this.source.system.type) {
			case "pc":
			case "npcAlly":
			case "shadow":
				return 8;
			default:
				this.source.system satisfies never;
				return -1;
		}
	}

	maxDefensiveBoosts() : number {
		const baseBoosts = this.#baseDefenseBoosts();
		const situation: Situation = {
			user: this.user.accessor,
			target: this.user.accessor,
		};
		const bonusBoosts =this.getBonuses("max-defense-boosts").total(situation);
		return baseBoosts + bonusBoosts;
	}

	#baseDefenseBoosts() : number {
		switch (this.source.system.type) {
			case "pc": return 1;
			case "shadow": return 2;
			case "npcAlly": return 1;
			default:
				this.source.system satisfies never;
				return 0;
		}
	}

	maxResists () : number {
		const baseResists = this.#baseResists();
		const situation: Situation = {
			user: this.user.accessor,
			target: this.user.accessor,
		};
		const bonusBoosts = this.getBonuses("max-resist-boosts").total(situation);
		return baseResists + bonusBoosts;
	}

	#baseResists() : number {
		switch (this.source.system.type) {
			case "pc": return -1;
			case "shadow" : return 1;
			case "npcAlly": return -1;
		}
	}

	async learnPower(pwr: Power) {
		await this.source.addPower(pwr);
	}

	get isUnderDefenseCap(): boolean {
		return this.source.totalDefenseBoosts() < this.maxDefensiveBoosts();
	}

	get isOverDefenseCap(): boolean {
		return this.source.totalDefenseBoosts() > this.maxDefensiveBoosts();
	}

	get isOverResistCap(): boolean {
		return this.source.totalResists() > this.maxResists();
	}

	wpnAtkBonus() : ModifierList {
		const mods = this.getBonuses(["allAtk", "wpnAtk"]);
		const wpnAtk = this.combatStats.baseWpnAttackBonus();
		mods.add("Base Weapon Attack Bonus", wpnAtk);
		return mods;
	}

	magAtkBonus() : ModifierList {
		const mods = this.getBonuses(["allAtk", "magAtk"]);
		const magAtk = this.combatStats.baseMagAttackBonus();
		mods.add("Base Magic Attack Bonus", magAtk);
		return mods;
	}

	instantDeathAtkBonus() : ModifierList {
		const mods = this.getBonuses(["instantDeathRange"]);
		const deathAtk = this.combatStats.baseDeathAtkBonus();
		mods.add("Base Magic Attack Bonus", deathAtk);
		return mods;
	}

	ailmentAtkBonus() :ModifierList {
		const mods = this.getBonuses("afflictionRange");
		const ailAtk = this.combatStats.baseAilmentAtkBonus();
		mods.add("Base Magic Attack Bonus", ailAtk);
		return mods;
	}

	itemAtkBonus(item :Consumable) : ModifierList {
		const mods = this.getBonuses(["itemAtk", "allAtk"]);
		mods.add("Item Base Bonus", item.system.atk_bonus);
		return mods;
	}

	get isUnderResistCap(): boolean {
		const leeway  = 0;  //allow leeway for double weakness
		return this.source.totalResists() + leeway < this.maxResists();
	}

	hpCostMod() : ModifierList {
		return this.getBonuses("hpCostMult");
	}

	canUsePower (usable: UsableAndCard, outputReason: boolean = true) : boolean {
		const user = this.user;
		if (!this.user.isAlive() && !usable.hasTag("usable-while-dead")) {return false;}
		if (!usable.isTrulyUsable()) {return false;}

		if (user.hasStatus("rage") && usable != PersonaDB.getBasicPower("Basic Attack")) {
			if (outputReason) {
				ui.notifications.warn("Can't only use basic attacks when raging");
			}
			return false;
		}
		if (user.hasPowerInhibitingStatus() && usable.system.type == "power" && !usable.isBasicPower()) {
			if (outputReason) {
				ui.notifications.warn("Can't use that power due to a status");
			}
			return false;
		}
		return this.canPayActivationCost(usable, outputReason);
	}

	canPayActivationCost(usable: UsableAndCard, outputReason: boolean = true) : boolean {
		switch (this.user.system.type) {
			case "npcAlly":
			case "pc":
				return (this as Persona<PC | NPCAlly>).canPayActivationCost_pc(usable, outputReason);
			case "shadow":
				return (this as Persona<Shadow>).canPayActivationCost_shadow(usable, outputReason);
			default:
				this.user.system satisfies never;
				throw new PersonaError("Unknown Type");
		}
	}

   canPayActivationCost_pc(this: Persona<PC | NPCAlly>, usable: UsableAndCard, _outputReason: boolean) : boolean {
      switch (usable.system.type) {
         case "power": {
            if (usable.system.tags.includes("basicatk")) {
               return true;
            }
            switch (usable.system.subtype) {
               case "weapon":
                  return  this.user.hp > (usable as Power).hpCost();
               case "magic": {
                  const mpcost = (usable as Power).mpCost(this);
                  if (mpcost > 0) {
                     return this.user.mp >= mpcost;
                  }
               }
                  break;
               case "social-link": {
                  const inspirationId = usable.system.inspirationId;
                  if (!this.user.isPC()) {return false;}
                  if (inspirationId) {
                     const socialLink = this.user.system.social.find( x=> x.linkId == inspirationId);
                     if (!socialLink) {return false;}
                     return socialLink.inspiration >= usable.system.inspirationCost;
                  } else {
                     const inspiration = this.user.system.social.reduce( (acc, item) => acc + item.inspiration , 0);
                     return inspiration >= usable.system.inspirationCost;
                  }
               }
               case "downtime": {
                  const combat = game.combat as PersonaCombat;
                  if (!combat) {return false;}
                  return combat.isSocial; 
               }
               default:
                  return true;
            }
         }
            break;
         case "consumable":
            return usable.system.amount > 0;
         case "skillCard":
            return this.user.canLearnNewSkill();
      }
      return true;
   }

	canPayActivationCost_shadow(this: Persona<Shadow>, usable: UsableAndCard, outputReason: boolean) : boolean { if (usable.system.type == "skillCard") {
		return false;
	}
		if (usable.system.type == "power") {
			const combat = game.combat;
			// if (combat && usable.system.reqEscalation > 0 && (combat as PersonaCombat).getEscalationDie() < usable.system.reqEscalation) {
			const energyRequired = usable.energyRequired(this);
			const energyCost = usable.energyCost(this);
			const currentEnergy = this.user.system.combat.energy.value;
			if (combat && energyRequired > 0 && energyRequired > currentEnergy) {
				if (outputReason) {
					ui.notifications.notify(`Requires ${energyRequired} energy and you only have ${currentEnergy}`);
				}
				return false;
			}
			if (combat && energyCost > (currentEnergy + 3)) {
				if (outputReason) {
					ui.notifications.notify(`Costs ${energyCost} energy and you only have ${currentEnergy}`);
				}
				return false;
			}
			if (usable.system.reqHealthPercentage < 100) {
				const reqHp = (usable.system.reqHealthPercentage / 100) * this.user.mhpEstimate ;
				if (this.user.hp > reqHp) {return false;}
			}
		}
		return true; //placeholder
	}


	hasTag(tag: PersonaTag) : boolean {
		return this.tagList().includes(tag);
	}

	tagList() : PersonaTag[] {
		const base = this.source.system.combat.personaTags.slice();
		if (this.source.isShadow() && this.source.system.creatureType == "daemon") {
			base.pushUnique("simulated");
		}
		return base;
	}

	wpnDamage() : NewDamageParams {
		switch (this.user.system.type) {
			case "pc": case "npcAlly": {
         const wpn = this.user.weapon;
				if (!wpn) {
					return  {baseAmt: 0, extraVariance: 0};
				}
				return wpn.baseDamage();
         }
			case "shadow":
				return {
					baseAmt: DamageCalculator.getWeaponDamageByWpnLevel(Math.floor(this.level / 10) + 1),
					extraVariance: 0
				};
			default:
				this.user.system satisfies never;
				return {baseAmt: 0, extraVariance: 0};
		}
	}

	armorDR() : number {
		if (this.user.isShadow()) {
			const DR =  DamageCalculator.getArmorDRByArmorLevel(Math.floor(this.level /10) +1);
			return DR;
		}
		const armor = this.user.equippedItems().find(x => x.isInvItem() && x.system.slot =="body") as U<InvItem>;
		return armor  != undefined ? armor.armorDR() : 0;
	}


	getBonusWpnDamage() : ModifierList {
		return this.getBonuses("wpnDmg");
	}

	getBonusVariance() : ModifierList {
		return this.getBonuses("variance");
	}

	async levelUp_manual() {
		const level = this.source.system.combat.personaStats.pLevel;
		const currXP = this.source.system.combat.personaStats.xp;
		const XPForNext = LevelUpCalculator.minXPForEffectiveLevel(level + 1);
		const XPNeeded = XPForNext - currXP;
		console.log(`${this.name} XP needed: ${XPNeeded}`);
		await this.awardXP(XPNeeded, false);
	}

}


interface PersonaClassCache {
	mainModifiers: U<readonly ModifierContainer[]>;
	passivePowers: U<readonly Power[]>;
	defensivePowers: U<readonly ModifierContainer[]>;
}
